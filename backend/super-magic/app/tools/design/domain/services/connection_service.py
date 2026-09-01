"""Canvas Connection 领域服务。"""

from typing import Iterable, Literal, Set

from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
)


class ConnectionService:
    """集中维护 Element 级 Connection 的局部不变量。"""

    @staticmethod
    def add_connection(
        canvas: CanvasDocumentV3,
        connection: CanvasConnection,
    ) -> CanvasConnection:
        """新增一条明确的 Element 级 Connection。"""
        if any(item.id == connection.id for item in canvas.connections):
            raise ValueError(f"Duplicate connection ID: {connection.id}")
        if canvas.get_element(connection.source_element_id) is None:
            raise ValueError(f"Connection source does not exist: {connection.source_element_id}")
        if canvas.get_element(connection.target_element_id) is None:
            raise ValueError(f"Connection target does not exist: {connection.target_element_id}")
        if connection.source_element_id == connection.target_element_id:
            raise ValueError("Connection must not connect an Element to itself")
        for existing in canvas.connections:
            existing_pair = {existing.source_element_id, existing.target_element_id}
            new_pair = {connection.source_element_id, connection.target_element_id}
            if existing_pair == new_pair:
                raise ValueError("Duplicate or reverse duplicate Connection is not allowed")
        canvas.connections.append(connection)
        return connection

    @staticmethod
    def ensure_connection(
        canvas: CanvasDocumentV3,
        connection: CanvasConnection,
    ) -> CanvasConnection:
        """幂等确保一条同向 Connection 存在，并按需升级锁定状态。"""
        existing = next(
            (
                item
                for item in canvas.connections
                if item.source_element_id == connection.source_element_id
                and item.target_element_id == connection.target_element_id
            ),
            None,
        )
        if existing is not None:
            if connection.locked:
                existing.locked = True
            return existing
        return ConnectionService.add_connection(canvas, connection)

    @staticmethod
    def reconcile_locked_connections(
        canvas: CanvasDocumentV3,
        desired_connections: Iterable[CanvasConnection],
        *,
        owner_element_id: str,
        direction: Literal["outgoing", "incoming"],
        counterpart_types: Set[str],
    ) -> list[CanvasConnection]:
        """在一个事务内同步工具管理的锁定连接集合。

        只有满足“锁定、方向、对端类型、属于当前 owner”的既有连接才会被视为
        工具管理关系。过期关系使用 force 删除；未锁定连接不会被触碰，以保留
        用户手工建立的关系。
        """
        desired = list(desired_connections)
        desired_pairs = {
            (connection.source_element_id, connection.target_element_id)
            for connection in desired
        }

        for connection in desired:
            if not connection.locked:
                raise ValueError("Managed Canvas connections must be locked")
            if direction == "outgoing" and connection.source_element_id != owner_element_id:
                raise ValueError("Managed outgoing connection source does not match owner")
            if direction == "incoming" and connection.target_element_id != owner_element_id:
                raise ValueError("Managed incoming connection target does not match owner")

        stale_connections: list[CanvasConnection] = []
        for existing in list(canvas.connections):
            if not existing.locked:
                continue
            if direction == "outgoing":
                if existing.source_element_id != owner_element_id:
                    continue
                counterpart_id = existing.target_element_id
            else:
                if existing.target_element_id != owner_element_id:
                    continue
                counterpart_id = existing.source_element_id
            counterpart = canvas.get_element(counterpart_id)
            if counterpart is None or counterpart.type not in counterpart_types:
                continue
            pair = (existing.source_element_id, existing.target_element_id)
            if pair not in desired_pairs:
                stale_connections.append(existing)

        for stale in stale_connections:
            ConnectionService.delete_connection(canvas, stale.id, force=True)

        return [ConnectionService.ensure_connection(canvas, connection) for connection in desired]

    @staticmethod
    def set_locked(
        canvas: CanvasDocumentV3,
        connection_id: str,
        locked: bool,
    ) -> CanvasConnection:
        """更新指定 Connection 的锁定状态。"""
        connection = next((item for item in canvas.connections if item.id == connection_id), None)
        if connection is None:
            raise ValueError(f"Connection does not exist: {connection_id}")
        connection.locked = locked
        return connection

    @staticmethod
    def delete_connection(
        canvas: CanvasDocumentV3,
        connection_id: str,
        *,
        force: bool = False,
    ) -> CanvasConnection:
        """删除 Connection；锁定连接仅允许业务清理强制删除。"""
        connection = next((item for item in canvas.connections if item.id == connection_id), None)
        if connection is None:
            raise ValueError(f"Connection does not exist: {connection_id}")
        if connection.locked and not force:
            raise ValueError(f"Connection is locked: {connection_id}")
        canvas.connections.remove(connection)
        return connection

    @staticmethod
    def remove_for_element(canvas: CanvasDocumentV3, element_id: str) -> int:
        """删除 Element 时清理其全部入边和出边。"""
        before = len(canvas.connections)
        canvas.connections = [
            connection
            for connection in canvas.connections
            if connection.source_element_id != element_id
            and connection.target_element_id != element_id
        ]
        return before - len(canvas.connections)
