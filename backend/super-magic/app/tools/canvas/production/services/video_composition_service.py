"""Canvas 视频合成应用服务。"""

from __future__ import annotations

import asyncio
from fractions import Fraction
from pathlib import Path, PurePosixPath

from app.tools.canvas.application.canvas_id import new_canvas_id
from app.tools.canvas.application.results import CanvasVideoCompositionResult
from app.tools.canvas.domain.content_fields.audio import AudioContentFields
from app.tools.canvas.domain.content_fields.video import VideoContentFields
from app.tools.canvas.domain.content_fields.video_edit import VideoEditContentFields
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService
from app.tools.canvas.production.contracts import (
    CompositionInputSpec,
    CompositionPreparation,
    ContentProductionRuleInterface,
    ProductionResultType,
)
from app.tools.canvas.production.ports import VideoCompositionPort, VideoCompositionRequest, VideoCompositionResult
from app.tools.canvas.repository import CanvasUnitOfWork
from app.utils.async_file_utils import async_exists, async_stat


class VideoCompositionService:
    """解析 Video Edit、管理 processing Content 并执行独立合成端口。"""

    _RESOLUTION_SHORT_SIDE = {"720p": 720, "1080p": 1080, "2k": 1440, "4k": 2160}

    def __init__(self, unit_of_work: CanvasUnitOfWork, composition_port: VideoCompositionPort, production_rule: ContentProductionRuleInterface, workspace: Path) -> None:
        """显式绑定事务、合成端口和工作区。"""
        self._unit_of_work = unit_of_work
        self._composition_port = composition_port
        if production_rule.result_type is not ProductionResultType.SINGLE_CONTENT:
            raise ValueError("video_composition must produce a single Content result")
        self._production_rule = production_rule
        self._workspace = workspace

    async def compose(
        self,
        project_path: str,
        video_edit_element_id: str,
        result_name: str,
        result_element_id: str,
        tool_context=None,
        result_content_id: str | None = None,
    ) -> CanvasVideoCompositionResult:
        """创建 processing Content、同步合成并写回完成或失败状态。"""
        if not result_content_id:
            raise CanvasDomainError(
                "CONTENT_NOT_FOUND",
                "Composition requires the Content created by add_canvas_elements.",
            )
        output_path = f"./videos/{self._safe_name(result_name)}-{new_canvas_id('video')[-8:]}.mp4"
        preparation = await self._unit_of_work.transaction_with_sidecar(
            project_path,
            lambda project, metadata: self._prepare(
                project,
                metadata,
                video_edit_element_id,
                result_name,
                result_element_id,
                output_path,
                result_content_id,
            ),
        )
        try:
            project = await self._unit_of_work.repository.read(project_path)
            input_spec = preparation.input_spec
            video_paths = tuple(self._resolve_media(project_path, source) for source in input_spec.video_sources)
            audio_path = self._resolve_media(project_path, input_spec.audio_source) if input_spec.audio_source else None
            media_paths = video_paths + ((audio_path,) if audio_path else ())
            for path in media_paths:
                if not await async_exists(path) or (await async_stat(path)).st_size <= 0:
                    raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", f"Composition input file is missing or empty: {path.name}.")
            result = await self._composition_port.compose(
                VideoCompositionRequest(video_paths, audio_path, self._resolve_media(project_path, output_path), input_spec.output_width, input_spec.output_height),
                interruption_event=self._interruption_event(tool_context),
            )
        except BaseException as error:
            await self._mark_failed(project_path, preparation, str(error)[:500])
            if isinstance(error, asyncio.CancelledError):
                raise
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", str(error)[:500]) from error
        await self._unit_of_work.transaction_with_sidecar(
            project_path,
            lambda project, metadata: self._complete(project, metadata, preparation, result),
        )
        return CanvasVideoCompositionResult(
            result_element_id=preparation.result_element_id,
            result_content_id=preparation.result_content_id,
            status="completed",
            src=preparation.relative_output_path,
            width=result.width,
            height=result.height,
            duration_seconds=result.duration_seconds,
            has_audio=result.has_audio,
        )

    def _prepare(
        self,
        project: CanvasProject,
        metadata: dict,
        video_edit_element_id: str,
        result_name: str,
        result_element_id: str,
        output_path: str,
        result_content_id: str | None,
    ):
        """在事务内解析输入并创建 processing 结果 Content。"""
        spec = self.inspect_inputs(project, video_edit_element_id)
        element = project.canvas.get_element(result_element_id)
        if element is None or element.element_type != "video":
            raise CanvasDomainError("ELEMENT_NOT_FOUND", "The result Element must be a video Element.")
        if element.properties.name is None:
            element.properties.name = result_name
        previous_active_content_id = element.active_content_id
        previous_main_content_id = element.main_content_id
        existing_content = element.get_content(result_content_id) if result_content_id else None
        if existing_content is None:
            raise CanvasDomainError("CONTENT_NOT_FOUND", "The requested result Content does not exist.")
        if not isinstance(existing_content.fields, VideoContentFields):
            raise CanvasDomainError("CONTENT_NOT_FOUND", "The requested result Content is not a video Content.")
        content_id = existing_content.content_id
        existing_content.fields.status = "processing"
        existing_content.fields.stored_error_message = None
        ContentMetadataService.set(
            metadata,
            element.element_id,
            content_id,
            {
                "elementId": element.element_id,
                "source": "generated",
                "productionRule": "video_composition",
                "generationStatus": "processing",
                "outputUri": output_path,
                "retryCount": 0,
            },
        )
        return (CompositionPreparation(element.element_id, content_id, output_path, spec, previous_active_content_id, previous_main_content_id), metadata)

    def _complete(self, project: CanvasProject, metadata: dict, preparation: CompositionPreparation, result: VideoCompositionResult):
        """在事务内写入完成状态和主 Content 指针。"""
        element = project.canvas.get_element(preparation.result_element_id)
        content = element.get_content(preparation.result_content_id) if element else None
        if element is None or content is None or not isinstance(content.fields, VideoContentFields):
            raise CanvasDomainError("CONTENT_NOT_FOUND", "Composition result Content no longer exists.")
        video_content = content.fields
        element.properties.width = result.width
        element.properties.height = result.height
        video_content.update_generation_result("completed", preparation.relative_output_path, None)
        video_content.video_generation_result_meta = {
            "durationSeconds": result.duration_seconds,
            "hasAudio": result.has_audio,
        }
        element.main_content_id = preparation.result_content_id
        detail = ContentMetadataService.get(metadata, element.element_id, preparation.result_content_id)
        ContentMetadataService.set(
            metadata,
            element.element_id,
            preparation.result_content_id,
            {
                **detail,
                "generationStatus": "completed",
                "outputUri": preparation.relative_output_path,
                "durationSeconds": result.duration_seconds,
                "hasAudio": result.has_audio,
            },
        )
        return {"result_element_id": element.element_id, "result_content_id": preparation.result_content_id}, metadata

    async def _mark_failed(self, project_path: str, preparation: CompositionPreparation, message: str) -> None:
        """尽力将本次合成结果保留为 failed。"""
        try:
            await self._unit_of_work.transaction_with_sidecar(
                project_path,
                lambda project, metadata: self._fail(project, metadata, preparation, message),
            )
        except Exception:
            return

    def _fail(self, project: CanvasProject, metadata: dict, preparation: CompositionPreparation, message: str):
        """在事务内写入失败状态。"""
        element = project.canvas.get_element(preparation.result_element_id)
        content = element.get_content(preparation.result_content_id) if element else None
        if element is not None and content is not None and isinstance(content.fields, VideoContentFields):
            video_content = content.fields
            video_content.update_generation_result("failed", None, message)
            if preparation.previous_active_content_id is not None:
                element.active_content_id = preparation.previous_active_content_id
            if preparation.previous_main_content_id is not None:
                element.main_content_id = preparation.previous_main_content_id
            detail = ContentMetadataService.get(metadata, element.element_id, preparation.result_content_id)
            ContentMetadataService.set(metadata, element.element_id, preparation.result_content_id, {**detail, "generationStatus": "failed", "errorMessage": message})
        return {"status": "failed"}, metadata

    def inspect_inputs(self, project: CanvasProject, video_edit_element_id: str) -> CompositionInputSpec:
        """从 Video Edit 主 Content 校验并提取媒体顺序。"""
        video_edit = project.canvas.get_element(video_edit_element_id)
        if video_edit is None or video_edit.element_type != "video-edit":
            raise CanvasDomainError("ELEMENT_NOT_FOUND", "The requested Video Edit Element does not exist.")
        main = video_edit.get_content(video_edit.main_content_id)
        if main is None or not isinstance(main.fields, VideoEditContentFields):
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Video Edit has no usable main Content.")
        if not main.fields.video_sequence:
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "videoSequence must contain at least one Video Element.")
        output = main.fields.output or {}
        if str(output.get("format") or "mp4").casefold() != "mp4":
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Only MP4 output is supported.")
        sources: list[str] = []
        for element_id in main.fields.video_sequence:
            self._require_connection(project, element_id, video_edit_element_id)
            element = project.canvas.get_element(element_id)
            content = element.get_content(element.main_content_id) if element else None
            if element is None or element.element_type != "video" or content is None or not isinstance(content.fields, VideoContentFields):
                raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", f"Video Element is not completed: {element_id}.")
            video_content = content.fields
            if video_content.status != "completed" or not video_content.src:
                raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", f"Video Element is not completed: {element_id}.")
            sources.append(video_content.src)
        audio_source = None
        audio_element_id = None
        if main.fields.audio_sequence:
            if len(main.fields.audio_sequence) > 1:
                raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "audioSequence supports at most one Audio Element.")
            audio_element_id = main.fields.audio_sequence[0]
            self._require_connection(project, audio_element_id, video_edit_element_id)
            audio_element = project.canvas.get_element(audio_element_id)
            audio_content = audio_element.get_content(audio_element.main_content_id) if audio_element else None
            if audio_element is None or audio_element.element_type != "audio" or audio_content is None or not isinstance(audio_content.fields, AudioContentFields):
                raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", f"Audio Element is not usable: {audio_element_id}.")
            audio_fields = audio_content.fields
            if not audio_fields.src:
                raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", f"Audio Element is not usable: {audio_element_id}.")
            audio_source = audio_fields.src
        width, height = self._resolve_dimensions(str(output.get("aspectRatio") or "16:9"), str(output.get("resolution") or "1080p"))
        return CompositionInputSpec(video_edit_element_id, tuple(main.fields.video_sequence), tuple(sources), audio_element_id, audio_source, width, height)

    @staticmethod
    def _require_connection(project: CanvasProject, source_id: str, target_id: str) -> None:
        """要求媒体 Element 存在指向 Video Edit 的明确关系。"""
        if not any(item.source_element_id == source_id and item.target_element_id == target_id for item in project.canvas.connections):
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", f"Video Edit input is not connected: {source_id} -> {target_id}.")

    def _resolve_media(self, project_path: str, source: str | None) -> Path:
        """解析项目相对或工作区相对媒体路径，并限制在当前项目内。"""
        if not source:
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Media source is empty.")
        normalized = source.replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        project_relative = PurePosixPath(project_path.replace("\\", "/"))
        source_path = PurePosixPath(normalized)
        project_parts = project_relative.parts
        if source_path.parts[: len(project_parts)] == project_parts:
            relative = PurePosixPath(*source_path.parts[len(project_parts) :])
        else:
            relative = source_path
        if relative.is_absolute() or ".." in relative.parts:
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Media source must stay inside the project.")
        if not relative.parts:
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Media source is empty.")
        return self._workspace / project_path / relative

    @classmethod
    def _resolve_dimensions(cls, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        """按短边分辨率计算偶数输出尺寸。"""
        try:
            left, right = aspect_ratio.split(":", 1)
            ratio = Fraction(int(left), int(right))
        except (ValueError, ZeroDivisionError) as error:
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Invalid output aspect ratio.") from error
        short_side = cls._RESOLUTION_SHORT_SIDE.get(resolution.casefold())
        if short_side is None:
            raise CanvasDomainError("VIDEO_COMPOSITION_FAILED", "Unsupported output resolution.")
        if ratio >= 1:
            height = short_side
            width = round(short_side * float(ratio))
        else:
            width = short_side
            height = round(short_side / float(ratio))
        return cls._even(width), cls._even(height)

    @staticmethod
    def _even(value: int) -> int:
        """返回不小于 2 的偶数。"""
        value = max(2, value)
        return value if value % 2 == 0 else value + 1

    @staticmethod
    def _safe_name(name: str) -> str:
        """清理输出文件名中的路径字符。"""
        return "".join(character if character.isalnum() or character in "-_" else "_" for character in name).strip("_") or "canvas-video"

    @staticmethod
    def _interruption_event(tool_context):
        """从工具上下文读取用户中断事件。"""
        if tool_context is None:
            return None
        agent_context = tool_context.get_extension("agent_context")
        return agent_context.get_interruption_event() if agent_context is not None else None
