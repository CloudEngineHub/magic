"""WaitTask 输入模型。"""

from __future__ import annotations

from app.tools.core import BaseToolParams


class WaitTask(BaseToolParams):
    """异步生成任务标识。"""

    generation_task_id: str
