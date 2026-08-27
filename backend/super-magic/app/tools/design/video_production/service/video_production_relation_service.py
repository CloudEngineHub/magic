"""视频制作画布业务关系服务。"""

from __future__ import annotations

from typing import Iterable, Literal, Sequence

from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
)
from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator
from app.tools.design.domain.services.connection_service import ConnectionService


class VideoProductionRelationService:
    """集中校验并同步视频制作工具拥有的锁定业务关系。"""

    @classmethod
    def synchronize_incoming(
        cls,
        canvas: CanvasDocumentV3,
        target_element_id: str,
        source_element_ids: Sequence[str],
    ) -> list[CanvasConnection]:
        """同步目标节点的锁定入边，并保留用户创建的未锁定关系。"""
        return cls._synchronize(
            canvas,
            owner_element_id=target_element_id,
            counterpart_element_ids=source_element_ids,
            direction="incoming",
        )

    @classmethod
    def synchronize_outgoing(
        cls,
        canvas: CanvasDocumentV3,
        source_element_id: str,
        target_element_ids: Sequence[str],
    ) -> list[CanvasConnection]:
        """同步来源节点的锁定出边，并保留用户创建的未锁定关系。"""
        return cls._synchronize(
            canvas,
            owner_element_id=source_element_id,
            counterpart_element_ids=target_element_ids,
            direction="outgoing",
        )

    @staticmethod
    def to_summaries(connections: Iterable[CanvasConnection]) -> list[dict[str, str]]:
        """把关系转换为工具结果使用的稳定摘要。"""
        return [
            {
                "connection_id": connection.id,
                "source_element_id": connection.source_element_id,
                "target_element_id": connection.target_element_id,
            }
            for connection in connections
        ]

    @classmethod
    def _synchronize(
        cls,
        canvas: CanvasDocumentV3,
        *,
        owner_element_id: str,
        counterpart_element_ids: Sequence[str],
        direction: Literal["incoming", "outgoing"],
    ) -> list[CanvasConnection]:
        """按方向同步一组显式关系，不依据 Element 类型推断业务语义。"""
        owner = canvas.get_element(owner_element_id)
        if owner is None:
            raise ValueError(f"Connection owner does not exist: {owner_element_id}")

        counterpart_ids = cls._normalize_ids(counterpart_element_ids)
        desired: list[CanvasConnection] = []
        for counterpart_id in counterpart_ids:
            if counterpart_id == owner_element_id:
                raise ValueError("Connection must not connect an Element to itself")
            if canvas.get_element(counterpart_id) is None:
                raise ValueError(f"Connection counterpart does not exist: {counterpart_id}")
            source_id, target_id = (
                (counterpart_id, owner_element_id)
                if direction == "incoming"
                else (owner_element_id, counterpart_id)
            )
            desired.append(
                CanvasConnection(
                    id=CanvasIdGenerator.generate_connection_id(),
                    source_element_id=source_id,
                    target_element_id=target_id,
                    locked=True,
                )
            )

        desired_pairs = {
            (connection.source_element_id, connection.target_element_id)
            for connection in desired
        }
        for existing in list(canvas.connections):
            if not existing.locked:
                continue
            belongs_to_owner = (
                existing.target_element_id == owner_element_id
                if direction == "incoming"
                else existing.source_element_id == owner_element_id
            )
            if not belongs_to_owner:
                continue
            pair = (existing.source_element_id, existing.target_element_id)
            if pair not in desired_pairs:
                ConnectionService.delete_connection(canvas, existing.id, force=True)

        return [
            ConnectionService.ensure_connection(canvas, connection)
            for connection in desired
        ]

    @staticmethod
    def _normalize_ids(element_ids: Sequence[str]) -> list[str]:
        """去除空白和重复 ID，同时保持调用方给出的顺序。"""
        normalized: list[str] = []
        for element_id in element_ids:
            value = str(element_id).strip()
            if not value:
                raise ValueError("Connection Element ID must not be empty")
            if value not in normalized:
                normalized.append(value)
        return normalized
