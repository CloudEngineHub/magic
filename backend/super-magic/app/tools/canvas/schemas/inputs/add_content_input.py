"""AddContentInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams
from app.tools.canvas.application.commands import AddContentCommand

from app.tools.canvas.schemas.inputs.content_input import ContentInput

class AddContentInput(BaseToolParams):
    """追加 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content: ContentInput

    def to_command(self) -> AddContentCommand:
        """转换为 Application 使用的追加 Content 命令。"""
        return AddContentCommand(
            item_ref=self.item_ref,
            element_id=self.element_id,
            content=self.content.to_command(),
        )
