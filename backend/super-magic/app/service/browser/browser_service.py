"""Super Magic Browser 工具使用的统一宿主服务。"""

from __future__ import annotations

import asyncio
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar
from weakref import WeakValueDictionary

from agentlang.context.tool_context import ToolContext
from app.service.browser.browser_config_adapter import BrowserConfigAdapter
from app.service.browser.browser_file_adapter import BrowserFileAdapter
from app.service.browser.browser_interruption import await_browser_operation, require_agent_context
from app.service.browser.browser_runtime_registry import BrowserRuntimeEntry, BrowserRuntimeRegistry
from app.service.browser.chrome_extension_connection_registry import ChromeExtensionConnectionRegistry
from app.utils.async_file_utils import async_realpath, async_stat
from magic_use import BrowserClient, create_browser
from magic_use.backends.chrome_extension import ChromeExtensionBackend
from magic_use.errors import BrowserErrorCode, BrowserSDKError
from magic_use.extension import ChromeExtensionConfig, PairingDetails, TunnelProvider
from magic_use.models import (
    ActionRequest,
    ActionResult,
    ActionTarget,
    BrowserBackendKind,
    BrowserEvent,
    BrowserPage,
    BrowserSession,
    ConsoleEntry,
    DiagnosticBatch,
    NetworkEntry,
    PageSnapshot,
    ScreenshotResult,
    SnapshotOptions,
    WaitRequest,
)
from magic_use.models.common import JsonValue, SessionState


@dataclass(frozen=True, slots=True)
class ChromeBrowserSession:
    session: BrowserSession
    pairing: PairingDetails


class BrowserService:
    """隔离 AgentContext 生命周期与独立 Browser SDK。"""

    _creation_locks: ClassVar[WeakValueDictionary[str, asyncio.Lock]] = WeakValueDictionary()

    def __init__(self, tool_context: ToolContext) -> None:
        self._tool_context = tool_context
        self._agent_context = require_agent_context(tool_context)
        self._registry = BrowserRuntimeRegistry.get_instance()

    async def list_sessions(self) -> tuple[BrowserSession, ...]:
        entries = self._registry.list(self._agent_context.context_id)
        return tuple([await self._refresh(entry) for entry in entries])

    async def create_chrome_session(
        self,
        tunnel_provider: TunnelProvider,
        *,
        extension_config: ChromeExtensionConfig | None = None,
        make_default: bool = True,
    ) -> ChromeBrowserSession:
        """由受保护的产品配对流程创建用户 Chrome session，不经过 Agent 工具。"""
        runtime_config = await BrowserConfigAdapter.build(
            self._agent_context.get_workspace_dir(),
            backend_override=BrowserBackendKind.CHROME_EXTENSION,
        )
        resolved_extension_config = extension_config or ChromeExtensionConfig()
        sandbox_id = self._agent_context.get_sandbox_id() or self._agent_context.get_workspace_dir()
        connection = await ChromeExtensionConnectionRegistry.get_instance().get_or_create(
            sandbox_id,
            extension_config=resolved_extension_config,
            tunnel_provider=tunnel_provider,
        )
        backend = ChromeExtensionBackend(
            runtime_config,
            extension_config=resolved_extension_config,
            connection=connection,
            session_label=self._agent_context.get_agent_session_label(),
        )
        client = await await_browser_operation(
            self._tool_context,
            BrowserClient.create_with_backend(backend),
        )
        try:
            session = await await_browser_operation(self._tool_context, client.get_session())
            pairing = backend.pairing_details
            if pairing is None:
                raise BrowserSDKError(
                    BrowserErrorCode.CONNECTION_FAILED,
                    "Chrome extension pairing did not start.",
                )
        except BaseException:
            await client.close()
            raise
        entry = BrowserRuntimeEntry(client=client, session=session, is_default=make_default)
        context_id = self._agent_context.context_id
        self._registry.register(context_id, entry)
        return ChromeBrowserSession(session=session, pairing=pairing)

    async def list_pages(self, session_id: str | None = None) -> tuple[BrowserPage, ...]:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(self._tool_context, entry.client.list_pages())

    async def get_session(self, session_id: str | None = None) -> BrowserSession:
        entry = await self._resolve_entry(session_id)
        return await self._refresh(entry)

    async def open_page(self, url: str, session_id: str | None = None) -> BrowserPage:
        entry = await self._resolve_entry(session_id)
        page = await self._reuse_initial_playwright_page(entry, url)
        if page is None:
            page = await await_browser_operation(self._tool_context, entry.client.open_page(url))
        return page

    async def close_page(self, page_id: str, session_id: str | None = None) -> None:
        entry = await self._resolve_entry(session_id)
        await await_browser_operation(self._tool_context, entry.client.close_page(page_id))
        await self._refresh(entry)

    async def activate_page(self, page_id: str, session_id: str | None = None) -> BrowserPage:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(self._tool_context, entry.client.activate_page(page_id))

    async def keep_page_alive(
        self,
        page_id: str,
        extension_seconds: float,
        session_id: str | None = None,
    ) -> BrowserPage:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.keep_page_alive(page_id, extension_seconds),
        )

    async def navigate(
        self,
        page_id: str,
        url: str,
        wait_until: str,
        session_id: str | None = None,
    ) -> BrowserPage:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.navigate(page_id, url, wait_until),
        )

    async def wait(
        self,
        page_id: str,
        request: WaitRequest,
        session_id: str | None = None,
    ) -> BrowserPage:
        entry = await self._resolve_entry(session_id)
        keep_alive = request.timeout_ms > 60_000 or (request.duration_ms or 0) > 60_000
        try:
            await await_browser_operation(
                self._tool_context,
                entry.client.wait(page_id, request),
                keep_alive=keep_alive,
            )
        except asyncio.CancelledError:
            raise
        except BrowserSDKError as error:
            if error.code in {
                BrowserErrorCode.SESSION_CLOSED,
                BrowserErrorCode.PAGE_NOT_FOUND,
                BrowserErrorCode.PAGE_CLOSED,
                BrowserErrorCode.PAGE_EXPIRED,
            }:
                raise
            raise await self._build_wait_error(entry, page_id, request, error) from error
        except Exception as error:
            raise await self._build_wait_error(entry, page_id, request, error) from error
        return await self._find_page(entry, page_id)

    async def read_page(
        self,
        page_id: str,
        scope: str,
        session_id: str | None = None,
    ) -> tuple[BrowserPage, str]:
        entry = await self._resolve_entry(session_id)
        sdk_scope = "all" if scope == "full" else scope
        content = await await_browser_operation(
            self._tool_context,
            entry.client.read_page(page_id, sdk_scope),
        )
        return await self._find_page(entry, page_id), content

    async def snapshot(
        self,
        page_id: str,
        options: SnapshotOptions,
        session_id: str | None = None,
    ) -> PageSnapshot:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.snapshot(page_id, options),
        )

    async def describe_ref(
        self,
        page_id: str,
        ref: str,
        session_id: str | None = None,
    ) -> ActionTarget:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.describe_ref(page_id, ref),
        )

    async def dispatch_action(
        self,
        page_id: str,
        request: ActionRequest,
        session_id: str | None = None,
    ) -> ActionResult:
        entry = await self._resolve_entry(session_id)
        result = await await_browser_operation(
            self._tool_context,
            entry.client.dispatch_action(page_id, request),
        )
        await self._refresh(entry)
        return result

    async def screenshot(
        self,
        page_id: str,
        *,
        full_page: bool,
        labels: bool,
        session_id: str | None = None,
    ) -> tuple[BrowserPage, ScreenshotResult]:
        entry = await self._resolve_entry(session_id)
        result = await await_browser_operation(
            self._tool_context,
            entry.client.screenshot(page_id, full_page=full_page, labels=labels),
        )
        return await self._find_page(entry, page_id), result

    async def visual_query(
        self,
        page_id: str,
        query: str,
        *,
        labels: bool,
        full_page: bool,
        session_id: str | None = None,
    ) -> tuple[BrowserPage, ScreenshotResult, str]:
        page, screenshot = await self.screenshot(
            page_id,
            full_page=full_page,
            labels=labels,
            session_id=session_id,
        )
        analysis = await self.analyze_screenshot(screenshot.image, query)
        return page, screenshot, analysis

    async def analyze_screenshot(self, image: bytes, query: str) -> str:
        from app.tools.visual_understanding import VisualUnderstanding, VisualUnderstandingParams

        async with BrowserFileAdapter.temporary_png(image) as file_path:
            analysis_result = await await_browser_operation(
                self._tool_context,
                VisualUnderstanding().execute_purely(
                    VisualUnderstandingParams(images=[file_path], query=query),
                    include_download_info_in_content=False,
                    include_dimensions_info_in_content=False,
                    skip_format_validation=True,
                ),
                keep_alive=True,
            )
        if not analysis_result.ok:
            raise BrowserSDKError(
                BrowserErrorCode.ACTION_FAILED,
                f"Visual analysis is unavailable: {analysis_result.content}",
            )
        return analysis_result.content

    async def evaluate(
        self,
        page_id: str,
        expression: str,
        argument: JsonValue = None,
        session_id: str | None = None,
    ) -> JsonValue:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.evaluate(page_id, expression, argument),
        )

    async def read_console(
        self,
        page_id: str,
        *,
        clear: bool,
        limit: int,
        session_id: str | None = None,
    ) -> DiagnosticBatch[ConsoleEntry]:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.read_console(page_id, clear=clear, limit=limit),
        )

    async def read_network(
        self,
        page_id: str,
        *,
        clear: bool,
        limit: int,
        session_id: str | None = None,
    ) -> DiagnosticBatch[NetworkEntry]:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(
            self._tool_context,
            entry.client.read_network(page_id, clear=clear, limit=limit),
        )

    async def drain_events(self, session_id: str | None = None) -> tuple[BrowserEvent, ...]:
        entry = await self._resolve_entry(session_id)
        return await await_browser_operation(self._tool_context, entry.client.drain_events())

    async def resolve_upload_paths(self, file_paths: tuple[str, ...]) -> tuple[str, ...]:
        workspace = await async_realpath(self._agent_context.get_workspace_dir(), strict=True)
        resolved: list[str] = []
        for file_path in file_paths:
            candidate = Path(file_path)
            if not candidate.is_absolute():
                candidate = workspace / candidate
            try:
                candidate = await async_realpath(candidate, strict=True)
            except FileNotFoundError as error:
                raise ValueError(
                    f"Upload file does not exist in the workspace shared with the browser: {file_path}"
                ) from error
            if os.path.commonpath((workspace, candidate)) != str(workspace):
                raise ValueError(
                    "Upload files must be inside the current workspace. "
                    f"Use a workspace-relative path or an absolute path within the workspace: {file_path}"
                )
            try:
                file_stat = await async_stat(candidate)
            except FileNotFoundError as error:
                raise ValueError(
                    f"Upload file does not exist in the workspace shared with the browser: {file_path}"
                ) from error
            if not stat.S_ISREG(file_stat.st_mode):
                raise ValueError(f"Upload path must identify a regular workspace file: {file_path}")
            resolved.append(str(candidate))
        return tuple(resolved)

    async def _resolve_entry(self, session_id: str | None) -> BrowserRuntimeEntry:
        if session_id is None:
            return await self._get_or_create_default()
        entry = self._registry.get(self._agent_context.context_id, session_id)
        if entry is None:
            raise BrowserSDKError(
                BrowserErrorCode.SESSION_CLOSED,
                f"Browser session is not available in the current Agent context: {session_id}",
            )
        session = await self._refresh(entry)
        if session.state is not SessionState.CONNECTED:
            self._registry.remove(self._agent_context.context_id, session.id)
            await entry.client.close()
            raise BrowserSDKError(
                BrowserErrorCode.SESSION_CLOSED,
                f"Browser session is no longer active: {session_id}",
            )
        return entry

    async def _get_or_create_default(self) -> BrowserRuntimeEntry:
        context_id = self._agent_context.context_id
        current = self._registry.get_default(context_id)
        if current is not None:
            session = await self._refresh(current)
            if session.state is SessionState.CONNECTED:
                return current
            self._registry.remove(context_id, session.id)
            await current.client.close()

        lock = self._creation_locks.setdefault(context_id, asyncio.Lock())
        async with lock:
            current = self._registry.get_default(context_id)
            if current is not None:
                session = await self._refresh(current)
                if session.state is SessionState.CONNECTED:
                    return current
                self._registry.remove(context_id, session.id)
                await current.client.close()

            runtime_config = await BrowserConfigAdapter.build(self._agent_context.get_workspace_dir())
            if runtime_config.backend is BrowserBackendKind.CHROME_EXTENSION:
                raise BrowserSDKError(
                    BrowserErrorCode.INVALID_CONFIG,
                    "The default Chrome extension session must be created by the protected product pairing flow.",
                )
            client = await await_browser_operation(
                self._tool_context,
                create_browser(runtime_config),
                keep_alive=runtime_config.backend is BrowserBackendKind.REMOTE_PLAYWRIGHT,
            )
            try:
                session = await await_browser_operation(self._tool_context, client.get_session())
            except BaseException:
                await client.close()
                raise
            entry = BrowserRuntimeEntry(client=client, session=session, is_default=True)
            self._registry.register(context_id, entry)
            return entry

    async def _refresh(self, entry: BrowserRuntimeEntry) -> BrowserSession:
        entry.session = await await_browser_operation(self._tool_context, entry.client.get_session())
        return entry.session

    async def _find_page(self, entry: BrowserRuntimeEntry, page_id: str) -> BrowserPage:
        pages = await await_browser_operation(self._tool_context, entry.client.list_pages())
        for page in pages:
            if page.id == page_id:
                return page
        raise BrowserSDKError(BrowserErrorCode.PAGE_NOT_FOUND, f"Browser page is not available: {page_id}")

    async def _reuse_initial_playwright_page(
        self,
        entry: BrowserRuntimeEntry,
        url: str,
    ) -> BrowserPage | None:
        if entry.session.backend is BrowserBackendKind.CHROME_EXTENSION:
            return None
        pages = await await_browser_operation(self._tool_context, entry.client.list_pages())
        if len(pages) != 1 or pages[0].url != "about:blank":
            return None
        if url == "about:blank":
            return pages[0]
        return await await_browser_operation(
            self._tool_context,
            entry.client.navigate(pages[0].id, url),
        )

    async def _build_wait_error(
        self,
        entry: BrowserRuntimeEntry,
        page_id: str,
        request: WaitRequest,
        error: Exception,
    ) -> BrowserSDKError:
        expected = request.value or request.state or request.duration_ms
        condition = request.condition.value
        try:
            page = await self._find_page(entry, page_id)
            current_page = f"Current page title: {page.title!r}. Current URL: {page.url}."
        except asyncio.CancelledError:
            raise
        except Exception:
            current_page = "The current page state could not be read."
        return BrowserSDKError(
            BrowserErrorCode.ACTION_FAILED,
            f"Wait condition was not satisfied: {condition}={expected!r}. {current_page} "
            "Read the current page before retrying; navigation may have stopped on an intermediate "
            f"page such as human verification. Original wait error: {error}",
        )
