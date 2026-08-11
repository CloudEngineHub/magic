"""视频制作专用视频生成工具。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.tools.generate_canvas_videos import (
    GenerateCanvasVideos,
    GenerateCanvasVideosParams,
    VideoTaskSpec,
)
from app.tools.design.tools.video_production_media_base import BaseVideoProductionMediaTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.tools.design.video_production.service.media_generation_service import (
    MediaSourceInput,
    MediaSourceType,
    PreparedMediaSource,
)
from app.tools.design.video_production.service.video_production_generation_initializer import (
    VideoProductionGenerationInitializer,
)
from app.tools.snippet_timeout_registry import SdkSnippetTimeoutRegistry

SdkSnippetTimeoutRegistry.register("generate_video_production_videos", min_timeout=600)


class VideoProductionVideoTask(BaseModel):
    """视频制作中的单个视频任务，不包含 Canvas 关系和布局字段。"""

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., description="Video generation prompt.")
    name: str = Field(..., description="Specific video Element name in the user's language.")
    aspect_ratio: Optional[str] = Field(default=None, description="Video aspect ratio.")
    input_mode: str = Field(default="", description="Video model input mode.")
    task: str = Field(default="generate", description="Video generation task type.")
    reference_image_paths: list[str] = Field(
        default_factory=list,
        description="Reference image paths from project files, uploads, or earlier tool results.",
    )
    reference_video_paths: list[str] = Field(
        default_factory=list,
        description="Reference video paths from project files, uploads, or earlier tool results.",
    )
    reference_audio_paths: list[str] = Field(
        default_factory=list,
        description="Reference audio paths from project files, uploads, or earlier tool results.",
    )
    frame_start_path: str = Field(
        default="",
        description="First-frame image path from a project file, upload, or earlier tool result.",
    )
    frame_end_path: str = Field(
        default="",
        description="Last-frame image path from a project file, upload, or earlier tool result.",
    )
    duration_seconds: Optional[int] = Field(default=None, description="Video duration in seconds.")
    resolution: Optional[str] = Field(default=None, description="Video resolution tier.")
    fps: Optional[int] = Field(default=None, description="Video FPS.")
    seed: Optional[int] = Field(default=None, description="Random seed.")
    watermark: Optional[bool] = Field(default=None, description="Whether to keep watermark.")
    extensions: dict[str, Any] = Field(default_factory=dict, description="Model extension parameters.")
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


class GenerateVideoProductionVideosParams(BaseToolParams):
    """视频制作专用视频生成参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    tasks: list[VideoProductionVideoTask] = Field(..., min_length=1, max_length=4)
    model_id: str = Field(default="", description="Optional video model ID shared by all tasks.")


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class GenerateVideoProductionVideos(BaseVideoProductionMediaTool[GenerateVideoProductionVideosParams]):
    """生成视频制作镜头，并固定新增视频节点布局。"""

    action_key = "generate_video_production_videos"
    success_message_key = "generate_video_production_videos.success"
    failure_message_key = "generate_video_production_videos.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: GenerateVideoProductionVideosParams,
    ) -> ToolResult:
        """解析参考路径、预占画布目标并委托通用视频生成。"""
        try:
            resolved_project_path, manager, error_result = await self._get_canvas_manager(
                params.project_path,
                tool_context=tool_context,
            )
            if error_result is not None or resolved_project_path is None or manager is None:
                return error_result or ToolResult.error("Canvas project validation failed.")

            prepared_sources_by_task: list[list[PreparedMediaSource]] = []
            normalized_tasks: list[VideoTaskSpec] = []
            for task in params.tasks:
                source_inputs = [
                    *[
                        MediaSourceInput(path=path, media_type=MediaSourceType.IMAGE)
                        for path in task.reference_image_paths
                    ],
                    *[
                        MediaSourceInput(path=path, media_type=MediaSourceType.VIDEO)
                        for path in task.reference_video_paths
                    ],
                    *[
                        MediaSourceInput(path=path, media_type=MediaSourceType.AUDIO)
                        for path in task.reference_audio_paths
                    ],
                ]
                if task.frame_start_path:
                    source_inputs.append(
                        MediaSourceInput(
                            path=task.frame_start_path,
                            media_type=MediaSourceType.IMAGE,
                        )
                    )
                if task.frame_end_path:
                    source_inputs.append(
                        MediaSourceInput(
                            path=task.frame_end_path,
                            media_type=MediaSourceType.IMAGE,
                        )
                    )
                prepared_sources = await self._prepare_source_references(
                    manager,
                    resolved_project_path,
                    tool_context,
                    source_inputs,
                )
                prepared_sources_by_task.append(prepared_sources)
                normalized_tasks.append(
                    self._build_generation_task(task, source_inputs, prepared_sources)
                )

            inner_params = GenerateCanvasVideosParams(
                project_path=params.project_path,
                model_id=params.model_id,
                tasks=normalized_tasks,
            )
            initializer = VideoProductionGenerationInitializer()
            result = await GenerateCanvasVideos(
                generation_initializer=initializer,
                base_dir=self.base_dir,
            ).execute(tool_context, inner_params)
            return self._merge_connections(result, initializer.get_connections())
        except Exception as error:
            return ToolResult.error(
                f"Video production video generation failed: {error}",
                extra_info={"error_type": "video_production.media_generation_failed"},
            )

    @staticmethod
    def _build_generation_task(
        task: VideoProductionVideoTask,
        source_inputs: list[MediaSourceInput],
        prepared_sources: list[PreparedMediaSource],
    ) -> VideoTaskSpec:
        """把模型输入路径替换为后端准备后的稳定工作区路径。"""
        paths_by_key: dict[tuple[MediaSourceType, str], str] = {}
        for source_input, prepared_source in zip(source_inputs, prepared_sources, strict=True):
            paths_by_key[(source_input.media_type, source_input.path)] = prepared_source.generation_path

        values = task.model_dump()
        values["reference_image_paths"] = [
            paths_by_key[(MediaSourceType.IMAGE, path)]
            for path in task.reference_image_paths
        ]
        values["reference_video_paths"] = [
            paths_by_key[(MediaSourceType.VIDEO, path)]
            for path in task.reference_video_paths
        ]
        values["reference_audio_paths"] = [
            paths_by_key[(MediaSourceType.AUDIO, path)]
            for path in task.reference_audio_paths
        ]
        values["frame_start_path"] = (
            paths_by_key[(MediaSourceType.IMAGE, task.frame_start_path)]
            if task.frame_start_path
            else ""
        )
        values["frame_end_path"] = (
            paths_by_key[(MediaSourceType.IMAGE, task.frame_end_path)]
            if task.frame_end_path
            else ""
        )
        return VideoTaskSpec(**values)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在生成的视频镜头。"""
        tasks = list((arguments or {}).get("tasks") or [])
        names = [
            str(
                task.get("name")
                or VideoProductionMarkdownPresenter.message(
                    "generate_video_production_videos.unnamed"
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
                "generate_video_production_videos.before_more",
                summary=summary,
                count=len(names),
            )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "generate_video_production_videos.before",
                summary=summary
                or VideoProductionMarkdownPresenter.message(
                    "generate_video_production_videos.empty"
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
        """向用户汇总镜头任务和素材连线结果。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        if result.ok:
            remark = VideoProductionMarkdownPresenter.message(
                "generate_video_production_videos.after_success",
                succeeded_count=data.get("succeeded_count", 0),
                failed_count=data.get("failed_count", 0),
                connection_count=len(data.get("connections") or []),
            )
        else:
            remark = VideoProductionMarkdownPresenter.message(
                "generate_video_production_videos.after_failure",
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
        """以 Markdown 展示镜头生成状态和结果节点。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        lines = [
            VideoProductionMarkdownPresenter.message(
                "generate_video_production_videos.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            ),
            VideoProductionMarkdownPresenter.message(
                "generate_video_production_videos.detail_task_count",
                count=len(values.get("tasks") or []),
            ),
        ]
        if result.ok:
            elements = list(data.get("created_elements") or [])
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "generate_video_production_videos.detail_submitted",
                        count=data.get("succeeded_count", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "generate_video_production_videos.detail_failed",
                        count=data.get("failed_count", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "generate_video_production_videos.detail_connections",
                        count=len(data.get("connections") or []),
                    ),
                ]
            )
            if elements:
                lines.extend(
                    [
                        "",
                        VideoProductionMarkdownPresenter.message(
                            "generate_video_production_videos.detail_results_heading"
                        ),
                    ]
                )
                for element in elements:
                    name = element.get("name") or VideoProductionMarkdownPresenter.message(
                        "generate_video_production_videos.unnamed"
                    )
                    element_id = VideoProductionMarkdownPresenter.code(
                        element.get("element_id") or element.get("id")
                    )
                    content_id = VideoProductionMarkdownPresenter.code(element.get("content_id"))
                    status = VideoProductionMarkdownPresenter.code(
                        element.get("status")
                        or VideoProductionMarkdownPresenter.message(
                            "generate_video_production_videos.submitted"
                        )
                    )
                    lines.append(
                        VideoProductionMarkdownPresenter.message(
                            "generate_video_production_videos.detail_element",
                            name=name,
                            element_id=element_id,
                            content_id=content_id,
                            status=status,
                        )
                    )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "generate_video_production_videos.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "generate_video_production_videos.md",
            VideoProductionMarkdownPresenter.message(
                "generate_video_production_videos.detail_title"
            ),
            lines,
        )
