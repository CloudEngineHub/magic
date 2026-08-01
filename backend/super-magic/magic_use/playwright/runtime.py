from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Coroutine
from datetime import datetime, timedelta, timezone
from typing import TypeVar
from uuid import uuid4

from playwright.async_api import (
    Browser,
    BrowserContext,
    Download,
    Error as PlaywrightError,
    Frame,
    Page,
    Request,
)

from magic_use.config import BrowserRuntimeConfig
from magic_use.errors import BrowserConnectionError, BrowserPageError
from magic_use.models.common import BrowserEventType, BrowserName, JsonValue, PageReadiness, PageState
from magic_use.models.diagnostics import ConsoleEntry, DiagnosticBatch, NetworkEntry
from magic_use.models.events import BrowserEvent
from magic_use.models.page import BrowserPage
from magic_use.playwright.context_lease import PlaywrightContextLease
from magic_use.playwright.host_pool import PlaywrightHostPool
from magic_use.playwright.state import ClosedPageRecord, PlaywrightPageHandle

logger = logging.getLogger(__name__)
T = TypeVar("T")


class PlaywrightRuntime:
    def __init__(self, config: BrowserRuntimeConfig) -> None:
        self.config = config
        self.session_id = f"session_{uuid4().hex}"
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.context_lease: PlaywrightContextLease | None = None
        self.pages: dict[str, PlaywrightPageHandle] = {}
        self.closed_pages: dict[str, ClosedPageRecord] = {}
        self.active_page_id: str | None = None
        self.events: list[BrowserEvent] = []
        self.console_entries: list[ConsoleEntry] = []
        self.network_entries: list[NetworkEntry] = []
        self.active_requests: dict[str, set[Request]] = {}
        self.last_network_activity: dict[str, float] = {}
        self.background_tasks: set[asyncio.Task[object]] = set()
        self.page_registration_tasks: set[asyncio.Task[object]] = set()
        self._page_registration_lock = asyncio.Lock()
        self.document_ready_handler: Callable[[Page], Awaitable[None]] | None = None
        self.disconnect_handler: Callable[[], None] | None = None
        self.context_idle_handler: Callable[[], Awaitable[None]] | None = None
        self._empty_since: float | None = None
        self._lifecycle_task: asyncio.Task[None] | None = None

    async def start_local(self) -> None:
        await self._acquire_context()

    async def start_remote(self) -> None:
        await self._acquire_context()

    async def close(self) -> None:
        lifecycle_task = self._lifecycle_task
        self._lifecycle_task = None
        if lifecycle_task is not None and lifecycle_task is not asyncio.current_task():
            lifecycle_task.cancel()
            await asyncio.gather(lifecycle_task, return_exceptions=True)
        await self._cancel_background_tasks()
        context = self.context
        lease = self.context_lease
        self.context = None
        self.context_lease = None
        if context is not None:
            try:
                if self.config.context.storage_state_path is not None:
                    await context.storage_state(path=self.config.context.storage_state_path)
            except Exception:
                logger.exception("Failed to persist Playwright storage state")
        for page_id in tuple(self.pages):
            await self._unregister_page(page_id)
        if lease is not None:
            await lease.release()
        self.browser = None
        await self._cancel_background_tasks()
        self.pages.clear()
        self.active_page_id = None

    async def open_page(self, url: str = "about:blank") -> PlaywrightPageHandle:
        context = self._require_context()
        page = await context.new_page()
        handle = await self._register_page(page, opener_page_id=None)
        if url != "about:blank":
            await page.goto(url, wait_until="domcontentloaded", timeout=self.config.timeouts.navigation_ms)
        return handle

    async def close_page(self, page_id: str) -> None:
        handle = self.require_page(page_id)
        await handle.page.close()
        await self._unregister_page(page_id)

    async def activate_page(self, page_id: str) -> PlaywrightPageHandle:
        handle = self.require_page(page_id)
        await handle.page.bring_to_front()
        self.active_page_id = page_id
        self._emit(BrowserEventType.PAGE_ACTIVATED, page_id)
        return handle

    def require_page(self, page_id: str) -> PlaywrightPageHandle:
        handle = self.pages.get(page_id)
        if handle is None:
            closed = self.closed_pages.get(page_id)
            if closed is not None and closed.reason == "idle_timeout":
                raise BrowserPageError(
                    f"Browser page expired after being idle: {page_id}",
                    expired=True,
                )
            raise BrowserPageError(f"Browser page does not exist: {page_id}")
        if handle.page.is_closed():
            raise BrowserPageError(f"Browser page is closed: {page_id}", closed=True)
        self.touch_page(page_id)
        return handle

    def touch_page(self, page_id: str, extension_seconds: float | None = None) -> PlaywrightPageHandle:
        handle = self.pages.get(page_id)
        if handle is None:
            return self.require_page(page_id)
        seconds = self.config.lifecycle.page_idle_seconds
        if extension_seconds is not None:
            seconds = min(extension_seconds, self.config.lifecycle.page_keep_alive_max_seconds)
        handle.expires_at = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        self._empty_since = None
        return handle

    async def keep_page_alive(self, page_id: str, extension_seconds: float) -> BrowserPage:
        if extension_seconds > self.config.lifecycle.page_keep_alive_max_seconds:
            raise ValueError(
                f"Browser page keep-alive cannot exceed {self.config.lifecycle.page_keep_alive_max_seconds:g} seconds"
            )
        handle = self.require_page(page_id)
        self.touch_page(page_id, extension_seconds)
        return await self.describe_page(handle)

    async def describe_page(self, handle: PlaywrightPageHandle) -> BrowserPage:
        page_closed = handle.page.is_closed()
        return BrowserPage(
            id=handle.page_id,
            session_id=self.session_id,
            target_id=f"playwright:{handle.page_id}",
            url=handle.page.url,
            title="" if page_closed else await self._read_page_title(handle),
            state=PageState.CLOSED if page_closed else PageState.OPEN,
            active=handle.page_id == self.active_page_id,
            opener_page_id=handle.opener_page_id,
            document_generation=handle.document_generation,
            expires_at=handle.expires_at,
            resource_warning=handle.resource_warning or (self.context_lease.resource_warning if self.context_lease else None),
            readiness=handle.readiness,
        )

    async def _read_page_title(self, handle: PlaywrightPageHandle) -> str:
        try:
            return await handle.page.title()
        except PlaywrightError as error:
            if handle.page.is_closed():
                raise BrowserPageError(f"Browser page is closed: {handle.page_id}", closed=True) from error
            if _is_navigation_context_error(error):
                return ""
            raise

    async def list_pages(self) -> tuple[BrowserPage, ...]:
        result = []
        for handle in tuple(self.pages.values()):
            if not handle.page.is_closed():
                result.append(await self.describe_page(handle))
        return tuple(result)

    def drain_events(self) -> tuple[BrowserEvent, ...]:
        events = tuple(self.events)
        self.events.clear()
        return events

    def read_console(self, page_id: str, *, clear: bool, limit: int) -> DiagnosticBatch[ConsoleEntry]:
        page_entries = tuple(entry for entry in self.console_entries if entry.page_id == page_id)
        result = page_entries[-limit:]
        if clear:
            self.console_entries = [entry for entry in self.console_entries if entry.page_id != page_id]
        return DiagnosticBatch(entries=result, total_count=len(page_entries))

    def read_network(self, page_id: str, *, clear: bool, limit: int) -> DiagnosticBatch[NetworkEntry]:
        page_entries = tuple(entry for entry in self.network_entries if entry.page_id == page_id)
        result = page_entries[-limit:]
        if clear:
            self.network_entries = [entry for entry in self.network_entries if entry.page_id != page_id]
        return DiagnosticBatch(
            entries=result,
            total_count=len(page_entries),
            pending_count=len(self.active_requests.get(page_id, ())),
        )

    def set_document_ready_handler(self, handler: Callable[[Page], Awaitable[None]]) -> None:
        self.document_ready_handler = handler

    def set_disconnect_handler(self, handler: Callable[[], None]) -> None:
        self.disconnect_handler = handler
        if self.context_lease is not None:
            self.context_lease.set_disconnect_handler(handler)

    def set_context_idle_handler(self, handler: Callable[[], Awaitable[None]]) -> None:
        self.context_idle_handler = handler

    def emit(
        self,
        event_type: BrowserEventType,
        page_id: str | None,
        data: dict[str, JsonValue] | None = None,
    ) -> None:
        self._emit(event_type, page_id, data)

    async def _acquire_context(self) -> None:
        lease = await PlaywrightHostPool.get_instance().acquire(self.config)
        self.context_lease = lease
        self.context = lease.context
        self.browser = lease.browser
        if self.disconnect_handler is not None:
            lease.set_disconnect_handler(self.disconnect_handler)
        self.context.on("page", self._on_context_page)
        self._lifecycle_task = asyncio.create_task(self._run_lifecycle())

    async def _register_page(self, page: Page, opener_page_id: str | None) -> PlaywrightPageHandle:
        async with self._page_registration_lock:
            existing = next((item for item in self.pages.values() if item.page == page), None)
            if existing is not None:
                return existing
            page_id = f"page_{uuid4().hex}"
            resource_warning = self._require_lease().reserve_page()
            cdp = None
            try:
                if self.config.browser_name is BrowserName.CHROMIUM:
                    cdp = await self._require_context().new_cdp_session(page)
                handle = PlaywrightPageHandle(
                    page_id=page_id,
                    page=page,
                    cdp=cdp,
                    document_generation=0,
                    opener_page_id=opener_page_id,
                    expires_at=datetime.now(timezone.utc)
                    + timedelta(seconds=self.config.lifecycle.page_idle_seconds),
                    resource_warning=resource_warning,
                    readiness=PageReadiness.STABLE if page.url == "about:blank" else PageReadiness.LOADING,
                )
            except BaseException:
                self._require_lease().release_page()
                raise
            self.pages[page_id] = handle
            self.active_requests[page_id] = set()
            self.last_network_activity[page_id] = asyncio.get_running_loop().time()
            self._empty_since = None
            self.active_page_id = page_id
            page.on("close", lambda: self._schedule(self._unregister_page(page_id)))
            page.on("frameattached", lambda frame: self._on_frame_attached(handle, frame))
            page.on("framedetached", lambda frame: self._on_frame_detached(handle, frame))
            page.on("framenavigated", lambda frame: self._on_frame_navigated(handle, frame))
            page.on("load", lambda: self._on_document_ready(handle))
            page.on("console", lambda message: self._on_console(page_id, message.type, message.text))
            page.on("request", lambda request: self._on_request(handle, request))
            page.on("response", lambda response: self._on_response(page_id, response.request.method, response.url, response.status))
            page.on("requestfinished", lambda request: self._on_request_finished(page_id, request))
            page.on("requestfailed", lambda request: self._on_request_failed(page_id, request))
            page.on(
                "dialog",
                lambda dialog: self._emit(
                    BrowserEventType.DIALOG_OPENED,
                    page_id,
                    {"type": dialog.type, "message": dialog.message},
                ),
            )
            page.on("download", lambda download: self._schedule(self._track_download(page_id, download)))
            self._emit(BrowserEventType.PAGE_OPENED, page_id, {"url": page.url})
            if self.document_ready_handler is not None:
                await self.document_ready_handler(page)
            return handle

    async def _unregister_page(self, page_id: str, *, reason: str = "closed") -> None:
        handle = self.pages.pop(page_id, None)
        if handle is None:
            return
        try:
            title = await handle.page.title() if not handle.page.is_closed() else ""
        except Exception:
            title = ""
        self.closed_pages[page_id] = ClosedPageRecord(
            page_id=page_id,
            url=handle.page.url,
            title=title,
            closed_at=datetime.now(timezone.utc),
            reason=reason,
        )
        if len(self.closed_pages) > 100:
            self.closed_pages.pop(next(iter(self.closed_pages)))
        if handle.cdp is not None:
            try:
                await handle.cdp.detach()
            except Exception:
                pass
        self.active_requests.pop(page_id, None)
        self.last_network_activity.pop(page_id, None)
        if self.active_page_id == page_id:
            self.active_page_id = next(iter(self.pages), None)
        if self.context_lease is not None:
            self.context_lease.release_page()
        self._emit(
            BrowserEventType.PAGE_EXPIRED if reason == "idle_timeout" else BrowserEventType.PAGE_CLOSED,
            page_id,
            {"reason": reason},
        )
        if not self.pages:
            self._empty_since = asyncio.get_running_loop().time()

    def _on_context_page(self, page: Page) -> None:
        task = self._schedule(self._register_context_page(page))
        self.page_registration_tasks.add(task)
        task.add_done_callback(self.page_registration_tasks.discard)

    async def _register_context_page(self, page: Page) -> PlaywrightPageHandle:
        opener = await page.opener()
        opener_page_id = next(
            (handle.page_id for handle in self.pages.values() if handle.page == opener),
            None,
        )
        return await self._register_page(page, opener_page_id=opener_page_id)

    def _on_frame_navigated(self, handle: PlaywrightPageHandle, frame: Frame) -> None:
        main_frame = frame == handle.page.main_frame
        self._emit(
            BrowserEventType.FRAME_NAVIGATED,
            handle.page_id,
            {"url": frame.url, "name": frame.name, "main_frame": main_frame},
        )
        if main_frame:
            handle.document_generation += 1
            handle.readiness = PageReadiness.LOADING
            self._emit(
                BrowserEventType.NAVIGATION_COMMITTED,
                handle.page_id,
                {"url": frame.url},
            )

    def _on_frame_attached(self, handle: PlaywrightPageHandle, frame: Frame) -> None:
        self._emit(
            BrowserEventType.FRAME_ATTACHED,
            handle.page_id,
            {"url": frame.url, "name": frame.name},
        )

    def _on_frame_detached(self, handle: PlaywrightPageHandle, frame: Frame) -> None:
        self._emit(
            BrowserEventType.FRAME_DETACHED,
            handle.page_id,
            {"url": frame.url, "name": frame.name},
        )

    def _schedule(self, coroutine: Coroutine[object, object, object]) -> asyncio.Task[object]:
        task = asyncio.create_task(coroutine)
        self.background_tasks.add(task)
        task.add_done_callback(self._finish_background_task)
        return task

    async def wait_for_pending_pages(self) -> None:
        tasks = tuple(self.page_registration_tasks)
        if tasks:
            await asyncio.gather(*tasks)

    async def prepare_stability(self, page_id: str) -> None:
        handle = self.require_page(page_id)
        await handle.page.evaluate(
            """
            () => {
              if (globalThis.__magicUseStabilityObserver) return;
              globalThis.__magicUseLastMutationAt = performance.now();
              globalThis.__magicUseStabilityObserver = new MutationObserver(() => {
                globalThis.__magicUseLastMutationAt = performance.now();
              });
              globalThis.__magicUseStabilityObserver.observe(document, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true,
              });
            }
            """
        )

    async def wait_for_stable(self, page_id: str, *, minimum_wait_ms: float = 0) -> bool:
        handle = self.require_page(page_id)
        timeout = self.config.timeouts
        loop = asyncio.get_running_loop()
        started = loop.time()
        deadline = started + timeout.stability_timeout_ms / 1000
        while not handle.page.is_closed():
            now = loop.time()
            if now >= deadline:
                handle.readiness = PageReadiness.LOADING
                return False
            try:
                mutation_quiet_ms = await handle.page.evaluate(
                    """
                    () => {
                      if (!globalThis.__magicUseStabilityObserver) {
                        globalThis.__magicUseLastMutationAt = performance.now();
                        globalThis.__magicUseStabilityObserver = new MutationObserver(() => {
                          globalThis.__magicUseLastMutationAt = performance.now();
                        });
                        globalThis.__magicUseStabilityObserver.observe(document, {
                          subtree: true,
                          childList: true,
                          attributes: true,
                          characterData: true,
                        });
                      }
                      return performance.now() - globalThis.__magicUseLastMutationAt;
                    }
                    """
                )
            except PlaywrightError as error:
                if handle.page.is_closed():
                    raise BrowserPageError(f"Browser page is closed: {page_id}", closed=True) from error
                if _is_navigation_context_error(error):
                    await asyncio.sleep(0.05)
                    continue
                raise
            network_quiet_ms = (now - self.last_network_activity.get(page_id, started)) * 1000
            active_requests = self.active_requests.get(page_id, set())
            elapsed_ms = (now - started) * 1000
            if (
                elapsed_ms >= minimum_wait_ms
                and not active_requests
                and network_quiet_ms >= timeout.network_quiet_ms
                and isinstance(mutation_quiet_ms, (int, float))
                and mutation_quiet_ms >= timeout.dom_quiet_ms
            ):
                handle.readiness = PageReadiness.STABLE
                return True
            await asyncio.sleep(0.05)
        raise BrowserPageError(f"Browser page is closed: {page_id}", closed=True)

    def _finish_background_task(self, task: asyncio.Task[object]) -> None:
        self.background_tasks.discard(task)
        try:
            task.result()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Playwright background task failed")

    async def _cancel_background_tasks(self) -> None:
        tasks = tuple(self.background_tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.background_tasks.difference_update(tasks)

    def _on_document_ready(self, handle: PlaywrightPageHandle) -> None:
        self._emit(
            BrowserEventType.NAVIGATION_COMPLETED,
            handle.page_id,
            {"url": handle.page.url},
        )
        if self.document_ready_handler is not None:
            self._schedule(self.document_ready_handler(handle.page))

    def _on_disconnected(self) -> None:
        self._emit(BrowserEventType.SESSION_DISCONNECTED, None)
        if self.disconnect_handler is not None:
            self.disconnect_handler()

    def _on_console(self, page_id: str, level: str, message: str) -> None:
        occurred_at = datetime.now(timezone.utc)
        self.console_entries.append(
            ConsoleEntry(page_id=page_id, level=level, text=message, occurred_at=occurred_at)
        )
        self._trim_buffer(self.console_entries, self.config.diagnostic_buffer_size)
        self._emit(BrowserEventType.CONSOLE, page_id, {"text": message, "level": level})

    def _on_request(self, handle: PlaywrightPageHandle, request: Request) -> None:
        page_id = handle.page_id
        method = request.method
        url = request.url
        self.active_requests.setdefault(page_id, set()).add(request)
        self.last_network_activity[page_id] = asyncio.get_running_loop().time()
        if request.is_navigation_request() and request.frame == handle.page.main_frame:
            self._emit(BrowserEventType.NAVIGATION_STARTED, page_id, {"url": url})
        self.network_entries.append(
            NetworkEntry(
                page_id=page_id,
                phase="request",
                method=method,
                url=url,
                status=None,
                error=None,
                occurred_at=datetime.now(timezone.utc),
            )
        )
        self._trim_buffer(self.network_entries, self.config.diagnostic_buffer_size)
        self._emit(BrowserEventType.NETWORK_REQUEST, page_id, {"url": url, "method": method})

    def _on_response(self, page_id: str, method: str, url: str, status: int) -> None:
        self.last_network_activity[page_id] = asyncio.get_running_loop().time()
        self.network_entries.append(
            NetworkEntry(
                page_id=page_id,
                phase="response",
                method=method,
                url=url,
                status=status,
                error=None,
                occurred_at=datetime.now(timezone.utc),
            )
        )
        self._trim_buffer(self.network_entries, self.config.diagnostic_buffer_size)
        self._emit(BrowserEventType.NETWORK_RESPONSE, page_id, {"url": url, "status": status})

    def _on_request_failed(self, page_id: str, request: Request) -> None:
        method = request.method
        url = request.url
        error = request.failure
        self.active_requests.get(page_id, set()).discard(request)
        self.last_network_activity[page_id] = asyncio.get_running_loop().time()
        self.network_entries.append(
            NetworkEntry(
                page_id=page_id,
                phase="failed",
                method=method,
                url=url,
                status=None,
                error=error,
                occurred_at=datetime.now(timezone.utc),
            )
        )
        self._trim_buffer(self.network_entries, self.config.diagnostic_buffer_size)
        self._emit(BrowserEventType.NETWORK_FAILED, page_id, {"url": url, "error": error})

    def _on_request_finished(self, page_id: str, request: Request) -> None:
        self.active_requests.get(page_id, set()).discard(request)
        self.last_network_activity[page_id] = asyncio.get_running_loop().time()

    async def _track_download(self, page_id: str, download: Download) -> None:
        data = {"url": download.url, "filename": download.suggested_filename}
        self._emit(BrowserEventType.DOWNLOAD_STARTED, page_id, data)
        failure = await download.failure()
        if failure is None:
            self._emit(BrowserEventType.DOWNLOAD_COMPLETED, page_id, data)
        else:
            self._emit(BrowserEventType.DOWNLOAD_FAILED, page_id, {**data, "error": failure})

    async def _run_lifecycle(self) -> None:
        try:
            while self.context is not None:
                await asyncio.sleep(self.config.lifecycle.sweep_interval_seconds)
                now = datetime.now(timezone.utc)
                expired = tuple(
                    handle
                    for handle in self.pages.values()
                    if not handle.page.is_closed() and handle.expires_at <= now
                )
                for handle in expired:
                    await self._unregister_page(handle.page_id, reason="idle_timeout")
                    try:
                        await handle.page.close()
                    except Exception:
                        logger.exception("Failed to close expired Browser page %s", handle.page_id)
                if self.pages:
                    self._empty_since = None
                    continue
                if self._empty_since is None:
                    self._empty_since = asyncio.get_running_loop().time()
                    continue
                if (
                    asyncio.get_running_loop().time() - self._empty_since
                    >= self.config.lifecycle.context_idle_seconds
                ):
                    if self.context_idle_handler is not None:
                        await self.context_idle_handler()
                    return
        except asyncio.CancelledError:
            return

    def _emit(
        self,
        event_type: BrowserEventType,
        page_id: str | None,
        data: dict[str, JsonValue] | None = None,
    ) -> None:
        self.events.append(
            BrowserEvent(
                type=event_type,
                session_id=self.session_id,
                page_id=page_id,
                occurred_at=datetime.now(timezone.utc),
                data=data or {},
            )
        )
        self._trim_buffer(self.events, self.config.event_buffer_size)

    @staticmethod
    def _trim_buffer(items: list[T], limit: int) -> None:
        overflow = len(items) - limit
        if overflow > 0:
            del items[:overflow]

    def _require_context(self) -> BrowserContext:
        if self.context is None:
            raise BrowserConnectionError("Playwright context is not available")
        return self.context

    def _require_lease(self) -> PlaywrightContextLease:
        if self.context_lease is None:
            raise BrowserConnectionError("Playwright context lease is not available")
        return self.context_lease


def _is_navigation_context_error(error: PlaywrightError) -> bool:
    message = str(error).lower()
    return "execution context was destroyed" in message and "navigation" in message
