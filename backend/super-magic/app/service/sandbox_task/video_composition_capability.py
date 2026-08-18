"""视频合成沙箱任务能力。"""

import asyncio
from pathlib import Path
from typing import Any, Awaitable, Callable

from app.path_manager import PathManager
from app.service.file_service import FileService
from app.service.sandbox_task.models import SandboxTask, SandboxTaskStatus
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.video_production.adapters.ffmpeg_video_composition_adapter import (
    FfmpegVideoCompositionAdapter,
)
from app.tools.design.video_production.ports.video_composition_port import VideoCompositionRequest
from app.tools.design.video_production.service.composition_service import VideoCompositionService


class VideoCompositionCapability:
    """在当前沙箱工作区内完成一次 Canvas Video Edit 合成。"""

    def __init__(self) -> None:
        """初始化画布服务和 FFmpeg 适配器。"""
        self._composition_service = VideoCompositionService()
        self._adapter = FfmpegVideoCompositionAdapter()

    async def execute(
        self,
        task: SandboxTask,
        update_status: Callable[[SandboxTaskStatus], Awaitable[None]],
    ) -> dict[str, Any]:
        """读取画布并生成 MP4 文件，不修改 Canvas Element 或 Content。"""
        await update_status(SandboxTaskStatus.PREPARING)
        project_path = self._resolve_project_path(task.project_path)
        manager = await get_canvas_manager(str(project_path))
        current = await manager.read_current_canvas()
        video_edit_element_id = str(task.payload.get("video_edit_element_id") or "")
        input_spec = self._composition_service.inspect_inputs(current.canvas, video_edit_element_id)
        output_file_name = self._normalize_output_file_name(
            str(task.payload.get("output_file_name") or f"composition-{task.task_id}.mp4")
        )
        relative_output_path = f"./videos/{output_file_name}"
        await update_status(SandboxTaskStatus.RUNNING)
        video_paths = [self._resolve_media_path(project_path, source) for source in input_spec.video_sources]
        audio_path = self._resolve_media_path(project_path, input_spec.audio_source) if input_spec.audio_source else None
        output_path = self._resolve_media_path(project_path, relative_output_path)
        result = await self._adapter.compose(
            VideoCompositionRequest(
                video_paths=video_paths,
                audio_path=audio_path,
                output_path=output_path,
                width=input_spec.output_width,
                height=input_spec.output_height,
            )
        )
        await update_status(SandboxTaskStatus.FINALIZING)
        file_url = None
        try:
            file_url = await FileService().get_workspace_file_url(output_path)
        except Exception:
            # 本地开发时文件可能尚未有 MagicFS xattr，路径仍然可用于本地调试。
            file_url = None
        return {
            "file_path": relative_output_path,
            "file_url": file_url,
            "width": result.width,
            "height": result.height,
            "duration_seconds": result.duration_seconds,
            "has_audio": result.has_audio,
        }

    @staticmethod
    def _resolve_project_path(project_path: str) -> Path:
        """解析工作区相对项目路径并拒绝目录穿越。"""
        relative = Path(project_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("project_path must be workspace-relative")
        return (PathManager.get_workspace_dir() / relative).resolve()

    @staticmethod
    def _resolve_media_path(project_path: Path, source: str | None) -> Path:
        """解析项目内媒体路径。"""
        if not source:
            raise ValueError("Media source is required")
        relative = Path(str(source).lstrip("./"))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Media source must be project-relative")
        return project_path / relative

    @staticmethod
    def _normalize_output_file_name(file_name: str) -> str:
        """校验输出文件名，确保结果始终位于项目 videos 目录且为 MP4。"""
        normalized = file_name.strip().replace("\\", "/")
        relative = Path(normalized)
        if not normalized or relative.is_absolute() or ".." in relative.parts:
            raise ValueError("output_file_name must be a safe project videos-relative path")
        if relative.suffix.casefold() != ".mp4":
            raise ValueError("output_file_name must use the .mp4 extension")
        return normalized
