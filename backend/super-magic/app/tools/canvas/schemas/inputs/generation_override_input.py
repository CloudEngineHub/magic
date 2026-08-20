"""GenerationOverrideInput 输入模型。"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from app.tools.canvas.application.commands import GenerationParametersOverride
from app.tools.canvas.domain.types import JsonObject
from app.tools.core import BaseToolParams


class GenerationOverrideInput(BaseToolParams):
    """失败生成重试时允许覆盖的公开生成参数。"""

    model_config = ConfigDict(extra="forbid")
    prompt: str | None = Field(None, min_length=1)
    model_id: str | None = None
    estimate_id: str | None = None
    name: str | None = None
    size: str | None = None
    reference_images: list[str] | None = None
    reference_image_paths: list[str] | None = None
    reference_video_paths: list[str] | None = None
    reference_audio_paths: list[str] | None = None
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: JsonObject | None = None

    def to_command(self) -> GenerationParametersOverride:
        """转换为重试使用的生成参数覆盖命令。"""
        values = self.model_dump(exclude_none=True)
        provided_fields = frozenset(values)
        for field_name in ("reference_images", "reference_image_paths", "reference_video_paths", "reference_audio_paths"):
            if field_name in values:
                values[field_name] = tuple(values[field_name])
        return GenerationParametersOverride(
            prompt=values.get("prompt"),
            model_id=values.get("model_id"),
            estimate_id=values.get("estimate_id"),
            name=values.get("name"),
            size=values.get("size"),
            reference_images=values.get("reference_images"),
            reference_image_paths=values.get("reference_image_paths"),
            reference_video_paths=values.get("reference_video_paths"),
            reference_audio_paths=values.get("reference_audio_paths"),
            frame_start_path=values.get("frame_start_path"),
            frame_end_path=values.get("frame_end_path"),
            duration_seconds=values.get("duration_seconds"),
            aspect_ratio=values.get("aspect_ratio"),
            resolution=values.get("resolution"),
            fps=values.get("fps"),
            seed=values.get("seed"),
            watermark=values.get("watermark"),
            extensions=values.get("extensions"),
            _provided_fields=provided_fields,
        )
