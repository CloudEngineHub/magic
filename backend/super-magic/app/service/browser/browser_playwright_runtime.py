"""内部渲染任务使用的 Playwright runtime。"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Mapping

from playwright.async_api import Browser, BrowserContext

from app.service.browser.browser_config_adapter import BrowserConfigAdapter
from magic_use.playwright.context_lease import PlaywrightContextLease
from magic_use.playwright.host_pool import PlaywrightHostPool


@dataclass(slots=True)
class SharedBrowserRuntime:
    """持有一个内部渲染 context，并记录浏览器进程所有权。"""

    browser: Browser
    context: BrowserContext
    lease: PlaywrightContextLease


async def create_shared_browser_runtime(
    workspace_dir: str,
    *,
    browser_args: tuple[str, ...] | list[str],
    viewport: Mapping[str, int],
    device_scale_factor: float = 1.0,
    user_agent: str | None = None,
    context_options: Mapping[str, object] | None = None,
) -> SharedBrowserRuntime:
    """创建仅供转换、截图和语法检查使用的独立 Chromium context。"""
    config = await BrowserConfigAdapter.build_playwright(workspace_dir)
    config = replace(
        config,
        local_playwright=replace(
            config.local_playwright,
            headless=True,
            browser_args=tuple(browser_args),
        ),
    )
    options: dict[str, object] = {
        "viewport": dict(viewport),
        "device_scale_factor": device_scale_factor,
    }
    if user_agent is not None:
        options["user_agent"] = user_agent
    if context_options is not None:
        options.update(context_options)
    lease = await PlaywrightHostPool.get_instance().acquire(config, options)
    return SharedBrowserRuntime(
        browser=lease.browser,
        context=lease.context,
        lease=lease,
    )


async def close_shared_browser_runtime(runtime: SharedBrowserRuntime | None) -> tuple[str, ...]:
    """按所有权关闭内部渲染 runtime，返回清理错误供调用方记录。"""
    if runtime is None:
        return ()
    errors: list[str] = []
    try:
        await runtime.lease.release()
    except Exception as error:
        errors.append(f"context lease: {error}")
    return tuple(errors)
