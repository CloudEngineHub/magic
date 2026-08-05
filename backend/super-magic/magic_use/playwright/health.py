from __future__ import annotations

import asyncio

import aiohttp

from magic_use.config import RemotePlaywrightConfig
from magic_use.errors import BrowserConnectionError


class RemotePlaywrightHealthChecker:
    def __init__(self, config: RemotePlaywrightConfig) -> None:
        self._config = config

    async def wait_until_ready(self) -> None:
        if not self._config.health_check_enabled:
            return
        url = self._config.health_check_url or self._derive_health_url(self._config.endpoint)
        deadline = asyncio.get_running_loop().time() + self._config.health_check_timeout_seconds
        last_error = "no response"
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    async with session.get(
                        url,
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as response:
                        if response.status == 200:
                            return
                        last_error = f"HTTP {response.status}"
                except asyncio.CancelledError:
                    raise
                except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                    last_error = str(error)

                if asyncio.get_running_loop().time() >= deadline:
                    raise BrowserConnectionError(
                        f"Remote Playwright health check timed out: {last_error}"
                    )
                await asyncio.sleep(self._config.health_check_interval_seconds)

    @staticmethod
    def _derive_health_url(endpoint: str) -> str:
        if endpoint.startswith("wss://"):
            return f"https://{endpoint.removeprefix('wss://')}"
        return f"http://{endpoint.removeprefix('ws://')}"
