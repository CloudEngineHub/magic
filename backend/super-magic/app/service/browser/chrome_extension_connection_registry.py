from __future__ import annotations

import asyncio

from magic_use.extension import ChromeExtensionConfig, ChromeExtensionConnection, TunnelProvider


class ChromeExtensionConnectionRegistry:
    """按沙盒复用用户 Chrome 的物理连接，不跨沙盒共享。"""

    _instance: "ChromeExtensionConnectionRegistry | None" = None

    def __init__(self) -> None:
        self._connections: dict[str, ChromeExtensionConnection] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "ChromeExtensionConnectionRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def get_or_create(
        self,
        sandbox_id: str,
        *,
        extension_config: ChromeExtensionConfig,
        tunnel_provider: TunnelProvider,
    ) -> ChromeExtensionConnection:
        async with self._lock:
            current = self._connections.get(sandbox_id)
            if current is not None and not current.closed:
                return current
            connection = ChromeExtensionConnection(
                config=extension_config,
                tunnel_provider=tunnel_provider,
            )
            connection.add_closed_callback(
                lambda closed_connection: self.discard_closed(sandbox_id, closed_connection)
            )
            self._connections[sandbox_id] = connection
            return connection

    def discard_closed(self, sandbox_id: str, connection: ChromeExtensionConnection) -> None:
        if connection.closed and self._connections.get(sandbox_id) is connection:
            self._connections.pop(sandbox_id, None)
