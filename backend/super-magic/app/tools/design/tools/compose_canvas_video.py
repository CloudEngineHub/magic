"""按 Video Edit 顺序合成最终 MP4 工具。"""

import asyncio
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Optional
from uuid import uuid4

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.context.agent_context import AgentContext
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.core.tool_keepalive import start_tool_keep_alive, stop_tool_keep_alive
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.tools.design.video_production.adapters.ffmpeg_video_composition_adapter import (
    FfmpegVideoCompositionAdapter,
)
from app.tools.design.video_production.ports.video_composition_port import (
    VideoCompositionRequest,
)
from app.tools.design.video_production.service.composition_service import (
    CompositionPreparation,
    VideoCompositionService,
)
from app.utils.async_file_utils import async_exists, async_stat


class ComposeCanvasVideoParams(BaseToolParams):
    """最终 MP4 合成参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    video_edit_element_id: str = Field(
        ...,
        description="Confirmed Video Edit Element whose main Content defines composition order.",
    )
    result_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Specific final Video Element name in the user's language.",
    )
    result_element_id: Optional[str] = Field(
        default=None,
        description="Existing final Video Element ID. Omit to create a new result Element.",
    )


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class ComposeCanvasVideo(BaseVideoProductionTool[ComposeCanvasVideoParams]):
    """创建结果视频 Content，并按既定顺序生成基础 H.264/AAC MP4。"""

    action_key = "compose_canvas_video"
    success_message_key = "compose_canvas_video.success"
    failure_message_key = "compose_canvas_video.exception"

    def __init__(self, **data: Any):
        """初始化合成服务和 FFmpeg 适配器。"""
        super().__init__(**data)
        self._composition_service = VideoCompositionService()
        self._composition_adapter = FfmpegVideoCompositionAdapter()

    async def execute(
        self,
        tool_context: ToolContext,
        params: ComposeCanvasVideoParams,
    ) -> ToolResult:
        """创建 processing 结果，执行合成并把最终状态写回画布。"""
        preparation: Optional[CompositionPreparation] = None
        resolved_project_path: Optional[Path] = None
        try:
            resolved_project_path, manager, error_result = await self._get_canvas_manager(
                params.project_path,
                tool_context=tool_context,
            )
            if error_result is not None or resolved_project_path is None or manager is None:
                return error_result or ToolResult.error("Canvas project validation failed.")

            current = await manager.read_current_canvas()
            input_spec = self._composition_service.inspect_inputs(
                current.canvas,
                params.video_edit_element_id,
            )
            await self._validate_media_files(resolved_project_path, input_spec.video_sources)
            if input_spec.audio_source:
                await self._validate_media_files(resolved_project_path, [input_spec.audio_source])

            output_file_name = (
                f"{self._sanitize_filename(params.result_name, max_length=120)}-{uuid4().hex[:8]}.mp4"
            )
            relative_output_path = f"./videos/{output_file_name}"

            def prepare(config: Any) -> CompositionPreparation:
                """在画布事务内重新校验输入并创建 processing Content。"""
                return self._composition_service.prepare_result(
                    config.canvas,
                    video_edit_element_id=params.video_edit_element_id,
                    result_name=params.result_name,
                    result_element_id=params.result_element_id,
                    relative_output_path=relative_output_path,
                )

            preparation, write_error = await self._run_canvas_write(
                tool_context,
                params.project_path,
                prepare,
            )
            if write_error is not None:
                return write_error
            assert preparation is not None

            video_paths = [
                self._resolve_project_media_path(resolved_project_path, source)
                for source in preparation.input_spec.video_sources
            ]
            audio_path = (
                self._resolve_project_media_path(
                    resolved_project_path,
                    preparation.input_spec.audio_source,
                )
                if preparation.input_spec.audio_source
                else None
            )
            await self._validate_absolute_media_paths(video_paths)
            if audio_path is not None:
                await self._validate_absolute_media_paths([audio_path])

            interruption_event = self._get_interruption_event(tool_context)
            keep_alive_task = start_tool_keep_alive(tool_context)
            try:
                composition_result = await self._composition_adapter.compose(
                    VideoCompositionRequest(
                        video_paths=video_paths,
                        audio_path=audio_path,
                        output_path=self._resolve_project_media_path(
                            resolved_project_path,
                            relative_output_path,
                        ),
                        width=preparation.input_spec.output_width,
                        height=preparation.input_spec.output_height,
                    ),
                    interruption_event=interruption_event,
                )
            finally:
                stop_tool_keep_alive(keep_alive_task)

            def complete(config: Any) -> str:
                """把完成状态和最终 src 写回指定结果 Content。"""
                self._composition_service.mark_completed(config.canvas, preparation)
                return preparation.result_content_id

            _, write_error = await self._run_canvas_write(
                tool_context,
                params.project_path,
                complete,
            )
            if write_error is not None:
                return write_error
            return ToolResult(
                content=(
                    f'Final MP4 was created at "{relative_output_path}". '
                    f'Result Element ID: "{preparation.result_element_id}". '
                    f'Content ID: "{preparation.result_content_id}". '
                    f'Duration: {composition_result.duration_seconds:.2f} seconds. '
                    f'Dimensions: {composition_result.width}x{composition_result.height}. '
                    f'Audio included: {"yes" if composition_result.has_audio else "no"}.'
                ),
                data={
                    "result_element_id": preparation.result_element_id,
                    "result_content_id": preparation.result_content_id,
                    "src": relative_output_path,
                    "width": composition_result.width,
                    "height": composition_result.height,
                    "duration_seconds": composition_result.duration_seconds,
                    "has_audio": composition_result.has_audio,
                },
            )
        except asyncio.CancelledError:
            if preparation is not None:
                await self._mark_failed(
                    tool_context,
                    params.project_path,
                    preparation,
                    "Video composition was cancelled by the user.",
                )
            raise
        except Exception as error:
            if preparation is not None:
                await self._mark_failed(
                    tool_context,
                    params.project_path,
                    preparation,
                    "Video composition failed. Check the input media and try again.",
                )
            message = str(error)
            if resolved_project_path is not None:
                message = message.replace(str(resolved_project_path), params.project_path)
            return ToolResult.error(
                f"Video composition failed: {message}",
                extra_info={"error_type": "video_composition.failed"},
            )

    async def _mark_failed(
        self,
        tool_context: ToolContext,
        project_path: str,
        preparation: CompositionPreparation,
        error_message: str,
    ) -> None:
        """尽力把已创建的结果 Content 标记为失败。"""
        try:
            def fail(config: Any) -> str:
                """在画布事务内写入精简失败状态。"""
                self._composition_service.mark_failed(
                    config.canvas,
                    preparation,
                    error_message,
                )
                return preparation.result_content_id

            await self._run_canvas_write(tool_context, project_path, fail)
        except Exception:
            return

    async def _validate_media_files(self, project_path: Path, sources: list[str]) -> None:
        """校验一组项目相对媒体路径存在且非空。"""
        await self._validate_absolute_media_paths(
            [self._resolve_project_media_path(project_path, source) for source in sources]
        )

    @staticmethod
    async def _validate_absolute_media_paths(paths: list[Path]) -> None:
        """校验绝对媒体文件存在且不是空文件。"""
        for media_path in paths:
            if not await async_exists(media_path) or (await async_stat(media_path)).st_size <= 0:
                raise ValueError(f"Composition input file does not exist or is empty: {media_path}")

    @staticmethod
    def _resolve_project_media_path(project_path: Path, src: str) -> Path:
        """把安全的项目相对 src 解析为绝对路径。"""
        normalized = src.strip().replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        relative_path = PurePosixPath(normalized)
        if relative_path.is_absolute() or not relative_path.parts or ".." in relative_path.parts:
            raise ValueError("Media src must be a safe project-relative path")
        return project_path / relative_path

    @staticmethod
    def _get_interruption_event(tool_context: Optional[ToolContext]) -> Optional[asyncio.Event]:
        """从工具上下文读取用户中断事件。"""
        if tool_context is None:
            return None
        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        return agent_context.get_interruption_event() if agent_context is not None else None

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在根据哪个编辑方案合成成片。"""
        values = arguments or {}
        result_name = values.get("result_name") or VideoProductionMarkdownPresenter.message(
            "compose_canvas_video.unnamed"
        )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.before",
                name=result_name,
                video_edit_element_id=values.get("video_edit_element_id"),
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
        """向用户汇总最终 MP4 的路径、时长和尺寸。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        if result.ok:
            remark = VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.after_success",
                src=data.get("src"),
                duration=f"{float(data.get('duration_seconds') or 0):.2f}",
            )
        else:
            remark = VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.after_failure",
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
        """以 Markdown 展示最终 MP4 的文件与媒体信息。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        result_name = values.get("result_name") or VideoProductionMarkdownPresenter.message(
            "compose_canvas_video.unnamed"
        )
        lines = [
            VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.detail_name",
                name=result_name,
            ),
            VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            ),
            VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.detail_video_edit",
                element_id=VideoProductionMarkdownPresenter.code(
                    values.get("video_edit_element_id")
                ),
            ),
        ]
        if result.ok:
            audio_label = VideoProductionMarkdownPresenter.message(
                "compose_canvas_video.yes" if data.get("has_audio") else "compose_canvas_video.no"
            )
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "compose_canvas_video.detail_src",
                        src=VideoProductionMarkdownPresenter.code(data.get("src")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "compose_canvas_video.detail_dimensions",
                        width=data.get("width", 0),
                        height=data.get("height", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "compose_canvas_video.detail_duration",
                        duration=f"{float(data.get('duration_seconds') or 0):.2f}",
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "compose_canvas_video.detail_audio",
                        value=audio_label,
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "compose_canvas_video.detail_element_id",
                        element_id=VideoProductionMarkdownPresenter.code(
                            data.get("result_element_id")
                        ),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "compose_canvas_video.detail_content_id",
                        content_id=VideoProductionMarkdownPresenter.code(
                            data.get("result_content_id")
                        ),
                    ),
                ]
            )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "compose_canvas_video.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "compose_canvas_video.md",
            VideoProductionMarkdownPresenter.message("compose_canvas_video.detail_title"),
            lines,
        )
