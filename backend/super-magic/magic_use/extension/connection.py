from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from uuid import uuid4

from magic_use.errors import BrowserConfigError, BrowserConnectionError
from magic_use.extension.config import ChromeExtensionConfig
from magic_use.extension.pairing import PairingDetails
from magic_use.extension.peer import ExtensionPeer
from magic_use.extension.relay_server import ExtensionRelayServer
from magic_use.extension.tunnel import TunnelProvider
from magic_use.remote_protocol import RemoteMethod

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _CloseResources:
    connect_task: asyncio.Task[None] | None
    relay: ExtensionRelayServer | None
    callbacks: tuple[Callable[["ChromeExtensionConnection"], None], ...]


class ChromeExtensionConnection:
    """一条扩展物理连接，为多个逻辑 Browser session 复用 relay 和 tunnel。"""

    def __init__(
        self,
        *,
        config: ChromeExtensionConfig,
        tunnel_provider: TunnelProvider | None = None,
        relay: ExtensionRelayServer | None = None,
    ) -> None:
        self.config = config
        self.connection_id = f"connection_{uuid4().hex}"
        self._relay = relay
        if self._relay is None and tunnel_provider is not None:
            self._relay = ExtensionRelayServer(config=config, tunnel_provider=tunnel_provider)
        self._pairing_details: PairingDetails | None = None
        self._peer: ExtensionPeer | None = None
        self._connect_task: asyncio.Task[None] | None = None
        self._logical_sessions: dict[str, str] = {}
        self._closed_callbacks: list[Callable[[ChromeExtensionConnection], None]] = []
        self._lock = asyncio.Lock()
        self._closed = False

    @property
    def pairing_details(self) -> PairingDetails | None:
        return self._pairing_details

    @property
    def peer(self) -> ExtensionPeer | None:
        return self._peer

    @property
    def closed(self) -> bool:
        return self._closed

    def add_closed_callback(self, callback: Callable[[ChromeExtensionConnection], None]) -> None:
        """注册物理连接关闭通知，供宿主及时移除长期 registry 引用。"""
        if self._closed:
            callback(self)
            return
        self._closed_callbacks.append(callback)

    async def acquire_session(self, logical_session_id: str, label: str) -> PairingDetails:
        async with self._lock:
            if self._closed:
                raise BrowserConnectionError("Chrome extension connection is closed")
            await self._ensure_started()
            self._logical_sessions[logical_session_id] = label
            pairing = self._pairing_details
            peer = self._peer
        if pairing is None:
            raise BrowserConnectionError("Chrome extension pairing did not start")
        if peer is not None and peer.connected:
            try:
                await self._register_session(peer, logical_session_id, label)
            except BaseException:
                await self.release_session(logical_session_id)
                raise
        return pairing

    async def wait_for_peer(self, timeout_seconds: float | None = None) -> ExtensionPeer:
        task = self._connect_task
        if task is None:
            raise BrowserConnectionError("Chrome extension pairing has not started")
        if timeout_seconds is None:
            await asyncio.shield(task)
        else:
            await asyncio.wait_for(asyncio.shield(task), timeout=timeout_seconds)
        peer = self._peer
        if peer is None or not peer.connected:
            raise BrowserConnectionError("Chrome extension is not connected")
        return peer

    async def release_session(self, logical_session_id: str) -> None:
        async with self._lock:
            label = self._logical_sessions.pop(logical_session_id, None)
            peer = self._peer
            should_close = not self._logical_sessions
        if label is not None and peer is not None and peer.connected:
            try:
                await peer.request(
                    RemoteMethod.SESSION_RELEASE,
                    logical_session_id=logical_session_id,
                )
            except Exception:
                pass
        if should_close:
            await self._close_if_unused()

    async def close(self) -> None:
        async with self._lock:
            if self._closed:
                return
            resources = self._begin_close_locked()
        await self._finish_close(resources)

    async def _close_if_unused(self) -> None:
        async with self._lock:
            if self._closed or self._logical_sessions:
                return
            resources = self._begin_close_locked()
        await self._finish_close(resources)

    def _begin_close_locked(self) -> _CloseResources:
        self._closed = True
        resources = _CloseResources(
            connect_task=self._connect_task,
            relay=self._relay,
            callbacks=tuple(self._closed_callbacks),
        )
        self._connect_task = None
        self._relay = None
        self._peer = None
        self._pairing_details = None
        self._logical_sessions.clear()
        self._closed_callbacks.clear()
        return resources

    async def _finish_close(self, resources: _CloseResources) -> None:
        task = resources.connect_task
        if task is not None and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        try:
            if resources.relay is not None:
                await resources.relay.close()
        finally:
            for callback in resources.callbacks:
                try:
                    callback(self)
                except Exception:
                    logger.exception("Chrome extension close callback failed")

    async def _ensure_started(self) -> None:
        if self._connect_task is not None:
            return
        relay = self._relay
        if relay is None:
            raise BrowserConfigError(
                "ChromeExtensionConnection requires a TunnelProvider or a prepared ExtensionRelayServer"
            )
        self._pairing_details = await relay.start(self.connection_id)
        self._connect_task = asyncio.create_task(self._establish_peer(relay))
        self._connect_task.add_done_callback(self._observe_connect_task)

    async def _establish_peer(self, relay: ExtensionRelayServer) -> None:
        try:
            peer = await relay.wait_for_peer()
            async with self._lock:
                if self._closed:
                    return
                self._peer = peer
                sessions = tuple(self._logical_sessions.items())
            for logical_session_id, label in sessions:
                await self._register_session(peer, logical_session_id, label)
        except BaseException:
            await self.close()
            raise

    @staticmethod
    async def _register_session(peer: ExtensionPeer, logical_session_id: str, label: str) -> None:
        await peer.request(
            RemoteMethod.SESSION_REGISTER,
            {"label": label},
            logical_session_id=logical_session_id,
        )

    @staticmethod
    def _observe_connect_task(task: asyncio.Task[None]) -> None:
        if not task.cancelled():
            task.exception()
