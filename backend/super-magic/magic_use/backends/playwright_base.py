from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from magic_use.config import BrowserRuntimeConfig
from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.interaction import RefRegistry, RefResolver
from magic_use.models import (
    ActionKind,
    ActionOutcome,
    ActionRequest,
    ActionResult,
    ActionTarget,
    BrowserCapabilities,
    BrowserEvent,
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
from magic_use.models.common import BrowserBackendKind, BrowserEventType, JsonValue
from magic_use.observation.accessibility import AccessibilityCollector
from magic_use.observation.dom_snapshot import DOMSnapshotCollector
from magic_use.playwright import PlaywrightActionDispatcher, PlaywrightObserver, PlaywrightRuntime


class PlaywrightBackend(ABC):
    def __init__(self, config: BrowserRuntimeConfig) -> None:
        self._config = config
        self._runtime = PlaywrightRuntime(config)
        self._refs = RefRegistry()
        self._resolver = RefResolver(self._refs)
        self._observer = PlaywrightObserver(
            scripts=config.scripts,
            snapshot_config=config.snapshot,
            refs=self._refs,
        )
        self._actions = PlaywrightActionDispatcher()
        self._dom_collector = DOMSnapshotCollector()
        self._accessibility_collector = AccessibilityCollector()
        self._state = SessionState.STARTING
        self._created_at = datetime.now(timezone.utc)

    @property
    @abstractmethod
    def backend_kind(self) -> BrowserBackendKind: ...

    @abstractmethod
    async def _start_runtime(self) -> None: ...

    async def start(self) -> BrowserSession:
        if self._state is SessionState.CONNECTED:
            return await self.get_session()
        try:
            await self._start_runtime()
            self._runtime.set_document_ready_handler(self._observer.inject_document_scripts)
            self._runtime.set_disconnect_handler(self._mark_disconnected)
            self._runtime.set_context_idle_handler(self._close_after_context_idle)
            self._state = SessionState.CONNECTED
            self._runtime.emit(BrowserEventType.SESSION_CONNECTED, None)
            await self.open_page()
            return await self.get_session()
        except asyncio.CancelledError:
            await self.close()
            raise
        except Exception:
            await self._runtime.close()
            self._state = SessionState.FAILED
            raise

    async def close(self) -> None:
        if self._state is SessionState.CLOSED:
            return
        for page_id in tuple(self._runtime.pages):
            self._observer.clear_page(page_id)
        await self._runtime.close()
        self._runtime.emit(BrowserEventType.SESSION_CLOSED, None)
        self._state = SessionState.CLOSED

    async def get_session(self) -> BrowserSession:
        capabilities = await self.get_capabilities()
        pages = await self.list_pages() if self._state is SessionState.CONNECTED else ()
        identity = BrowserIdentity(
            name=self._config.browser_name,
            version=capabilities.browser_version,
        )
        return BrowserSession(
            id=self._runtime.session_id,
            backend=self.backend_kind,
            state=self._state,
            capabilities=capabilities,
            created_at=self._created_at,
            expires_at=min((page.expires_at for page in pages if page.expires_at is not None), default=None),
            browser_identity=identity,
            page_ids=tuple(page.id for page in pages),
        )

    async def get_capabilities(self) -> BrowserCapabilities:
        browser = self._runtime.browser
        browser_version = browser.version if browser is not None else ""
        chromium = self._config.browser_name is BrowserName.CHROMIUM
        return BrowserCapabilities(
            browser_name=self._config.browser_name,
            browser_version=browser_version,
            backend=self.backend_kind,
            protocol_version="1.0",
            accessibility_tree=chromium,
            dom_snapshot=chromium,
            page_script=True,
            screenshots=True,
            labeled_screenshots=chromium and self._config.scripts.marker_enabled,
            console=True,
            network=True,
            file_upload=chromium,
            downloads=True,
        )

    async def list_pages(self) -> tuple[BrowserPage, ...]:
        return await self._runtime.list_pages()

    async def open_page(self, url: str = "about:blank") -> BrowserPage:
        handle = await self._runtime.open_page()
        page = await self._runtime.describe_page(handle)
        if url == "about:blank":
            return page
        return await self.navigate(page.id, url)

    async def close_page(self, page_id: str) -> None:
        self._observer.clear_page(page_id)
        await self._runtime.close_page(page_id)

    async def activate_page(self, page_id: str) -> BrowserPage:
        handle = await self._runtime.activate_page(page_id)
        return await self._runtime.describe_page(handle)

    async def keep_page_alive(self, page_id: str, extension_seconds: float) -> BrowserPage:
        return await self._runtime.keep_page_alive(page_id, extension_seconds)

    async def navigate(
        self,
        page_id: str,
        url: str,
        wait_until: str = "domcontentloaded",
        *,
        referer: str | None = None,
    ) -> BrowserPage:
        handle = self._runtime.require_page(page_id)
        try:
            await handle.page.goto(
                url,
                wait_until=wait_until,
                timeout=self._config.timeouts.navigation_ms,
                referer=referer,
            )
            await self._observer.inject_document_scripts(handle.page)
            return await self._runtime.describe_page(handle)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._runtime.emit(
                BrowserEventType.NAVIGATION_FAILED,
                page_id,
                {"url": url, "error": str(error)},
            )
            raise BrowserSDKError(BrowserErrorCode.NAVIGATION_FAILED, f"Navigation failed: {error}") from error

    async def wait(self, page_id: str, request: WaitRequest) -> None:
        handle = self._runtime.require_page(page_id)
        wait_seconds = max(request.timeout_ms, request.duration_ms or 0) / 1000
        if wait_seconds > self._config.lifecycle.page_idle_seconds:
            self._runtime.touch_page(page_id, wait_seconds)
        if request.condition is WaitConditionKind.TIME:
            await handle.page.wait_for_timeout(request.duration_ms or 0)
            return
        if request.condition is WaitConditionKind.URL:
            await handle.page.wait_for_url(request.value or "", timeout=request.timeout_ms)
            return
        if request.condition is WaitConditionKind.LOAD_STATE:
            await handle.page.wait_for_load_state(request.state or "load", timeout=request.timeout_ms)
            return
        if request.condition is WaitConditionKind.TEXT:
            await handle.page.get_by_text(request.value or "", exact=False).first.wait_for(
                state=request.state or "visible",
                timeout=request.timeout_ms,
            )
            return
        if request.condition is WaitConditionKind.DOWNLOAD:
            await handle.page.wait_for_event("download", timeout=request.timeout_ms)
            return
        await self._wait_for_ref(page_id, request)

    async def evaluate(self, page_id: str, expression: str, argument: JsonValue = None) -> JsonValue:
        handle = self._runtime.require_page(page_id)
        return await handle.page.evaluate(expression, argument)

    async def read_page(self, page_id: str, scope: str = "viewport") -> str:
        await self._runtime.prepare_stability(page_id)
        await self._runtime.wait_for_stable(page_id)
        return await self._observer.read_page(self._runtime.require_page(page_id), scope)

    async def snapshot(
        self,
        page_id: str,
        options: SnapshotOptions | None = None,
    ) -> PageSnapshot:
        return await self._observer.snapshot(
            session_id=self._runtime.session_id,
            handle=self._runtime.require_page(page_id),
            options=options or SnapshotOptions(),
        )

    async def describe_ref(self, page_id: str, ref: str) -> ActionTarget:
        handle = self._runtime.require_page(page_id)
        record = self._refs.resolve(
            ref,
            page_id=page_id,
            document_generation=handle.document_generation,
        )
        return ActionTarget.from_ref_record(record)

    async def dispatch_action(self, page_id: str, request: ActionRequest) -> ActionResult:
        handle = self._runtime.require_page(page_id)
        generation_before = handle.document_generation
        record = None
        backend_node_id = None
        if request.ref is not None:
            if handle.cdp is None:
                raise BrowserSDKError(
                    BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                    "Ref actions require a Chromium CDP session",
                )
            dom_nodes = await self._dom_collector.collect(handle.cdp)
            accessibility_nodes = await self._accessibility_collector.collect(handle.cdp)
            resolved = self._resolver.resolve(
                request.ref,
                page_id=page_id,
                document_generation=handle.document_generation,
                dom_nodes=dom_nodes,
                accessibility_nodes=accessibility_nodes,
            )
            record = resolved.record
            backend_node_id = resolved.backend_node_id
        elif request.action not in {ActionKind.SCROLL, ActionKind.PRESS}:
            raise BrowserSDKError(BrowserErrorCode.REF_NOT_FOUND, "This action requires an element ref")

        before_pages = set(self._runtime.pages)
        event_offset = len(self._runtime.events)
        if handle.cdp is None:
            raise BrowserSDKError(
                BrowserErrorCode.CAPABILITY_UNAVAILABLE,
                "Browser actions require a Chromium CDP session",
            )
        await self._runtime.prepare_stability(page_id)
        await self._actions.dispatch(
            page=handle.page,
            cdp=handle.cdp,
            request=request,
            record=record,
            backend_node_id=backend_node_id,
        )
        await self._runtime.wait_for_stable(
            page_id,
            minimum_wait_ms=self._config.timeouts.action_settle_ms,
        )
        await self._runtime.wait_for_pending_pages()
        action_events = self._runtime.events[event_offset:]
        opened_pages: list[BrowserPage] = []
        for new_page_id in sorted(set(self._runtime.pages) - before_pages):
            opened_pages.append(
                await self._runtime.describe_page(self._runtime.pages[new_page_id])
            )
        snapshot_diff = None
        page_closed = handle.page.is_closed()
        if not page_closed:
            try:
                changed = await self._observer.snapshot(
                    session_id=self._runtime.session_id,
                    handle=handle,
                    options=SnapshotOptions(scope=SnapshotScope.CHANGES),
                    update_baseline=False,
                )
                snapshot_diff = changed.diff
            except BrowserSDKError:
                snapshot_diff = None
        return ActionResult(
            ok=True,
            action=request.action,
            page_id=page_id,
            ref=request.ref,
            outcome=ActionOutcome.DISPATCHED,
            navigation=NavigationResult(page=await self._runtime.describe_page(handle), committed=True)
            if not page_closed and handle.document_generation > generation_before
            else None,
            opened_pages=tuple(opened_pages),
            downloads=tuple(
                str(event.data.get("filename", ""))
                for event in action_events
                if event.type is BrowserEventType.DOWNLOAD_STARTED and event.page_id == page_id
            ),
            dialogs=tuple(
                str(event.data.get("message", ""))
                for event in action_events
                if event.type is BrowserEventType.DIALOG_OPENED and event.page_id == page_id
            ),
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
        return await self._observer.screenshot(
            session_id=self._runtime.session_id,
            handle=self._runtime.require_page(page_id),
            full_page=full_page,
            labels=labels,
        )

    async def read_console(self, page_id: str, *, clear: bool = True) -> tuple[ConsoleEntry, ...]:
        self._runtime.require_page(page_id)
        return self._runtime.read_console(page_id, clear=clear)

    async def read_network(self, page_id: str, *, clear: bool = True) -> tuple[NetworkEntry, ...]:
        self._runtime.require_page(page_id)
        return self._runtime.read_network(page_id, clear=clear)

    async def drain_events(self) -> tuple[BrowserEvent, ...]:
        events = self._runtime.drain_events()
        for event in events:
            if event.type is BrowserEventType.PAGE_CLOSED and event.page_id is not None:
                self._observer.clear_page(event.page_id)
        return events

    async def _wait_for_ref(self, page_id: str, request: WaitRequest) -> None:
        deadline = asyncio.get_running_loop().time() + request.timeout_ms / 1000
        expected_state = request.state or "attached"
        while True:
            snapshot = await self._observer.snapshot(
                session_id=self._runtime.session_id,
                handle=self._runtime.require_page(page_id),
                options=SnapshotOptions(scope=SnapshotScope.INTERACTIVE),
                update_baseline=False,
            )
            node = self._find_ref(snapshot, request.value or "")
            if self._ref_state_matches(node, expected_state):
                return
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"Timed out waiting for ref {request.value} to become {expected_state}")
            await asyncio.sleep(0.1)

    def _mark_disconnected(self) -> None:
        if self._state is not SessionState.CLOSED:
            self._state = SessionState.DISCONNECTED
            self._observer.clear()

    async def _close_after_context_idle(self) -> None:
        if self._state is SessionState.CONNECTED:
            await self.close()

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
        if expected_state == "enabled":
            return "disabled" not in node.states
        if expected_state == "disabled":
            return "disabled" in node.states
        raise ValueError(f"Unsupported ref wait state: {expected_state}")
