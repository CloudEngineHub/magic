from __future__ import annotations

from typing import Protocol

from magic_use.models import (
    ActionRequest,
    ActionResult,
    ActionTarget,
    BrowserCapabilities,
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
from magic_use.models.common import JsonValue


class BrowserBackend(Protocol):
    async def start(self) -> BrowserSession: ...

    async def close(self) -> None: ...

    async def get_session(self) -> BrowserSession: ...

    async def get_capabilities(self) -> BrowserCapabilities: ...

    async def list_pages(self) -> tuple[BrowserPage, ...]: ...

    async def open_page(self, url: str = "about:blank") -> BrowserPage: ...

    async def close_page(self, page_id: str) -> None: ...

    async def activate_page(self, page_id: str) -> BrowserPage: ...

    async def keep_page_alive(self, page_id: str, extension_seconds: float) -> BrowserPage: ...

    async def navigate(
        self,
        page_id: str,
        url: str,
        wait_until: str = "domcontentloaded",
        *,
        referer: str | None = None,
    ) -> BrowserPage: ...

    async def wait(self, page_id: str, request: WaitRequest) -> None: ...

    async def evaluate(self, page_id: str, expression: str, argument: JsonValue = None) -> JsonValue: ...

    async def read_page(self, page_id: str, scope: str = "viewport") -> str: ...

    async def snapshot(self, page_id: str, options: SnapshotOptions | None = None) -> PageSnapshot: ...

    async def describe_ref(self, page_id: str, ref: str) -> ActionTarget: ...

    async def dispatch_action(self, page_id: str, request: ActionRequest) -> ActionResult: ...

    async def screenshot(
        self,
        page_id: str,
        *,
        full_page: bool = False,
        labels: bool = False,
    ) -> ScreenshotResult: ...

    async def read_console(
        self,
        page_id: str,
        *,
        clear: bool = True,
        limit: int = 100,
    ) -> DiagnosticBatch[ConsoleEntry]: ...

    async def read_network(
        self,
        page_id: str,
        *,
        clear: bool = True,
        limit: int = 100,
    ) -> DiagnosticBatch[NetworkEntry]: ...

    async def drain_events(self) -> tuple[BrowserEvent, ...]: ...
