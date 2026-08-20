"""LayoutElementInput 输入模型。"""

from __future__ import annotations

from pydantic import ConfigDict

from app.tools.canvas.application.commands import LayoutElementCommand
from app.tools.canvas.schemas.inputs.layout_input import LayoutInput
from app.tools.core import BaseToolParams


class LayoutElementInput(BaseToolParams):
    """调整布局参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    layout: LayoutInput

    def to_command(self) -> LayoutElementCommand:
        """转换为布局服务使用的 Element ID 与命令。"""
        return LayoutElementCommand(self.item_ref, self.element_id, self.layout.to_command())
