"""ContentInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class ContentInput(BaseToolParams):
    """统一且便于模型填写的 Content 输入。"""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {"source": "user", "content_type": "text", "content": "标题文本"},
                {"source": "generated", "content_type": "image", "prompt": "产品主视觉"},
                {"source": "generated", "content_type": "video", "prompt": "产品动态展示"},
                {
                    "source": "imported",
                    "content_type": "image",
                    "asset_path": "Canvas/Demo/images/hero.png",
                },
            ]
        },
    )
    source: Literal["user", "imported", "generated"] = Field(
        ...,
        description="Content source: user, imported, or generated.",
    )
    content_type: Literal[
        "image",
        "video",
        "audio",
        "text",
        "rectangle",
        "ellipse",
        "triangle",
        "star",
        "storyboard",
        "video-edit",
    ] = Field(..., description="Content type; it must match the target Element type.")
    content: Any | None = Field(
        None,
        description=(
            "User Content payload. For a text node, pass the text string here, "
            "for example content='标题'."
        ),
    )
    asset_path: str | None = Field(
        None,
        min_length=1,
        description="Existing workspace-relative media path; required only when source=imported.",
    )
    prompt: str | None = Field(
        None,
        min_length=1,
        description="Generation prompt; required only when source=generated.",
    )
    default_style: dict[str, Any] | None = Field(None, alias="defaultStyle")
    fill: Any | None = None
    stroke: Any | None = None
    stroke_width: float | None = Field(None, alias="strokeWidth")
    corner_radius: float | None = Field(None, alias="cornerRadius")
    sides: int | None = None
    inner_radius_ratio: float | None = Field(None, alias="innerRadiusRatio")
    generation_config: dict[str, Any] | None = Field(None, alias="generationConfig")
    shots: list[dict[str, Any]] | None = None
    video_sequence: list[dict[str, Any]] | None = Field(None, alias="videoSequence")
    output: dict[str, Any] | None = None
    model_id: str | None = None
    name: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_video_paths: list[str] = Field(default_factory=list)
    reference_audio_paths: list[str] = Field(default_factory=list)
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    size: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_source_fields(self) -> "ContentInput":
        """按来源校验必要字段，向模型返回单一且明确的错误。"""
        if self.source == "generated":
            if self.content_type not in {"image", "video"}:
                raise ValueError("source=generated currently supports content_type=image or video")
            if not self.prompt:
                raise ValueError("source=generated requires prompt")
            if self.asset_path is not None:
                raise ValueError("asset_path is only allowed when source=imported")
        elif self.source == "imported":
            if self.content_type not in {"image", "video", "audio"}:
                raise ValueError("source=imported requires content_type=image, video, or audio")
            if not self.asset_path:
                raise ValueError("source=imported requires asset_path")
            if self.prompt is not None:
                raise ValueError("prompt is only allowed when source=generated")
        else:
            if self.content_type in {"image", "video", "audio"}:
                raise ValueError("media Content must use source=imported or source=generated")
            if self.asset_path is not None or self.prompt is not None:
                raise ValueError("user Content does not accept asset_path or prompt")
        return self
