"""ProjectPathParams 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class ProjectPathParams(BaseToolParams):
    """公共项目路径参数。"""

    project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
