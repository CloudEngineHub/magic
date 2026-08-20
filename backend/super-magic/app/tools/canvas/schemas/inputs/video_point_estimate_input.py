"""视频积分预估输入。"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from app.tools.canvas.application.commands import GenerationParameters
from app.tools.core import BaseToolParams


class VideoPointEstimateItemInput(BaseToolParams):
    """单个视频积分预估项。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1)
    model_id: str | None = None
    name: str | None = None
    size: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_video_paths: list[str] = Field(default_factory=list)
    reference_audio_paths: list[str] = Field(default_factory=list)
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    def to_parameters(self) -> GenerationParameters:
        """转换为 Application 使用的强类型视频参数。"""
        return GenerationParameters(
            prompt=self.prompt,
            model_id=self.model_id,
            name=self.name,
            size=self.size,
            reference_images=tuple(self.reference_images),
            reference_image_paths=tuple(self.reference_image_paths),
            reference_video_paths=tuple(self.reference_video_paths),
            reference_audio_paths=tuple(self.reference_audio_paths),
            frame_start_path=self.frame_start_path,
            frame_end_path=self.frame_end_path,
            duration_seconds=self.duration_seconds,
            aspect_ratio=self.aspect_ratio,
            resolution=self.resolution,
            fps=self.fps,
            seed=self.seed,
            watermark=self.watermark,
            extensions=self.extensions,
        )
