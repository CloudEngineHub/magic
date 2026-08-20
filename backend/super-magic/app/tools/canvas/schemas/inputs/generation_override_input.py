"""GenerationOverrideInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal, cast

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams
from app.tools.canvas.application.commands import GenerationParameters
from app.tools.canvas.domain.types import JsonObject


class GenerationOverrideInput(BaseToolParams):
    """失败生成重试时允许覆盖的公开生成参数。"""

    model_config = ConfigDict(extra="forbid")
    prompt: str | None = Field(None, min_length=1)
    model_id: str | None = None
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
    extensions: dict[str, object] | None = None

    def to_command(self) -> GenerationParameters:
        """转换为重试使用的生成参数覆盖命令。"""
        values = self.model_dump(exclude_none=True)
        return GenerationParameters(
            prompt=str(values.pop("prompt", "")),
            model_id=values.pop("model_id", None),
            name=values.pop("name", None),
            size=values.pop("size", None),
            reference_images=tuple(values.pop("reference_images", []) or []),
            reference_image_paths=tuple(values.pop("reference_image_paths", []) or []),
            reference_video_paths=tuple(values.pop("reference_video_paths", []) or []),
            reference_audio_paths=tuple(values.pop("reference_audio_paths", []) or []),
            frame_start_path=values.pop("frame_start_path", None),
            frame_end_path=values.pop("frame_end_path", None),
            duration_seconds=values.pop("duration_seconds", None),
            aspect_ratio=values.pop("aspect_ratio", None),
            resolution=values.pop("resolution", None),
            fps=values.pop("fps", None),
            seed=values.pop("seed", None),
            watermark=values.pop("watermark", None),
            extensions=cast(JsonObject, values.pop("extensions", {})),
        )
