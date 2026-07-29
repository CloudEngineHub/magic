from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from magic_use.config import BrowserRuntimeConfig
from magic_use.errors import BrowserConnectionError, BrowserErrorCode, BrowserSDKError
from magic_use.extension import (
    ChromeExtensionConfig,
    ChromeExtensionConnection,
    ExtensionPeer,
    ExtensionRelayServer,
    PairingDetails,
    TunnelProvider,
)
from magic_use.extension.observer import ChromeExtensionObserver
from magic_use.extension.page_registry import ExtensionPageRegistry
from magic_use.extension.result_parser import ExtensionResultParser
from magic_use.models import (
    ActionKind,
    ActionOutcome,
    ActionRequest,
    ActionResult,
    ActionTarget,
    BrowserCapabilities,
    BrowserEvent,
    BrowserEventType,
    BrowserIdentity,
    BrowserName,
    BrowserPage,
    BrowserSession,
    ConsoleEntry,
    NavigationResult,
    NetworkEntry,
    PageSnapshot,
    ScreenshotResult,
    SessionState,
    SnapshotNode,
    SnapshotOptions,
    SnapshotScope,
    WaitConditionKind,
    WaitRequest,
)
from magic_use.models.common import BrowserBackendKind, JsonValue
from magic_use.remote_protocol import PageDescriptor, RemoteMethod


class ChromeExtensionBackend:
    """通过临时 Relay 控制用户明确授权的 Chrome 标签页。"""

    def __init__(
        self,
        config: BrowserRuntimeConfig,
        *,
        extension_config: ChromeExtensionConfig | None = None,
        tunnel_provider: TunnelProvider | None = None,
        relay: ExtensionRelayServer | None = None,
        connection: ChromeExtensionConnection | None = None,
        session_label: str | None = None,
    ) -> None:
        self._config = config
        resolved_extension_config = extension_config or ChromeExtensionConfig()
        self._connection = connection or ChromeExtensionConnection(
            config=resolved_extension_config,
            tunnel_provider=tunnel_provider,
            relay=relay,
        )
        self._session_id = f"session_{uuid4().hex}"
        self._session_label = session_label or self._session_id
        self._created_at = datetime.now(timezone.utc)
        self._state = SessionState.STARTING
        self._pairing_details: PairingDetails | None = None
        self._peer: ExtensionPeer | None = None
        self._connect_task: asyncio.Task[None] | None = None
        self._peer_setup_lock = asyncio.Lock()
        self._configured_peer_generation = 0
        self._pages = ExtensionPageRegistry(self._session_id)
        self._parser = ExtensionResultParser(self._session_id, self._pages)
        self._observer = ChromeExtensionObserver(
            config=config,
            pages=self._pages,
            peer_provider=self._require_peer,
            logical_session_id=self._session_id,
            binary_timeout_seconds=resolved_extension_config.request_timeout_seconds,
        )
        self._events: list[BrowserEvent] = []

    @property
    def pairing_details(self) -> PairingDetails | None:
        return self._connection.pairing_details

    async def start(self) -> BrowserSession:
        if self._state is SessionState.CONNECTED:
            return await self.get_session()
        try:
            self._pairing_details = await self._connection.acquire_session(
                self._session_id,
                self._session_label,
            )
            self._connect_task = asyncio.create_task(self._establish_peer())
            self._connect_task.add_done_callback(self._observe_connect_task)
            return await self.get_session()
        except asyncio.CancelledError:
            await self.close()
            raise
        except Exception:
            self._state = SessionState.FAILED
            raise

    async def wait_until_connected(self, timeout_seconds: float | None = None) -> BrowserSession:
        task = self._connect_task
        if task is None:
            raise BrowserConnectionError("Chrome extension pairing has not started")
        try:
            if timeout_seconds is None:
                await asyncio.shield(task)
            else:
                await asyncio.wait_for(asyncio.shield(task), timeout=timeout_seconds)
        except asyncio.CancelledError:
            await self.close()
            raise
        return await self.get_session()

    async def close(self) -> None:
        if self._state is SessionState.CLOSED:
            return
        task = self._connect_task
        self._connect_task = None
        if task is not None and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        await self._connection.release_session(self._session_id)
        self._peer = None
        self._pairing_details = None
        self._observer.clear()
        self._pages.clear()
        self._state = SessionState.CLOSED
        self._emit(BrowserEventType.SESSION_CLOSED, None)

    async def get_session(self) -> BrowserSession:
        self._sync_peer_state()
        pages = await self.list_pages() if self._state is SessionState.CONNECTED else ()
        capabilities = await self.get_capabilities()
        return BrowserSession(
            id=self._session_id,
            backend=BrowserBackendKind.CHROME_EXTENSION,
            state=self._effective_state(),
            capabilities=capabilities,
            created_at=self._created_at,
            expires_at=self._peer.lease_expires_at if self._peer is not None else None,
            browser_identity=BrowserIdentity(
                name=BrowserName.CHROMIUM,
                version=capabilities.browser_version,
            ),
            page_ids=tuple(page.id for page in pages),
        )

    async def get_capabilities(self) -> BrowserCapabilities:
        self._sync_peer_state()
        peer = self._peer
        remote = peer.capabilities if peer is not None else None
        return BrowserCapabilities(
            browser_name=BrowserName.CHROMIUM,
            browser_version=peer.identity.browser_version if peer is not None else "",
            backend=BrowserBackendKind.CHROME_EXTENSION,
            protocol_version=peer.protocol_version if peer is not None else "1.0",
            accessibility_tree=remote.accessibility_tree if remote is not None else False,
            dom_snapshot=remote.dom_snapshot if remote is not None else False,
            page_script=remote.page_script if remote is not None else False,
            screenshots=remote.screenshots if remote is not None else False,
            labeled_screenshots=(remote.labeled_screenshots if remote is not None else False)
            and self._config.scripts.marker_enabled,
            console=remote.console if remote is not None else False,
            network=remote.network if remote is not None else False,
            file_upload=False,
            downloads=remote.downloads if remote is not None else False,
        )

    async def list_pages(self) -> tuple[BrowserPage, ...]:
        peer = await self._prepare_peer()
        result = await self._request(peer, RemoteMethod.PAGE_LIST)
        previous_page_ids = set(self._pages.page_ids)
        pages = self._pages.sync_payload(result.get("pages", []))
        active_page_ids = {page.id for page in pages}
        for removed_page_id in previous_page_ids - active_page_ids:
            self._observer.clear_page(removed_page_id)
        return pages

    async def open_page(self, url: str = "about:blank") -> BrowserPage:
        peer = await self._prepare_peer()
        result = await self._request(peer, RemoteMethod.PAGE_OPEN, {"url": url})
        return self._pages.from_descriptor(PageDescriptor.from_payload(result.get("page")))

    async def close_page(self, page_id: str) -> None:
        page_token = self._pages.require_token(page_id)
        peer = await self._prepare_peer()
        await self._request(peer, RemoteMethod.PAGE_CLOSE, {"page_token": page_token})
        self._observer.clear_page(page_id)
        self._pages.forget(page_id)

    async def activate_page(self, page_id: str) -> BrowserPage:
        peer = await self._prepare_peer()
        result = await self._request(
            peer,
            RemoteMethod.PAGE_ACTIVATE,
            {"page_token": self._pages.require_token(page_id)},
        )
        return self._pages.from_descriptor(PageDescriptor.from_payload(result.get("page")))

    async def keep_page_alive(self, page_id: str, extension_seconds: float) -> BrowserPage:
        """用户 Chrome 标签页不由沙盒 TTL 关闭；校验授权后直接返回当前页面。"""
        del extension_seconds
        pages = await self.list_pages()
        for page in pages:
            if page.id == page_id:
                return page
        raise BrowserSDKError(BrowserErrorCode.PAGE_NOT_FOUND, f"Browser page is not available: {page_id}")

    async def navigate(
        self,
        page_id: str,
        url: str,
        wait_until: str = "domcontentloaded",
        *,
        referer: str | None = None,
    ) -> BrowserPage:
        try:
            peer = await self._prepare_peer()
            result = await self._request(
                peer,
                RemoteMethod.PAGE_NAVIGATE,
                {
                    "page_token": self._pages.require_token(page_id),
                    "url": url,
                    "wait_until": wait_until,
                    "timeout_ms": self._config.timeouts.navigation_ms,
                    "referer": referer,
                },
                timeout_seconds=self._config.timeouts.navigation_ms / 1000,
            )
            page = self._pages.from_descriptor(PageDescriptor.from_payload(result.get("page")))
            return page
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._emit(BrowserEventType.NAVIGATION_FAILED, page_id, {"url": url, "error": str(error)})
            raise

    async def wait(self, page_id: str, request: WaitRequest) -> None:
        if request.condition is WaitConditionKind.TIME:
            await asyncio.sleep((request.duration_ms or 0) / 1000)
            return
        if request.condition is WaitConditionKind.REF:
            await self._wait_for_ref(page_id, request)
            return
        peer = await self._prepare_peer()
        await self._request(
            peer,
            RemoteMethod.PAGE_WAIT,
            {
                "page_token": self._pages.require_token(page_id),
                "condition": request.condition.value,
                "timeout_ms": request.timeout_ms,
                "value": request.value,
                "state": request.state or ("load" if request.condition is WaitConditionKind.LOAD_STATE else None),
            },
            timeout_seconds=request.timeout_ms / 1000 + 1,
        )

    async def evaluate(self, page_id: str, expression: str, argument: JsonValue = None) -> JsonValue:
        await self._prepare_peer()
        return await self._observer.evaluate(page_id, expression, argument)

    async def read_page(self, page_id: str, scope: str = "viewport") -> str:
        peer = await self._prepare_peer()
        await self._request(
            peer,
            RemoteMethod.PAGE_WAIT,
            {
                "page_token": self._pages.require_token(page_id),
                "condition": "stable",
                "timeout_ms": self._config.timeouts.stability_timeout_ms,
                "network_quiet_ms": self._config.timeouts.network_quiet_ms,
                "dom_quiet_ms": self._config.timeouts.dom_quiet_ms,
            },
            timeout_seconds=self._config.timeouts.stability_timeout_ms / 1000 + 1,
        )
        return await self._observer.read_page(page_id, scope)

    async def snapshot(
        self,
        page_id: str,
        options: SnapshotOptions | None = None,
    ) -> PageSnapshot:
        await self._prepare_peer()
        page = await self._describe_page(page_id)
        return await self._observer.snapshot(page, options or SnapshotOptions())

    async def describe_ref(self, page_id: str, ref: str) -> ActionTarget:
        await self._prepare_peer()
        return self._observer.describe_ref(await self._describe_page(page_id), ref)

    async def dispatch_action(self, page_id: str, request: ActionRequest) -> ActionResult:
        peer = await self._prepare_peer()
        if request.action is ActionKind.UPLOAD:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "File upload is unavailable without a local Chrome companion",
            )
        page_before = await self._describe_page(page_id)
        backend_node_id = None
        record = None
        if request.ref is not None:
            resolved = await self._observer.resolve_ref(page_before, request.ref)
            record = resolved.record
            backend_node_id = resolved.backend_node_id
        elif request.action not in {ActionKind.SCROLL, ActionKind.PRESS}:
            raise BrowserSDKError(BrowserErrorCode.REF_NOT_FOUND, "This action requires an element ref")

        result = await self._request(
            peer,
            RemoteMethod.ACTION_DISPATCH,
            {
                "page_token": self._pages.require_token(page_id),
                "backend_node_id": backend_node_id,
                "action": request.action.value,
                "text": request.text,
                "key": request.key,
                "value": request.value,
                "checked": request.checked,
                "delta_x": request.delta_x,
                "delta_y": request.delta_y,
                "settle_ms": self._config.timeouts.action_settle_ms,
                "stability_timeout_ms": self._config.timeouts.stability_timeout_ms,
                "network_quiet_ms": self._config.timeouts.network_quiet_ms,
                "dom_quiet_ms": self._config.timeouts.dom_quiet_ms,
            },
            timeout_seconds=self._config.timeouts.stability_timeout_ms / 1000 + 1,
        )
        page_after = self._pages.from_descriptor(PageDescriptor.from_payload(result.get("page")))
        opened_pages = self._pages.from_payload(result.get("opened_pages"))
        snapshot_diff = None
        try:
            changed = await self._observer.snapshot(
                page_after,
                SnapshotOptions(scope=SnapshotScope.CHANGES),
                update_baseline=False,
            )
            snapshot_diff = changed.diff
        except BrowserSDKError:
            pass
        return ActionResult(
            ok=True,
            action=request.action,
            page_id=page_id,
            ref=request.ref,
            outcome=ActionOutcome.DISPATCHED,
            navigation=NavigationResult(page=page_after, committed=True)
            if page_after.document_generation > page_before.document_generation
            else None,
            opened_pages=opened_pages,
            downloads=self._parser.string_tuple(result.get("downloads")),
            dialogs=self._parser.string_tuple(result.get("dialogs")),
            snapshot_diff=snapshot_diff,
            target=ActionTarget.from_ref_record(record) if record is not None else None,
            message="The browser action was dispatched.",
        )

    async def screenshot(
        self,
        page_id: str,
        *,
        full_page: bool = False,
        labels: bool = False,
    ) -> ScreenshotResult:
        await self._prepare_peer()
        return await self._observer.screenshot(
            await self._describe_page(page_id),
            full_page=full_page,
            labels=labels,
        )

    async def read_console(self, page_id: str, *, clear: bool = True) -> tuple[ConsoleEntry, ...]:
        peer = await self._prepare_peer()
        result = await self._request(
            peer,
            RemoteMethod.DIAGNOSTICS_CONSOLE,
            {"page_token": self._pages.require_token(page_id), "clear": clear},
        )
        return self._parser.console_entries(page_id, result.get("entries", []))

    async def read_network(self, page_id: str, *, clear: bool = True) -> tuple[NetworkEntry, ...]:
        peer = await self._prepare_peer()
        result = await self._request(
            peer,
            RemoteMethod.DIAGNOSTICS_NETWORK,
            {"page_token": self._pages.require_token(page_id), "clear": clear},
        )
        return self._parser.network_entries(page_id, result.get("entries", []))

    async def drain_events(self) -> tuple[BrowserEvent, ...]:
        self._sync_peer_state()
        peer = self._peer
        if peer is not None:
            for message in peer.drain_events(self._session_id):
                event = self._parser.event(message.payload)
                if event is not None:
                    if event.type is BrowserEventType.PAGE_CLOSED and event.page_id is not None:
                        self._observer.clear_page(event.page_id)
                    self._events.append(event)
        result = tuple(self._events)
        self._events.clear()
        return result

    async def _establish_peer(self) -> None:
        try:
            self._peer = await self._connection.wait_for_peer()
            await self._prepare_peer()
            self._state = SessionState.CONNECTED
            self._emit(BrowserEventType.SESSION_CONNECTED, None)
            await self.list_pages()
        except asyncio.CancelledError:
            raise
        except Exception:
            self._state = SessionState.FAILED
            raise

    async def _describe_page(self, page_id: str) -> BrowserPage:
        pages = await self.list_pages()
        for page in pages:
            if page.id == page_id:
                return page
        raise BrowserSDKError(BrowserErrorCode.PAGE_NOT_FOUND, f"Browser page does not exist: {page_id}")

    async def _wait_for_ref(self, page_id: str, request: WaitRequest) -> None:
        deadline = asyncio.get_running_loop().time() + request.timeout_ms / 1000
        expected = request.state or "attached"
        while True:
            snapshot = await self._observer.snapshot(
                await self._describe_page(page_id),
                SnapshotOptions(scope=SnapshotScope.INTERACTIVE),
                update_baseline=False,
            )
            node = self._find_ref(snapshot, request.value or "")
            if self._ref_state_matches(node, expected):
                return
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"Timed out waiting for ref {request.value} to become {expected}")
            await asyncio.sleep(0.1)

    def _require_peer(self) -> ExtensionPeer:
        self._sync_peer_state()
        peer = self._peer
        if peer is None or not peer.connected:
            raise BrowserConnectionError("Chrome extension is not connected")
        return peer

    async def _prepare_peer(self) -> ExtensionPeer:
        async with self._peer_setup_lock:
            peer = self._require_peer()
            if self._configured_peer_generation != peer.connection_generation:
                await peer.request(
                    RemoteMethod.SESSION_REGISTER,
                    {"label": self._session_label},
                    logical_session_id=self._session_id,
                )
                await self._observer.register_document_scripts(peer)
                self._configured_peer_generation = peer.connection_generation
            return peer

    def _effective_state(self) -> SessionState:
        return self._state

    def _sync_peer_state(self) -> None:
        self._peer = self._connection.peer
        peer_connected = self._peer is not None and self._peer.connected
        if self._state is SessionState.CONNECTED and not peer_connected:
            self._state = SessionState.DISCONNECTED
            self._observer.clear()
            self._emit(BrowserEventType.SESSION_DISCONNECTED, None)
        elif self._state is SessionState.DISCONNECTED and peer_connected:
            self._state = SessionState.CONNECTED
            self._emit(BrowserEventType.SESSION_RESUMED, None)

    def _emit(
        self,
        event_type: BrowserEventType,
        page_id: str | None,
        data: dict[str, JsonValue] | None = None,
    ) -> None:
        self._events.append(
            BrowserEvent(
                type=event_type,
                session_id=self._session_id,
                page_id=page_id,
                occurred_at=datetime.now(timezone.utc),
                data=data or {},
            )
        )
        overflow = len(self._events) - self._config.event_buffer_size
        if overflow > 0:
            del self._events[:overflow]

    async def _request(
        self,
        peer: ExtensionPeer,
        method: RemoteMethod,
        payload: dict[str, JsonValue] | None = None,
        *,
        timeout_seconds: float | None = None,
    ) -> dict[str, JsonValue]:
        return await peer.request(
            method,
            payload,
            logical_session_id=self._session_id,
            timeout_seconds=timeout_seconds,
        )

    @staticmethod
    def _observe_connect_task(task: asyncio.Task[None]) -> None:
        if task.cancelled():
            return
        task.exception()

    @staticmethod
    def _find_ref(snapshot: PageSnapshot, ref: str) -> SnapshotNode | None:
        stack = list(snapshot.root_nodes)
        while stack:
            node = stack.pop()
            if node.ref == ref:
                return node
            stack.extend(node.children)
        return None

    @staticmethod
    def _ref_state_matches(node: SnapshotNode | None, expected_state: str) -> bool:
        if expected_state == "detached":
            return node is None
        if node is None:
            return False
        if expected_state == "attached":
            return True
        if expected_state == "visible":
            return node.visible
        if expected_state == "hidden":
            return not node.visible
        states = node.states
        if expected_state == "enabled":
            return "disabled" not in states
        if expected_state == "disabled":
            return "disabled" in states
        raise ValueError(f"Unsupported ref wait state: {expected_state}")
