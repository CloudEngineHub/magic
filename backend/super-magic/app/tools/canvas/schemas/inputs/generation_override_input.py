"""GenerationOverrideInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


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
    extensions: dict[str, Any] | None = None
