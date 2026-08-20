"""FrameSelectionInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class FrameSelectionInput(BaseToolParams):
    """将已有同层级 Element 框选为新 Frame 的参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_ids: list[str] = Field(..., min_length=1, max_length=100)
    name: str | None = None
    padding: float | None = Field(None, ge=0)
