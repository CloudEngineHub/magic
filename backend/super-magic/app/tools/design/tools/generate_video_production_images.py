"""视频制作专用图片生成工具。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.design.tools.generate_canvas_images import (
    GenerateCanvasImages,
    GenerateCanvasImagesParams,
    ImageTaskSpec,
)
from app.tools.design.tools.video_production_media_base import BaseVideoProductionMediaTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.tools.design.video_production.service.explicit_source_generation_initializer import (
    ExplicitSourceGenerationInitializer,
)
from app.tools.design.video_production.service.media_generation_service import (
    MediaSourceInput,
    MediaSourceType,
)
from app.tools.design.video_production.service.storyboard_generation_config_service import (
    StoryboardGenerationConfig,
    StoryboardGenerationConfigService,
)
from app.tools.design.video_production.service.storyboard_image_generation_initializer import (
    StoryboardImageGenerationInitializer,
)
from app.tools.snippet_timeout_registry import SdkSnippetTimeoutRegistry

SdkSnippetTimeoutRegistry.register("generate_video_production_images", min_timeout=600)


class VideoProductionImageTask(BaseModel):
    """视频制作中的单张图片生成任务，只声明生成内容和直接上游。"""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., description="Image generation prompt.")
    name: str = Field(..., description="Specific image Element name in the user's language.")
    size: Optional[str] = Field(default=None, description="Output size in WxH format.")
    reference_images: list[str] = Field(
        default_factory=list,
        description="Reference image paths from project files, uploads, or earlier tool results.",
    )
    source_element_ids: Optional[list[str]] = Field(
        default=None,
        max_length=20,
        description=(
            "Direct upstream Canvas Element IDs for this generated image. Omit to preserve existing "
            "relations when updating an Element; pass an empty list to clear managed upstream relations."
        ),
    )
    shot_id: Optional[str] = Field(
        default=None,
        description="Storyboard shot ID that this image represents. Use it for storyboard first frames.",
    )
    element_id: Optional[str] = Field(
        default=None,
        description="Existing canvas Element ID. Passing it alone appends a new Content to that Element.",
    )
    content_id: Optional[str] = Field(
        default=None,
        description=(
            "Existing Content ID to retry or update. It must exist and, when element_id is also supplied, "
            "must belong to that Element."
        ),
    )
    set_as_main: bool = Field(
        default=False,
        description="Make the newly completed Content the main Content immediately. Keep false for UI confirmation.",
    )

    @model_validator(mode="before")
    @classmethod
    def fill_reference_images(cls, value: Any) -> Any:
        """兼容调用方省略空参考图列表的写法。"""
        if isinstance(value, dict) and "reference_images" not in value:
            value = dict(value)
            value["reference_images"] = []
        return value


class GenerateVideoProductionImagesParams(BaseToolParams):
    """视频制作专用图片生成参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    storyboard_element_id: Optional[str] = Field(
        default=None,
        description=(
            "Storyboard Element whose current image model, aspect ratio, and resolution apply to all tasks. "
            "Use this for storyboard first-frame generation."
        ),
    )
    tasks: list[VideoProductionImageTask] = Field(..., min_length=1, max_length=6)

    @model_validator(mode="after")
    def validate_storyboard_shots(self) -> "GenerateVideoProductionImagesParams":
        """确保分镜图片任务具有明确且不重复的镜头归属。"""
        shot_ids = [task.shot_id for task in self.tasks]
        if self.storyboard_element_id:
            if any(not shot_id for shot_id in shot_ids):
                raise ValueError(
                    "shot_id is required for every task when storyboard_element_id is provided"
                )
            normalized_shot_ids = [str(shot_id) for shot_id in shot_ids]
            if len(set(normalized_shot_ids)) != len(normalized_shot_ids):
                raise ValueError("shot_id must be unique within one storyboard image call")
        elif any(shot_id for shot_id in shot_ids):
            raise ValueError("storyboard_element_id is required when shot_id is provided")
        return self


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class GenerateVideoProductionImages(BaseVideoProductionMediaTool[GenerateVideoProductionImagesParams]):
    """生成视频制作图片，并在分镜场景中绑定镜头输出。"""

    action_key = "generate_video_production_images"
    success_message_key = "generate_video_production_images.success"
    failure_message_key = "generate_video_production_images.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: GenerateVideoProductionImagesParams,
    ) -> ToolResult:
        """解析参考路径、预占画布目标并委托通用图片生成。"""
        try:
            resolved_project_path, manager, error_result = await self._get_canvas_manager(
                params.project_path,
                tool_context=tool_context,
            )
            if error_result is not None or resolved_project_path is None or manager is None:
                return error_result or ToolResult.error("Canvas project validation failed.")

            storyboard_generation_config: Optional[StoryboardGenerationConfig] = None
            prepared_storyboard_shots = None
            if params.storyboard_element_id:
                current_config = await manager.read_current_canvas()
                storyboard_generation_config = StoryboardGenerationConfigService.read_from_storyboard(
                    current_config.canvas,
                    params.storyboard_element_id,
                    tool_context,
                )
                prepared_storyboard_shots = (
                    StoryboardImageGenerationInitializer.prepare_storyboard_shots(
                        current_config.canvas,
                        params.storyboard_element_id,
                        [str(task.shot_id) for task in params.tasks],
                    )
                )

            prepared_sources_by_task = []
            for task in params.tasks:
                prepared_sources_by_task.append(
                    await self._prepare_source_references(
                        manager,
                        resolved_project_path,
                        tool_context,
                        [
                            MediaSourceInput(path=path, media_type=MediaSourceType.IMAGE)
                            for path in task.reference_images
                        ],
                    )
                )

            inner_params = GenerateCanvasImagesParams(
                project_path=params.project_path,
                tasks=[
                    ImageTaskSpec(
                        **{
                            **task.model_dump(
                                exclude={"reference_images", "shot_id", "source_element_ids"}
                            ),
                            "reference_images": [
                                source.generation_path
                                for source in prepared_sources_by_task[index]
                            ],
                            **(
                                {"size": storyboard_generation_config.size}
                                if storyboard_generation_config is not None
                                else {}
                            ),
                        }
                    )
                    for index, task in enumerate(params.tasks)
                ],
            )
            if prepared_storyboard_shots is not None:
                initializer = StoryboardImageGenerationInitializer(
                    prepared_storyboard_shots,
                )
            else:
                initializer = ExplicitSourceGenerationInitializer(
                    [task.source_element_ids for task in params.tasks],
                )
            result = await GenerateCanvasImages(
                generation_initializer=initializer,
                image_model_id=(
                    storyboard_generation_config.image_model_id
                    if storyboard_generation_config is not None
                    else None
                ),
                base_dir=self.base_dir,
            ).execute(tool_context, inner_params)
            result = self._merge_connections(result, initializer.get_connections())
            if storyboard_generation_config is not None:
                self._append_storyboard_shot_results(
                    result,
                    params.tasks,
                )
                result.data = {
                    **(result.data or {}),
                    "storyboard_element_id": params.storyboard_element_id,
                    "generation_config": storyboard_generation_config.to_result_data(),
                }
                result.content = self._append_storyboard_settings(
                    result.content,
                    params.storyboard_element_id,
                    storyboard_generation_config,
                    [str(task.shot_id) for task in params.tasks],
                )
            return result
        except Exception as error:
            return ToolResult.error(
                f"Video production image generation failed: {error}",
                extra_info={"error_type": "video_production.media_generation_failed"},
            )

    @staticmethod
    def _append_storyboard_shot_results(
        result: ToolResult,
        tasks: list[VideoProductionImageTask],
    ) -> None:
        """把每个镜头的生成状态和图片节点 ID补充到模型可读结果。"""
        data = result.data if isinstance(result.data, dict) else {}
        elements = list(data.get("created_elements") or [])
        shot_results: list[dict[str, Any]] = []
        for index, task in enumerate(tasks):
            element = elements[index] if index < len(elements) else {}
            element_id = element.get("id") or element.get("element_id")
            content_id = element.get("content_id")
            completed = bool(element.get("src"))
            shot_results.append(
                {
                    "shot_id": task.shot_id,
                    "status": "completed" if completed else "failed",
                    "element_id": element_id,
                    "content_id": content_id,
                }
            )
        succeeded_shot_ids = [
            item["shot_id"]
            for item in shot_results
            if item["status"] == "completed"
        ]
        missing_shot_ids = [
            item["shot_id"]
            for item in shot_results
            if item["status"] != "completed"
        ]
        data["shot_results"] = shot_results
        data["requested_shot_count"] = len(shot_results)
        data["bound_shot_count"] = len(succeeded_shot_ids)
        data["missing_shot_ids"] = missing_shot_ids
        result.data = data

        heading = "分镜镜头结果" if i18n.get_language() == "zh_CN" else "Storyboard shot results"
        summary_label = "已绑定" if i18n.get_language() == "zh_CN" else "bound"
        missing_label = "缺失镜头" if i18n.get_language() == "zh_CN" else "missing_shot_ids"
        lines = [
            f"\n\n{heading}:",
            f'- requested_shot_count: {len(shot_results)}',
            f'- {summary_label}_shot_count: {len(succeeded_shot_ids)}',
            f'- {missing_label}: {", ".join(missing_shot_ids) if missing_shot_ids else "none"}',
        ]
        for item in shot_results:
            line = (
                f'- shot_id="{item["shot_id"]}", status="{item["status"]}"'
            )
            if item["element_id"]:
                line += f', element_id="{item["element_id"]}"'
            if item["content_id"]:
                line += f', content_id="{item["content_id"]}"'
            lines.append(line)
        result.content += "\n".join(lines)

    @staticmethod
    def _append_storyboard_settings(
        content: str,
        storyboard_element_id: Optional[str],
        config: StoryboardGenerationConfig,
        shot_ids: list[str],
    ) -> str:
        """把本次实际采用的分镜图片设置和镜头归属追加到模型结果。"""
        label = "视频分镜" if i18n.get_language() == "zh_CN" else "Video storyboard"
        settings_label = "视频分镜图片设置" if i18n.get_language() == "zh_CN" else "Video storyboard image settings"
        return (
            f"{content.replace('Storyboard', label)}\n\n{settings_label}:\n"
            f'- storyboard_element_id: "{storyboard_element_id}"\n'
            f'- shot_ids: "{", ".join(shot_ids)}"\n'
            f'- model_id: "{config.image_model_id}"\n'
            f'- aspect_ratio: "{config.aspect_ratio}"\n'
            f'- resolution: "{config.resolution}"\n'
            f'- size: "{config.size}"'
        )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在生成的视频素材图片。"""
        tasks = list((arguments or {}).get("tasks") or [])
        names = [
            str(
                task.get("name")
                or VideoProductionMarkdownPresenter.message(
                    "generate_video_production_images.unnamed"
                )
            )
            for task in tasks
        ]
        separator = VideoProductionMarkdownPresenter.message(
            "video_production.list_separator"
        )
        summary = separator.join(names[:3])
        if len(names) > 3:
            summary = VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.before_more",
                summary=summary,
                count=len(names),
            )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.before",
                summary=summary
                or VideoProductionMarkdownPresenter.message(
                    "generate_video_production_images.empty"
                ),
            ),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户汇总图片成功、失败和来源连线数量。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        if result.ok:
            remark = VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.after_success",
                succeeded_count=data.get("succeeded_count", 0),
                failed_count=data.get("failed_count", 0),
                connection_count=len(data.get("connections") or []),
            )
        else:
            remark = VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.after_failure",
                failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
            )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": remark,
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> ToolDetail:
        """以 Markdown 展示图片生成任务和结果节点。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        lines = [
            VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            ),
            VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.detail_task_count",
                count=len(values.get("tasks") or []),
            ),
        ]
        if result.ok:
            elements = list(data.get("created_elements") or [])
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "generate_video_production_images.detail_success",
                        count=data.get("succeeded_count", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "generate_video_production_images.detail_failed",
                        count=data.get("failed_count", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "generate_video_production_images.detail_connections",
                        count=len(data.get("connections") or []),
                    ),
                ]
            )
            if elements:
                lines.extend(
                    [
                        "",
                        VideoProductionMarkdownPresenter.message(
                            "generate_video_production_images.detail_results_heading"
                        ),
                    ]
                )
                for element in elements:
                    name = element.get("name") or VideoProductionMarkdownPresenter.message(
                        "generate_video_production_images.unnamed"
                    )
                    element_id = VideoProductionMarkdownPresenter.code(
                        element.get("id") or element.get("element_id")
                    )
                    content_id = VideoProductionMarkdownPresenter.code(element.get("content_id"))
                    lines.append(
                        VideoProductionMarkdownPresenter.message(
                            "generate_video_production_images.detail_element",
                            name=name,
                            element_id=element_id,
                            content_id=content_id,
                        )
                    )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "generate_video_production_images.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "generate_video_production_images.md",
            VideoProductionMarkdownPresenter.message(
                "generate_video_production_images.detail_title"
            ),
            lines,
        )
