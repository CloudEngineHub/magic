"""画布媒体生成最终事务扩展接口。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol


@dataclass(frozen=True)
class CanvasGenerationFinalizationContext:
    """描述一次媒体任务写回画布时的稳定目标。"""

    task_index: int
    element_id: str
    content_id: Optional[str]


class CanvasGenerationFinalizer(Protocol):
    """在媒体最终状态事务中追加内部画布业务变更。"""

    async def apply(
        self,
        config: Any,
        context: CanvasGenerationFinalizationContext,
    ) -> Dict[str, Any]:
        """在当前事务快照中应用附加变更并返回内部摘要。"""

    def discard(self, task_index: int) -> None:
        """事务提交失败时丢弃该任务尚未生效的内部摘要。"""
