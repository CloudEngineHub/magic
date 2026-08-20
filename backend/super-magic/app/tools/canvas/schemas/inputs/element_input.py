"""ElementInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams

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
