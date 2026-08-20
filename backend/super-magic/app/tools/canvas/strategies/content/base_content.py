"""Content 策略共享校验基类。"""

from abc import ABC
from typing import Any

from app.tools.canvas.domain.protocol import COMMON_CONTENT_FIELDS, CONTENT_FIELDS
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasContent
from app.tools.canvas.strategies.content.interface import ContentStrategyInterface
from app.tools.canvas.strategies.content.plan import ContentMutationPlan
from app.tools.canvas.strategies.content.request import ContentStrategyRequest

_INTERNAL_FIELDS = {
    "source",
    "content_id",
    "content_type",
    "prompt",
    "size",
    "model_id",
    "name",
    "output_path",
    "reference_images",
    "reference_image_paths",
    "reference_video_paths",
    "reference_audio_paths",
    "frame_start_path",
    "frame_end_path",
    "duration_seconds",
    "aspect_ratio",
    "resolution",
    "fps",
    "seed",
    "watermark",
    "extensions",
}


class BaseContentStrategy(ContentStrategyInterface, ABC):
    """提供所有 Content 策略共享的字段过滤和类型校验。"""

    def _build_base_content(self, request: ContentStrategyRequest) -> ContentMutationPlan:
        """根据请求创建不包含内部生成参数的 Content 计划。"""
        data = request.data
        content_id = data.get("content_id")
        if not content_id:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Content ID must be assigned before strategy execution.")
        content_type = str(data.get("content_type") or "")
        fields = {key: value for key, value in data.items() if key not in _INTERNAL_FIELDS}
        allowed = CONTENT_FIELDS.get(content_type)
        if allowed is None:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", f"Unsupported Content type: {content_type}.")
        unexpected = set(fields) - allowed - COMMON_CONTENT_FIELDS
        if unexpected:
            fields_text = ", ".join(sorted(unexpected))
            raise CanvasDomainError("CONTENT_INPUT_INVALID", f"Content type {content_type} does not allow: {fields_text}.")
        return ContentMutationPlan(CanvasContent(str(content_id), fields))
