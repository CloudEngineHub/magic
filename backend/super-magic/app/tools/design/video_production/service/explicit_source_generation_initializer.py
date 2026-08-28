"""显式来源媒体生成预占初始化器。"""

from __future__ import annotations

from typing import Any, Optional, Sequence

from app.tools.design.domain.generation_initializer import (
    CanvasGenerationInitializationContext,
    CanvasGenerationInitializer,
)
from app.tools.design.video_production.service.video_production_flow_layout_service import (
    VideoProductionFlowLayoutService,
)
from app.tools.design.video_production.service.video_production_relation_service import (
    VideoProductionRelationService,
)


class ExplicitSourceGenerationInitializer(CanvasGenerationInitializer):
    """在 processing 占位事务内同步显式来源关系并布局新增目标。"""

    def __init__(
        self,
        source_element_ids_by_task: Sequence[Optional[Sequence[str]]],
    ) -> None:
        """保存每个生成任务的直接上游声明和事务结果摘要。"""
        self._source_element_ids_by_task = tuple(
            None if source_ids is None else tuple(source_ids)
            for source_ids in source_element_ids_by_task
        )
        self._connections_by_task: dict[int, list[dict[str, str]]] = {}

    async def apply_batch(
        self,
        config: Any,
        contexts: Sequence[CanvasGenerationInitializationContext],
    ) -> dict[int, dict[str, Any]]:
        """在同一事务内同步关系，并只布局本批新建的目标节点。"""
        results: dict[int, dict[str, Any]] = {}
        sources_by_target: dict[str, Sequence[str]] = {}
        new_element_ids: list[str] = []

        for context in contexts:
            source_ids = self._source_element_ids_by_task[context.task_index]
            connections = []
            if source_ids is not None:
                connections = VideoProductionRelationService.synchronize_incoming(
                    config.canvas,
                    context.element_id,
                    source_ids,
                )
            summaries = VideoProductionRelationService.to_summaries(connections)
            self._connections_by_task[context.task_index] = summaries
            results[context.task_index] = {"connections": summaries}

            if context.element_created:
                new_element_ids.append(context.element_id)
                sources_by_target[context.element_id] = source_ids or ()

        VideoProductionFlowLayoutService.layout_targets(
            config.canvas,
            sources_by_target,
            new_element_ids,
        )
        return results

    def get_connections(self) -> list[dict[str, str]]:
        """按任务顺序返回本次显式同步后的关系摘要。"""
        return [
            connection
            for task_index in sorted(self._connections_by_task)
            for connection in self._connections_by_task[task_index]
        ]

    def discard(self, task_indices: Sequence[int]) -> None:
        """丢弃未成功提交事务对应的关系摘要。"""
        for task_index in task_indices:
            self._connections_by_task.pop(task_index, None)
