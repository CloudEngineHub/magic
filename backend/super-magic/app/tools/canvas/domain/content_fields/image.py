"""Image Content Fields 领域模型。"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass

from app.tools.canvas.domain.content_fields.generated_media import GeneratedMediaContentFields
from app.tools.canvas.domain.types import JsonObject


@dataclass
class ImageContentFields(GeneratedMediaContentFields):
    """保存 Image Content 的确定字段和半结构化扩展对象。"""

    generate_image_request: JsonObject | None = None
    image_generation_task_meta: JsonObject | None = None
    crop: JsonObject | None = None

    def to_dict(self) -> dict[str, object]:
        """转换为 Image Content 协议字段。"""
        values: dict[str, object | None] = {
            **self._media_dict(),
            "generateImageRequest": deepcopy(self.generate_image_request),
            "imageGenerationTaskMeta": deepcopy(self.image_generation_task_meta),
            "crop": deepcopy(self.crop),
        }
        return {key: value for key, value in values.items() if value is not None}
