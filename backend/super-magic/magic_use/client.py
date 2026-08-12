from __future__ import annotations

from magic_use.backends.base import BrowserBackend
from magic_use.config import BrowserRuntimeConfig
from magic_use.errors import BrowserErrorCode, BrowserSDKError
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
    PageElements,
    FindQuery,
    FindResult,
    ScreenshotResult,
    ElementQuery,
    WaitRequest,
)
from magic_use.models.common import BrowserBackendKind, JsonValue


class BrowserClient:
    """独立 Browser SDK 的公共入口，向调用方隐藏具体 backend 对象。"""

    def __init__(self, backend: BrowserBackend) -> None:
        self._backend = backend

    @classmethod
    async def create(cls, config: BrowserRuntimeConfig | None = None) -> "BrowserClient":
        runtime_config = config or BrowserRuntimeConfig()
        backend = _create_backend(runtime_config)
        return await cls.create_with_backend(backend)

    @classmethod
    async def create_with_backend(cls, backend: BrowserBackend) -> "BrowserClient":
        """使用宿主已构造的 backend 创建客户端，供需要外部依赖注入的后端使用。"""
        client = cls(backend)
        await client.start()
        return client

    async def start(self) -> BrowserSession:
        return await self._backend.start()

    async def close(self) -> None:
        await self._backend.close()

    async def get_session(self) -> BrowserSession:
        return await self._backend.get_session()

    async def get_capabilities(self) -> BrowserCapabilities:
        return await self._backend.get_capabilities()

    async def list_pages(self) -> tuple[BrowserPage, ...]:
        return await self._backend.list_pages()

    async def open_page(self, url: str = "about:blank") -> BrowserPage:
        return await self._backend.open_page(url)

    async def close_page(self, page_id: str) -> None:
        await self._backend.close_page(page_id)

    async def activate_page(self, page_id: str) -> BrowserPage:
        return await self._backend.activate_page(page_id)

    async def keep_page_alive(self, page_id: str, extension_seconds: float) -> BrowserPage:
        return await self._backend.keep_page_alive(page_id, extension_seconds)

    async def navigate(
        self,
        page_id: str,
        url: str,
        wait_until: str = "domcontentloaded",
        *,
        referer: str | None = None,
    ) -> BrowserPage:
        return await self._backend.navigate(page_id, url, wait_until, referer=referer)

    async def wait(self, page_id: str, request: WaitRequest) -> None:
        await self._backend.wait(page_id, request)

    async def evaluate(self, page_id: str, expression: str, argument: JsonValue = None) -> JsonValue:
        return await self._backend.evaluate(page_id, expression, argument)

    async def read_page(self, page_id: str, scope: str = "viewport") -> str:
        return await self._backend.read_page(page_id, scope)

    async def read_html(
        self,
        page_id: str,
        *,
        ref: str | None = None,
        detail: str = "outline",
        max_chars: int = 20_000,
    ) -> tuple[str, bool]:
        return await self._backend.read_html(
            page_id,
            ref=ref,
            detail=detail,
            max_chars=max_chars,
        )

    async def add_init_script(self, page_id: str, source: str) -> None:
        await self._backend.add_init_script(page_id, source)

    async def snapshot(
        self,
        page_id: str,
        options: ElementQuery | None = None,
    ) -> PageElements:
        return await self._backend.snapshot(page_id, options)

    async def find(self, page_id: str, query: FindQuery) -> FindResult:
        return await self._backend.find(page_id, query)

    async def describe_ref(self, page_id: str, ref: str) -> ActionTarget:
        return await self._backend.describe_ref(page_id, ref)

    async def dispatch_action(self, page_id: str, request: ActionRequest) -> ActionResult:
        return await self._backend.dispatch_action(page_id, request)

    async def screenshot(
        self,
        page_id: str,
        *,
        full_page: bool = False,
        labels: bool = False,
    ) -> ScreenshotResult:
        return await self._backend.screenshot(page_id, full_page=full_page, labels=labels)

    async def read_console(
        self,
        page_id: str,
        *,
        clear: bool = True,
        limit: int = 100,
    ) -> DiagnosticBatch[ConsoleEntry]:
        _validate_diagnostic_limit(limit)
        return await self._backend.read_console(page_id, clear=clear, limit=limit)

    async def read_network(
        self,
        page_id: str,
        *,
        clear: bool = True,
        limit: int = 100,
    ) -> DiagnosticBatch[NetworkEntry]:
        _validate_diagnostic_limit(limit)
        return await self._backend.read_network(page_id, clear=clear, limit=limit)

    async def drain_events(self) -> tuple[BrowserEvent, ...]:
        return await self._backend.drain_events()

    async def __aenter__(self) -> "BrowserClient":
        return self

    async def __aexit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        await self.close()


async def create_browser(config: BrowserRuntimeConfig | None = None) -> BrowserClient:
    return await BrowserClient.create(config)


def _validate_diagnostic_limit(limit: int) -> None:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 500:
        raise ValueError("Diagnostic limit must be between 1 and 500")


def _create_backend(config: BrowserRuntimeConfig) -> BrowserBackend:
    if config.backend is BrowserBackendKind.LOCAL_PLAYWRIGHT:
        from magic_use.backends.local_playwright import LocalPlaywrightBackend

        return LocalPlaywrightBackend(config)
    if config.backend is BrowserBackendKind.REMOTE_PLAYWRIGHT:
        from magic_use.backends.remote_playwright import RemotePlaywrightBackend

        return RemotePlaywrightBackend(config)
    if config.backend is BrowserBackendKind.CHROME_EXTENSION:
        raise BrowserSDKError(
            BrowserErrorCode.INVALID_CONFIG,
            "Chrome Extension requires a host-provided TunnelProvider and BrowserClient.create_with_backend().",
        )
    raise BrowserSDKError(
        BrowserErrorCode.BACKEND_UNAVAILABLE,
        f"Unsupported browser backend: {config.backend.value}",
    )
