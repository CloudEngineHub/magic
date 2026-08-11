"""媒体生成来源关系的最终事务扩展实现。"""

from __future__ import annotations

from typing import Any, Dict, Sequence

from app.tools.design.domain.generation_finalizer import (
    CanvasGenerationFinalizationContext,
    CanvasGenerationFinalizer,
)
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.video_production.service.media_generation_service import (
    MediaGenerationService,
    PreparedMediaSource,
)


class SourceConnectionGenerationFinalizer(CanvasGenerationFinalizer):
    """把预先解析的来源 Element 关系写入媒体最终状态事务。"""

    def __init__(
        self,
        manager: CanvasManagerProtocol,
        sources_by_task: Sequence[Sequence[PreparedMediaSource]],
        *,
        enabled: bool,
    ) -> None:
        """保存只读来源快照，并初始化按任务归集的结果。"""
        self._manager = manager
        self._sources_by_task = tuple(
            tuple(sources) for sources in sources_by_task
        )
        self._enabled = enabled
        self._connections_by_task: Dict[int, list[dict[str, str]]] = {}

    async def apply(
        self,
        config: Any,
        context: CanvasGenerationFinalizationContext,
    ) -> Dict[str, Any]:
        """在当前事务内校验来源快照并建立来源到结果的关系。"""
        if not self._enabled:
            self._connections_by_task[context.task_index] = []
            return {"connections": []}
        source_ids = await MediaGenerationService.ensure_source_elements(
            self._manager,
            config,
            self._sources_by_task[context.task_index],
        )
        pairs = [
            (source_element_id, context.element_id)
            for source_element_id in source_ids
        ]
        connections = MediaGenerationService.apply_source_connections(config, pairs)
        self._connections_by_task[context.task_index] = connections
        return {"connections": connections}

    def get_connections(self) -> list[dict[str, str]]:
        """按任务顺序返回已经随最终状态提交的 Connection 摘要。"""
        return [
            connection
            for task_index in sorted(self._connections_by_task)
            for connection in self._connections_by_task[task_index]
        ]

    def discard(self, task_index: int) -> None:
        """丢弃未成功提交事务对应的内部 Connection 摘要。"""
        self._connections_by_task.pop(task_index, None)
