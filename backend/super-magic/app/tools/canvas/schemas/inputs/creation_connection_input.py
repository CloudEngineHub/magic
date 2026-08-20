"""CreationConnectionInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class CreationConnectionInput(BaseToolParams):
    """新增节点时以当前节点为锚点的初始连线。"""

    model_config = ConfigDict(extra="forbid")
    source_element_id: str | None = None
    source_item_ref: str | None = None
    target_element_id: str | None = None
    target_item_ref: str | None = None

    @model_validator(mode="after")
    def validate_anchor(self) -> "CreationConnectionInput":
        """保证连线只有一个方向锚点。"""
        values = [
            self.source_element_id,
            self.source_item_ref,
            self.target_element_id,
            self.target_item_ref,
        ]
        if sum(value is not None for value in values) != 1:
            raise ValueError("each initial connection must provide exactly one source or target reference")
        return self
