"""富文本输入模型。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class TextStyleInput(BaseModel):
    """文本默认样式输入。"""

    model_config = ConfigDict(extra="forbid")
    font_size: float | None = Field(None, alias="fontSize")
    font_weight: int | str | None = Field(None, alias="fontWeight")
    color: str | None = None
    font_family: str | None = Field(None, alias="fontFamily")
    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    strikethrough: bool | None = None
    background_color: str | None = Field(None, alias="backgroundColor")
    letter_spacing: float | None = Field(None, alias="letterSpacing")


class RichTextNodeInput(BaseModel):
    """富文本段落节点输入。"""

    model_config = ConfigDict(extra="forbid")
    type: str = "text"
    text: str
    style: TextStyleInput | None = None


class RichTextParagraphInput(BaseModel):
    """富文本段落输入。"""

    model_config = ConfigDict(extra="forbid")
    children: list[RichTextNodeInput] = Field(default_factory=list)
    style: dict[str, str | float] | None = None
