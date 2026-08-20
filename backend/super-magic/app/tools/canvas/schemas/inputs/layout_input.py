"""LayoutInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class LayoutInput(BaseToolParams):
    """可插拔布局策略参数。"""

    model_config = ConfigDict(extra="forbid")
    strategy: Literal["row_incremental", "dependency_flow", "explicit_position"]
    position: dict[str, float] | None = None

    @model_validator(mode="after")
    def validate_position(self) -> "LayoutInput":
        """限制显式坐标只出现在显式布局策略中。"""
        if self.strategy == "explicit_position" and (
            self.position is None or not {"x", "y"}.issubset(self.position)
        ):
            raise ValueError("explicit_position requires position.x and position.y")
        if self.strategy != "explicit_position" and self.position is not None:
            raise ValueError("position is only allowed for explicit_position")
        if self.position is not None and any(not math.isfinite(value) for value in self.position.values()):
            raise ValueError("position values must be finite numbers")
        return self
