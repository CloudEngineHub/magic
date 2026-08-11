"""画布媒体生成预占初始化接口。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol, Sequence


@dataclass(frozen=True)
class CanvasGenerationInitializationContext:
    """描述一次媒体任务在生成开始前已经确定的画布目标。"""

    task_index: int
    element_id: str
    content_id: Optional[str]
    element_created: bool


class CanvasGenerationInitializer(Protocol):
    """在 processing 占位事务内初始化内部画布业务状态。"""

    async def apply_batch(
        self,
        config: Any,
        contexts: Sequence[CanvasGenerationInitializationContext],
    ) -> Dict[int, Dict[str, Any]]:
        """批量初始化关系和布局，并返回按任务索引归集的内部摘要。"""

    def discard(self, task_indices: Sequence[int]) -> None:
        """事务提交失败时丢弃对应任务尚未生效的内部摘要。"""
