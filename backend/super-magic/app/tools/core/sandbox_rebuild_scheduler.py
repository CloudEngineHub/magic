"""Delay self-rebuild requests to give the current Agent time to reply."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Literal

from app.core.context.agent_context import AgentContext
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.tools.core.sandbox_tool_context import LoggerLike

SandboxRebuildOperation = Literal["upgrade"]

SANDBOX_REBUILD_DELAY_SECONDS = 10
_pending_tasks: dict[str, asyncio.Task[None]] = {}
_pending_cleanups: dict[str, Callable[[], Awaitable[None]]] = {}


def _schedule_cleanup(
    cleanup: Callable[[], Awaitable[None]],
    *,
    logger: LoggerLike,
    operation: SandboxRebuildOperation,
) -> None:
    async def _run_cleanup() -> None:
        try:
            await cleanup()
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.error(
                "Cleaning up cancelled delayed sandbox %s failed: %s",
                operation,
                exc,
                exc_info=True,
            )

    asyncio.create_task(_run_cleanup())


def schedule_sandbox_rebuild(
    *,
    agent_context: AgentContext,
    config: MagicServiceConfig,
    sandbox_id: str,
    operation: SandboxRebuildOperation,
    delay_seconds: int,
    logger: LoggerLike,
    on_cancel: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """
    为当前 run 安排一次延迟重建，并在 run 被中断时取消。

    MOCK DEMO：
    - 延迟期间收到新消息：取消延迟任务，并通过 on_cancel 清理相关事项。
    - Magic Service 已接受升级请求：不再执行 on_cancel，把事项交给新 runtime 消费。
    """
    if agent_context.is_interruption_requested():
        raise asyncio.CancelledError(f"Sandbox {operation} interrupted before scheduling")
    if delay_seconds < 1:
        raise ValueError("delay_seconds must be at least 1")

    context_key = agent_context.context_id
    previous_task = _pending_tasks.get(context_key)
    if previous_task is not None and not previous_task.done():
        previous_task.cancel()
        previous_cleanup = _pending_cleanups.pop(context_key, None)
        if previous_cleanup is not None:
            _schedule_cleanup(previous_cleanup, logger=logger, operation=operation)

    task = asyncio.create_task(
        _run_delayed_rebuild(
            config=config,
            sandbox_id=sandbox_id,
            operation=operation,
            delay_seconds=delay_seconds,
            logger=logger,
        ),
        name=f"sandbox-{operation}-{sandbox_id}",
    )
    _pending_tasks[context_key] = task
    if on_cancel is not None:
        _pending_cleanups[context_key] = on_cancel

    def _on_done(done_task: asyncio.Task[None]) -> None:
        if _pending_tasks.get(context_key) is done_task:
            _pending_tasks.pop(context_key, None)
            cleanup = _pending_cleanups.pop(context_key, None)
        else:
            cleanup = None
        try:
            done_task.result()
        except asyncio.CancelledError:
            logger.info("Delayed sandbox %s was cancelled before execution", operation)
            if cleanup is not None:
                _schedule_cleanup(cleanup, logger=logger, operation=operation)
        except Exception as exc:
            logger.error("Delayed sandbox %s failed: %s", operation, exc, exc_info=True)
            if cleanup is not None:
                _schedule_cleanup(cleanup, logger=logger, operation=operation)

    task.add_done_callback(_on_done)

    async def _cancel_pending_rebuild() -> None:
        if _pending_tasks.get(context_key) is not task or task.done():
            return
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    agent_context.register_run_cleanup(
        f"sandbox-rebuild:{context_key}",
        _cancel_pending_rebuild,
    )


async def _run_delayed_rebuild(
    *,
    config: MagicServiceConfig,
    sandbox_id: str,
    operation: SandboxRebuildOperation,
    delay_seconds: int,
    logger: LoggerLike,
) -> None:
    await asyncio.sleep(delay_seconds)
    logger.info(
        "Triggering delayed sandbox %s after %s seconds, sandbox_id=%s",
        operation,
        delay_seconds,
        sandbox_id,
    )

    async with MagicServiceClient(config) as client:
        await client.upgrade_sandbox(sandbox_id)


__all__ = [
    "SANDBOX_REBUILD_DELAY_SECONDS",
    "SandboxRebuildOperation",
    "schedule_sandbox_rebuild",
]
