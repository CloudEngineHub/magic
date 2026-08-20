"""Storyboard 输入模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class StoryboardGenerationConfigInput(BaseModel):
    """Storyboard 图片生成配置输入。"""

    model_config = ConfigDict(extra="allow")
    model_id: str | None = None
    size: str | None = None
    resolution: str | None = None
    image_generation_config: dict[str, str] | None = Field(None, alias="image_generation_config")


class StoryboardShotInput(BaseModel):
    """Storyboard 单个镜头输入。"""

    model_config = ConfigDict(extra="allow")
    id: str
    description: str
    output_image_element_id: str | None = Field(None, alias="outputImageElementId")
