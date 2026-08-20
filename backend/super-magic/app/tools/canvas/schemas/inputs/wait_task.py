"""WaitTask 输入模型。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class WaitTask(BaseToolParams):
    """异步生成任务标识。"""

    generation_task_id: str
