"""LayoutElementInput 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams

from app.tools.canvas.schemas.inputs.layout_input import LayoutInput

class LayoutElementInput(BaseToolParams):
    """调整布局参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    layout: LayoutInput
