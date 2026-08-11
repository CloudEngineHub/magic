"""Video Edit 输入解析与结果 Video 写回服务。"""

from dataclasses import dataclass
from fractions import Fraction
from typing import Any, Dict, List, Optional

from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.domain.services.element_layout_service import ElementLayoutService
from app.tools.design.video_production.service.video_production_layout_service import (
    VideoProductionLayoutService,
)


@dataclass(frozen=True)
class CompositionInputSpec:
    """表示从 Video Edit main Content 解析出的稳定合成输入。"""

    video_edit_element_id: str
    video_element_ids: List[str]
    video_sources: List[str]
    audio_element_id: Optional[str]
    audio_source: Optional[str]
    output_width: int
    output_height: int
    output: Dict[str, Any]


@dataclass(frozen=True)
class CompositionPreparation:
    """表示已创建 processing Content 的一次合成任务。"""

    result_element_id: str
    result_content_id: str
    relative_output_path: str
    input_spec: CompositionInputSpec


class VideoCompositionService:
    """解析 Video Edit 顺序并维护结果 Video Content 生命周期。"""

    _RESOLUTION_SHORT_SIDE = {
        "720p": 720,
        "1080p": 1080,
        "2k": 1440,
        "4k": 2160,
    }

    def inspect_inputs(
        self,
        canvas: CanvasDocumentV3,
        video_edit_element_id: str,
    ) -> CompositionInputSpec:
        """从 Video Edit main Content 校验并提取有序媒体输入。"""
        video_edit = canvas.get_element(video_edit_element_id)
        if video_edit is None or video_edit.type != "video-edit":
            raise ValueError(f"Video Edit Element does not exist: {video_edit_element_id}")
        content = video_edit.get_main_content()
        if content is None:
            raise ValueError(f"Video Edit Element has no main Content: {video_edit_element_id}")
        video_sequence = self._string_sequence(content.fields.get("videoSequence"), "videoSequence")
        if not video_sequence:
            raise ValueError("videoSequence must contain at least one Video Element")
        audio_sequence = self._string_sequence(content.fields.get("audioSequence", []), "audioSequence")
        if len(audio_sequence) > 1:
            raise ValueError("audioSequence supports at most one Audio Element in the first release")
        output = content.fields.get("output") or {}
        if not isinstance(output, dict):
            raise ValueError("Video Edit output must be an object")
        if str(output.get("format") or "mp4").casefold() != "mp4":
            raise ValueError("The first release supports MP4 output only")

        video_sources: List[str] = []
        for element_id in video_sequence:
            self._require_input_connection(canvas, element_id, video_edit_element_id)
            element = canvas.get_element(element_id)
            if element is None or element.type != "video":
                raise ValueError(f"videoSequence must reference a Video Element: {element_id}")
            main_content = element.get_main_content()
            if main_content is None:
                raise ValueError(f"Video Element has no main Content: {element_id}")
            if main_content.fields.get("status") != "completed" or not main_content.fields.get("src"):
                raise ValueError(f"Video Element is not completed: {element_id}")
            video_sources.append(str(main_content.fields["src"]))

        audio_element_id = audio_sequence[0] if audio_sequence else None
        audio_source: Optional[str] = None
        if audio_element_id is not None:
            self._require_input_connection(canvas, audio_element_id, video_edit_element_id)
            audio_element = canvas.get_element(audio_element_id)
            if audio_element is None or audio_element.type != "audio":
                raise ValueError(f"audioSequence must reference an Audio Element: {audio_element_id}")
            audio_content = audio_element.get_main_content()
            if audio_content is None or not audio_content.fields.get("src"):
                raise ValueError(f"Audio Element has no usable main Content: {audio_element_id}")
            audio_source = str(audio_content.fields["src"])

        width, height = self._resolve_dimensions(
            str(output.get("aspectRatio") or "16:9"),
            str(output.get("resolution") or "1080P"),
        )
        return CompositionInputSpec(
            video_edit_element_id=video_edit_element_id,
            video_element_ids=video_sequence,
            video_sources=video_sources,
            audio_element_id=audio_element_id,
            audio_source=audio_source,
            output_width=width,
            output_height=height,
            output={
                "aspectRatio": str(output.get("aspectRatio") or "16:9"),
                "resolution": str(output.get("resolution") or "1080P"),
                "format": "mp4",
            },
        )

    def prepare_result(
        self,
        canvas: CanvasDocumentV3,
        *,
        video_edit_element_id: str,
        result_name: str,
        result_element_id: Optional[str],
        relative_output_path: str,
    ) -> CompositionPreparation:
        """重新校验输入并创建独立 processing Video Content。"""
        input_spec = self.inspect_inputs(canvas, video_edit_element_id)
        element = canvas.get_element(result_element_id) if result_element_id else None
        creating_element = element is None
        if result_element_id and element is None:
            raise ValueError(f"Result Video Element does not exist: {result_element_id}")
        if element is None:
            element_id = result_element_id or CanvasIdGenerator.generate_element_id()
            content_id = CanvasIdGenerator.generate_initial_content_id(element_id)
            element = CanvasElementV3(
                id=element_id,
                type="video",
                properties={"name": result_name},
                contents=[
                    ElementContent(
                        content_id=content_id,
                        fields={"status": "processing"},
                    )
                ],
                active_content_id=content_id,
                main_content_id=content_id,
            )
            ElementLayoutService.layout_element(canvas, element)
            canvas.elements.append(element)
        else:
            if element.type != "video":
                raise ValueError(f"Result Element is not a Video Element: {element.id}")
            element.properties["name"] = result_name
            content_id = CanvasIdGenerator.generate_content_id(
                element.id,
                [content.content_id for content in element.contents],
            )
            ContentService.append_content(
                element,
                ElementContent(content_id=content_id, fields={"status": "processing"}),
                activate=True,
                set_main_when_empty=True,
            )
        ConnectionService.ensure_connection(
            canvas,
            CanvasConnection(
                id=CanvasIdGenerator.generate_connection_id(),
                source_element_id=video_edit_element_id,
                target_element_id=element.id,
                locked=True,
            ),
        )
        if creating_element:
            VideoProductionLayoutService.layout_new_elements(
                canvas,
                [element.id],
            )
        return CompositionPreparation(
            result_element_id=element.id,
            result_content_id=content_id,
            relative_output_path=relative_output_path,
            input_spec=input_spec,
        )

    @staticmethod
    def mark_completed(
        canvas: CanvasDocumentV3,
        preparation: CompositionPreparation,
    ) -> None:
        """把指定结果 Content 更新为已完成并写入最终项目路径。"""
        element = canvas.get_element(preparation.result_element_id)
        if element is None or element.type != "video":
            raise ValueError(f"Result Video Element does not exist: {preparation.result_element_id}")
        ContentService.update_content(
            element,
            preparation.result_content_id,
            {
                "src": preparation.relative_output_path,
                "status": "completed",
                "errorMessage": None,
            },
        )

    @staticmethod
    def mark_failed(
        canvas: CanvasDocumentV3,
        preparation: CompositionPreparation,
        error_message: str,
    ) -> None:
        """把指定结果 Content 更新为失败并保存精简错误。"""
        element = canvas.get_element(preparation.result_element_id)
        if element is None or element.type != "video":
            return
        content = element.get_content(preparation.result_content_id)
        if content is None:
            return
        ContentService.update_content(
            element,
            preparation.result_content_id,
            {
                "status": "failed",
                "errorMessage": error_message[:300],
            },
        )

    @classmethod
    def _resolve_dimensions(cls, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        """按短边分辨率和宽高比计算偶数输出尺寸。"""
        try:
            width_ratio_text, height_ratio_text = aspect_ratio.split(":", 1)
            ratio = Fraction(int(width_ratio_text), int(height_ratio_text))
        except (ValueError, ZeroDivisionError) as error:
            raise ValueError(f"Invalid output aspect ratio: {aspect_ratio}") from error
        short_side = cls._RESOLUTION_SHORT_SIDE.get(resolution.casefold())
        if short_side is None:
            raise ValueError(f"Unsupported output resolution: {resolution}")
        if ratio >= 1:
            height = short_side
            width = cls._even(round(short_side * float(ratio)))
        else:
            width = short_side
            height = cls._even(round(short_side / float(ratio)))
        return width, height

    @staticmethod
    def _string_sequence(value: Any, field_name: str) -> List[str]:
        """校验序列字段为非空且不重复的字符串数组。"""
        if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
            raise ValueError(f"{field_name} must be an array of non-empty Element IDs")
        if len(set(value)) != len(value):
            raise ValueError(f"{field_name} must not contain duplicate Element IDs")
        return list(value)

    @staticmethod
    def _require_input_connection(
        canvas: CanvasDocumentV3,
        source_element_id: str,
        video_edit_element_id: str,
    ) -> None:
        """要求序列成员存在指向 Video Edit 的明确 Connection。"""
        if not any(
            connection.source_element_id == source_element_id
            and connection.target_element_id == video_edit_element_id
            for connection in canvas.connections
        ):
            raise ValueError(
                f"Video Edit sequence Element is not connected: {source_element_id} -> {video_edit_element_id}"
            )

    @staticmethod
    def _even(value: int) -> int:
        """把尺寸规范为 H.264 兼容的正偶数。"""
        normalized = max(2, value)
        return normalized if normalized % 2 == 0 else normalized + 1
