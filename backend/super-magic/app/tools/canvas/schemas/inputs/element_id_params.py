"""ElementIdParams 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams

from app.tools.canvas.schemas.inputs.project_path_params import ProjectPathParams

class ElementIdParams(ProjectPathParams):
    """精确 Element 查询参数。"""

    element_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Exact Element IDs obtained from a Canvas result.",
    )
