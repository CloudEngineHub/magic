"""FrameSelectionInput 输入模型。"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from app.tools.canvas.application.commands import FrameElementsCommand
from app.tools.core import BaseToolParams


class FrameSelectionInput(BaseToolParams):
    """将已有同层级 Element 框选为新 Frame 的参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_ids: list[str] = Field(..., min_length=1, max_length=100)
    name: str | None = None
    padding: float | None = Field(None, ge=0)

    def to_command(self) -> FrameElementsCommand:
        """转换为 Application 使用的 Frame 命令。"""
        return FrameElementsCommand(
            item_ref=self.item_ref,
            element_ids=tuple(self.element_ids),
            name=self.name,
            padding=self.padding,
        )
