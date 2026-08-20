"""Video Content Fields 领域模型。"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass

from app.tools.canvas.domain.content_fields.generated_media import GeneratedMediaContentFields
from app.tools.canvas.domain.types import JsonObject


@dataclass
class VideoContentFields(GeneratedMediaContentFields):
    """保存 Video Content 的确定字段和半结构化扩展对象。"""

    generate_video_request: JsonObject | None = None
    video_generation_result_meta: JsonObject | None = None

    def to_dict(self) -> dict[str, object]:
        """转换为 Video Content 协议字段。"""
        values: dict[str, object | None] = {
            **self._media_dict(),
            "generateVideoRequest": deepcopy(self.generate_video_request),
            "videoGenerationResultMeta": deepcopy(self.video_generation_result_meta),
        }
        return {key: value for key, value in values.items() if value is not None}
