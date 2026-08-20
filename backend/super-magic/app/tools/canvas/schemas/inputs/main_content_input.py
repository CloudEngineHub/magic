"""MainContentInput 输入模型。"""

from __future__ import annotations

from pydantic import ConfigDict

from app.tools.canvas.application.commands import SelectMainContentCommand
from app.tools.core import BaseToolParams


class MainContentInput(BaseToolParams):
    """选择主 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content_id: str

    def to_command(self) -> SelectMainContentCommand:
        """转换为选择主 Content 的应用命令。"""
        return SelectMainContentCommand(self.item_ref, self.element_id, self.content_id)
