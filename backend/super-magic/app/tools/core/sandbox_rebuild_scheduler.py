"""Delay self-rebuild requests to give the current Agent time to reply."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import Literal

from app.core.context.agent_context import AgentContext
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.tools.core.sandbox_tool_context import LoggerLike

SandboxRebuildOperation = Literal["upgrade", "restart"]

SANDBOX_REBUILD_DELAY_SECONDS = 10
_pending_tasks: dict[str, asyncio.Task[None]] = {}


def schedule_sandbox_rebuild(
    *,
    agent_context: AgentContext,
    config: MagicServiceConfig,
    sandbox_id: str,
    operation: SandboxRebuildOperation,
    delay_seconds: int,
    logger: LoggerLike,
) -> None:
    """Schedule one rebuild for this run and cancel it if the run is interrupted."""
    if agent_context.is_interruption_requested():
        raise asyncio.CancelledError(f"Sandbox {operation} interrupted before scheduling")
    if delay_seconds < 1:
        raise ValueError("delay_seconds must be at least 1")

    context_key = agent_context.context_id
    previous_task = _pending_tasks.get(context_key)
    if previous_task is not None and not previous_task.done():
        previous_task.cancel()

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

    def _on_done(done_task: asyncio.Task[None]) -> None:
        if _pending_tasks.get(context_key) is done_task:
            _pending_tasks.pop(context_key, None)
        try:
            done_task.result()
        except asyncio.CancelledError:
            logger.info("Delayed sandbox %s was cancelled before execution", operation)
        except Exception as exc:
            logger.error("Delayed sandbox %s failed: %s", operation, exc, exc_info=True)

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
        if operation == "upgrade":
            await client.upgrade_sandbox(sandbox_id)
        else:
            await client.restart_sandbox(sandbox_id)


__all__ = [
    "SANDBOX_REBUILD_DELAY_SECONDS",
    "SandboxRebuildOperation",
    "schedule_sandbox_rebuild",
]
