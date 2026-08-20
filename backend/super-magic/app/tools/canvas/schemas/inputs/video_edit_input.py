"""Video Edit 输入模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class VideoEditOutputInput(BaseModel):
    """Video Edit 输出配置输入。"""

    model_config = ConfigDict(extra="forbid")
    aspect_ratio: str | None = Field(None, alias="aspectRatio")
    resolution: str | None = None
    format: str | None = None
