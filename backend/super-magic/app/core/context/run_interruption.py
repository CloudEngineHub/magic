"""
单次 agent run 的取消状态、cleanup 注册表、worker cancel 句柄。

只服务于"当前 agent 单轮运行"的中断与清理。
AgentContext 在每次新 run 开始前（reset_run_state）重置它们。
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import suppress
from dataclasses import dataclass
from typing import Optional, TypeVar

from agentlang.logger import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


async def await_with_interruption(
    awaitable: Awaitable[T],
    interruption_event: asyncio.Event | None,
) -> T:
    """等待异步工作；收到当前 run 的中断信号时取消工作。"""

    work_task = asyncio.ensure_future(awaitable)
    if interruption_event is None:
        return await work_task

    if interruption_event.is_set():
        work_task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await work_task
        raise asyncio.CancelledError("Run interrupted")

    interrupt_task = asyncio.create_task(interruption_event.wait())
    try:
        done, _ = await asyncio.wait(
            {work_task, interrupt_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if interrupt_task in done and interruption_event.is_set():
            work_task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await work_task
            raise asyncio.CancelledError("Run interrupted")
        return await work_task
    except BaseException:
        if not work_task.done():
            work_task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await work_task
        raise
    finally:
        interrupt_task.cancel()
        with suppress(asyncio.CancelledError):
            await interrupt_task


@dataclass
class RunCancelState:
    """当前 run 所处的取消阶段，用于幂等判断。"""
    requested: bool = False
    reason: str = ""
    cleanup_started: bool = False
    cleanup_finished: bool = False


class RunCleanupRegistry:
    """当前 run 的业务 cleanup handler 注册表。

    - 按 key 注册，可替换、可注销
    - run_all() 在单次 run 内只执行一次（幂等保护）
    - AgentContext.reset_run_state() 创建新实例，旧 handler 自然失效
    """

    def __init__(self) -> None:
        self._handlers: dict[str, Callable[[], Awaitable[None]]] = {}
        self._executed: bool = False

    def register(self, key: str, handler: Callable[[], Awaitable[None]]) -> None:
        self._handlers[key] = handler

    async def run_all(self) -> None:
        """执行所有已注册的 handler，幂等，最多执行一次。"""
        if self._executed:
            return
        self._executed = True

        async def _run_handler(key: str, handler: Callable[[], Awaitable[None]]) -> None:
            try:
                await handler()
            except asyncio.CancelledError:
                logger.info(f"[RunCleanupRegistry] handler '{key}' was cancelled during cleanup")
            except Exception as e:
                logger.error(f"[RunCleanupRegistry] handler '{key}' raised: {e}", exc_info=True)

        await asyncio.gather(*(
            _run_handler(key, handler)
            for key, handler in list(self._handlers.items())
        ))


class RunCancellationHandle:
    """当前 run 的 worker cancel 入口。

    worker task 创建后通过 register() 注入 cancel callback，
    AgentContext.stop_run() 通过此句柄取消 worker。
    """

    def __init__(self) -> None:
        self._cancel_cb: Optional[Callable[[], Awaitable[None]]] = None

    def register(self, cb: Callable[[], Awaitable[None]]) -> None:
        self._cancel_cb = cb

    async def cancel(self) -> None:
        if self._cancel_cb is not None:
            try:
                await self._cancel_cb()
            except asyncio.CancelledError:
                logger.info("[RunCancellationHandle] worker cancel callback was cancelled")
            except Exception as e:
                logger.error(f"[RunCancellationHandle] cancel callback raised: {e}", exc_info=True)
