"""ElementInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams
from app.tools.canvas.application.commands import AddElementCommand

from app.tools.canvas.schemas.inputs.content_input import ContentInput
from app.tools.canvas.schemas.inputs.creation_connection_input import CreationConnectionInput
from app.tools.canvas.schemas.inputs.layout_input import LayoutInput

class ElementInput(BaseToolParams):
    """新增 Element 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_type: str
    name: str | None = None
    layout: LayoutInput | None = None
    content: ContentInput | None = None
    connections: list[CreationConnectionInput] = Field(default_factory=list)

    def to_command(self) -> AddElementCommand:
        """转换为 Application 使用的新增 Element 命令。"""
        return AddElementCommand(
            item_ref=self.item_ref,
            element_type=self.element_type,
            name=self.name,
            layout=self.layout.to_command() if self.layout else None,
            content=self.content.to_command() if self.content else None,
            connections=tuple(connection.to_command() for connection in self.connections),
        )
