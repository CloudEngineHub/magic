"""初始化图片生成的预占初始化实现。"""

from __future__ import annotations

from typing import Any, Sequence

from app.tools.design.domain.canvas_document import CanvasConnection
from app.tools.design.domain.generation_initializer import (
    CanvasGenerationInitializationContext,
)
from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.video_production.service.media_generation_service import (
    MediaGenerationService,
    PreparedMediaSource,
)
from app.tools.design.video_production.service.video_production_generation_initializer import (
    VideoProductionGenerationInitializer,
)


class InitializationImageGenerationInitializer(VideoProductionGenerationInitializer):
    """在初始化图片生成开始前登记来源素材并建立直接上游关系。"""

    def __init__(
        self,
        manager: CanvasManagerProtocol,
        sources_by_task: Sequence[Sequence[PreparedMediaSource]],
    ) -> None:
        """保存画布管理器、任务来源快照和事务提交后的关系摘要。"""
        self._manager = manager
        self._sources_by_task = tuple(tuple(sources) for sources in sources_by_task)
        self._connections_by_task: dict[int, list[dict[str, str]]] = {}

    async def apply_batch(
        self,
        config: Any,
        contexts: Sequence[CanvasGenerationInitializationContext],
    ) -> dict[int, dict[str, Any]]:
        """在同一事务内登记来源、连接初始化图片并完成增量布局。"""
        results: dict[int, dict[str, Any]] = {}
        created_source_ids: list[str] = []
        for context in contexts:
            registrations = await MediaGenerationService.ensure_canvas_assets(
                self._manager,
                config,
                self._sources_by_task[context.task_index],
            )
            created_source_ids.extend(
                registration.element_id
                for registration in registrations
                if registration.created
            )

            connections = self._ensure_source_connections(
                config.canvas,
                context,
                [registration.element_id for registration in registrations],
            )
            self._connections_by_task[context.task_index] = connections
            results[context.task_index] = {"connections": connections}

        VideoProductionGenerationInitializer.layout_elements(
            config,
            [
                *created_source_ids,
                *(context.element_id for context in contexts if context.element_created),
            ],
        )
        return results

    def get_connections(self) -> list[dict[str, str]]:
        """按任务顺序返回随 processing 状态提交的来源关系。"""
        return [
            connection
            for task_index in sorted(self._connections_by_task)
            for connection in self._connections_by_task[task_index]
        ]

    def discard(self, task_indices: Sequence[int]) -> None:
        """丢弃事务提交失败所对应的来源关系摘要。"""
        for task_index in task_indices:
            self._connections_by_task.pop(task_index, None)

    @staticmethod
    def _ensure_source_connections(
        canvas: Any,
        context: CanvasGenerationInitializationContext,
        source_element_ids: Sequence[str],
    ) -> list[dict[str, str]]:
        """为新建初始化图片建立来源关系，更新 Content 时保留 Element 关系。"""
        if not context.element_created:
            return []

        connections: list[dict[str, str]] = []
        for source_element_id in dict.fromkeys(source_element_ids):
            if source_element_id == context.element_id:
                continue
            connection = ConnectionService.ensure_connection(
                canvas,
                CanvasConnection(
                    id=CanvasIdGenerator.generate_connection_id(),
                    source_element_id=source_element_id,
                    target_element_id=context.element_id,
                    locked=True,
                ),
            )
            connections.append(
                {
                    "connection_id": connection.id,
                    "source_element_id": connection.source_element_id,
                    "target_element_id": connection.target_element_id,
                }
            )
        return connections
