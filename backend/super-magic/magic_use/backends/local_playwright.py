from __future__ import annotations

from magic_use.backends.playwright_base import PlaywrightBackend
from magic_use.config import BrowserRuntimeConfig
from magic_use.models.common import BrowserBackendKind


class LocalPlaywrightBackend(PlaywrightBackend):
    def __init__(self, config: BrowserRuntimeConfig) -> None:
        super().__init__(config)

    @property
    def backend_kind(self) -> BrowserBackendKind:
        return BrowserBackendKind.LOCAL_PLAYWRIGHT

    async def _start_runtime(self) -> None:
        await self._runtime.start_local()
