from __future__ import annotations

import asyncio
from collections.abc import Mapping

from magic_use.config import BrowserRuntimeConfig
from magic_use.playwright.context_lease import PlaywrightContextLease
from magic_use.playwright.host import PlaywrightHost, PlaywrightHostKey


class PlaywrightHostPool:
    """进程内共享 Browser Host；Super Magic 的一个沙盒进程只创建一份实例。"""

    _instance: "PlaywrightHostPool | None" = None

    def __init__(self) -> None:
        self._hosts: dict[PlaywrightHostKey, PlaywrightHost] = {}
        self._idle_tasks: dict[PlaywrightHostKey, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "PlaywrightHostPool":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def acquire(
        self,
        config: BrowserRuntimeConfig,
        context_options: Mapping[str, object] | None = None,
    ) -> PlaywrightContextLease:
        key = PlaywrightHostKey.from_config(config)
        async with self._lock:
            idle_task = self._idle_tasks.pop(key, None)
            if idle_task is not None:
                idle_task.cancel()
            host = self._hosts.get(key)
            if host is None:
                host = PlaywrightHost(key, config, lambda idle_host: self.schedule_idle_close(config, idle_host))
                self._hosts[key] = host
        try:
            return await host.acquire_context(config, context_options)
        except BaseException:
            async with self._lock:
                if host.lease_count == 0 and self._hosts.get(key) is host:
                    self._hosts.pop(key, None)
            if host.lease_count == 0:
                await host.close()
            raise

    def schedule_idle_close(self, config: BrowserRuntimeConfig, host: PlaywrightHost) -> None:
        if host.lease_count != 0:
            return
        key = host.key
        current = self._idle_tasks.get(key)
        if current is not None:
            current.cancel()
        task = asyncio.create_task(self._close_after_idle(key, host, config.lifecycle.host_idle_seconds))
        self._idle_tasks[key] = task
        task.add_done_callback(lambda completed: self._idle_tasks.pop(key, None) if self._idle_tasks.get(key) is completed else None)

    async def _close_after_idle(self, key: PlaywrightHostKey, host: PlaywrightHost, seconds: float) -> None:
        try:
            await asyncio.sleep(seconds)
            async with self._lock:
                if host.lease_count != 0 or self._hosts.get(key) is not host:
                    return
                self._hosts.pop(key, None)
            await host.close()
        except asyncio.CancelledError:
            return
