"""视频制作专用图片生成工具。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
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
from app.tools.design.video_production.service.media_generation_service import (
    MediaSourceInput,
    MediaSourceType,
)
from app.tools.design.video_production.service.source_connection_finalizer import (
    SourceConnectionGenerationFinalizer,
)
from app.tools.design.video_production.service.storyboard_generation_config_service import (
    StoryboardGenerationConfig,
    StoryboardGenerationConfigService,
)
from app.tools.snippet_timeout_registry import SdkSnippetTimeoutRegistry

SdkSnippetTimeoutRegistry.register("generate_video_production_images", min_timeout=600)


class VideoProductionImageTask(BaseModel):
    """视频制作中的单张图片生成任务，不暴露 Canvas 维护字段。"""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., description="Image generation prompt.")
    name: str = Field(..., description="Specific image Element name in the user's language.")
    size: Optional[str] = Field(default=None, description="Output size in WxH format.")
    reference_images: list[str] = Field(
        default_factory=list,
        description="Reference image paths from project files, uploads, or earlier tool results.",
    )
    element_id: Optional[str] = Field(default=None, description="Existing canvas Element ID to reuse.")
    content_id: Optional[str] = Field(
        default=None,
        description="Content ID to update or continue using. May be supplied together with element_id.",
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


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class GenerateVideoProductionImages(BaseVideoProductionMediaTool[GenerateVideoProductionImagesParams]):
    """生成视频制作图片，并内部维护参考素材到结果的 Canvas 关系。"""

    action_key = "generate_video_production_images"
    success_message_key = "generate_video_production_images.success"
    failure_message_key = "generate_video_production_images.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: GenerateVideoProductionImagesParams,
    ) -> ToolResult:
        """解析参考来源、委托通用图片生成并在成功后建立内部连接。"""
        try:
            resolved_project_path, manager, error_result = await self._get_canvas_manager(
                params.project_path,
                tool_context=tool_context,
            )
            if error_result is not None or resolved_project_path is None or manager is None:
                return error_result or ToolResult.error("Canvas project validation failed.")

            storyboard_generation_config: Optional[StoryboardGenerationConfig] = None
            if params.storyboard_element_id:
                current_config = await manager.read_current_canvas()
                storyboard_generation_config = StoryboardGenerationConfigService.read_from_storyboard(
                    current_config.canvas,
                    params.storyboard_element_id,
                    tool_context,
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
                            **task.model_dump(exclude={"reference_images"}),
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
            finalizer = SourceConnectionGenerationFinalizer(
                manager,
                prepared_sources_by_task,
                enabled=manager.supports_connections,
            )
            result = await GenerateCanvasImages(
                generation_finalizer=finalizer,
                image_model_id=(
                    storyboard_generation_config.image_model_id
                    if storyboard_generation_config is not None
                    else None
                ),
                base_dir=self.base_dir,
            ).execute(tool_context, inner_params)
            result = self._merge_connections(result, finalizer.get_connections())
            if storyboard_generation_config is not None:
                result.data = {
                    **(result.data or {}),
                    "storyboard_element_id": params.storyboard_element_id,
                    "generation_config": storyboard_generation_config.to_result_data(),
                }
                result.content = self._append_storyboard_settings(
                    result.content,
                    params.storyboard_element_id,
                    storyboard_generation_config,
                )
            return result
        except Exception as error:
            return ToolResult.error(
                f"Video production image generation failed: {error}",
                extra_info={"error_type": "video_production.media_generation_failed"},
            )

    @staticmethod
    def _append_storyboard_settings(
        content: str,
        storyboard_element_id: Optional[str],
        config: StoryboardGenerationConfig,
    ) -> str:
        """把本次实际采用的分镜图片设置追加到模型结果。"""
        return (
            f"{content}\n\nApplied Storyboard Image Settings:\n"
            f'- storyboard_element_id: "{storyboard_element_id}"\n'
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
        summary = separator.join(f"**{name}**" for name in names[:3])
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
