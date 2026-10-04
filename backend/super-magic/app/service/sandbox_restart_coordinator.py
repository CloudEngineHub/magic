"""Coordinate Agent-triggered sandbox restarts at the end of a run."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from agentlang.logger import get_logger
from app.core.context.agent_context import AgentContext
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.config import MagicServiceConfig

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class PendingRestart:
    """The information required to dispatch one terminal restart request."""

    context_id: str
    sandbox_id: str
    config: MagicServiceConfig
    cancel_resumption: Callable[[], Awaitable[None]]


class SandboxRestartCoordinator:
    """Keep one cancellable restart request per Agent run."""

    def __init__(self) -> None:
        self._pending: dict[str, PendingRestart] = {}

    def request_restart(
        self,
        *,
        agent_context: AgentContext,
        config: MagicServiceConfig,
        sandbox_id: str,
        cancel_resumption: Callable[[], Awaitable[None]],
    ) -> None:
        """Register a restart to dispatch after the current run is finalized."""
        if agent_context.is_interruption_requested():
            raise asyncio.CancelledError("Sandbox restart interrupted before registration")

        context_id = agent_context.context_id
        if context_id in self._pending:
            raise ValueError("A sandbox restart is already pending for this Agent run")

        pending = PendingRestart(
            context_id=context_id,
            sandbox_id=sandbox_id,
            config=config,
            cancel_resumption=cancel_resumption,
        )
        self._pending[context_id] = pending

        async def _cancel_pending() -> None:
            await self.cancel_pending_restart(context_id)

        try:
            agent_context.register_run_cleanup(
                f"sandbox-restart:{context_id}",
                _cancel_pending,
            )
        except Exception:
            self._pending.pop(context_id, None)
            raise

    async def cancel_pending_restart(self, context_id: str) -> None:
        """Cancel a restart that has not entered its terminal dispatch phase."""
        pending = self._pending.pop(context_id, None)
        if pending is None:
            return

        try:
            await pending.cancel_resumption()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "Failed to cancel sandbox restart resumption: context_id=%s error=%s",
                context_id,
                exc,
                exc_info=True,
            )

    async def dispatch_pending_restart(
        self,
        *,
        agent_context: AgentContext,
        run_succeeded: bool,
    ) -> None:
        """Dispatch one restart after all current-run finalization has completed."""
        context_id = agent_context.context_id
        pending = self._pending.get(context_id)
        if pending is None:
            return

        if not run_succeeded or agent_context.is_interruption_requested():
            await self.cancel_pending_restart(context_id)
            return

        # Removing the record before the request makes dispatch one-shot and
        # prevents a later cleanup from cancelling a request that may already
        # have reached Magic Service.
        pending = self._pending.pop(context_id)
        logger.info(
            "Dispatching terminal sandbox restart: context_id=%s sandbox_id=%s",
            pending.context_id,
            pending.sandbox_id,
        )

        dispatch_task = asyncio.create_task(
            self._dispatch_restart(pending),
            name=f"sandbox-restart-{pending.sandbox_id}",
        )
        try:
            await asyncio.shield(dispatch_task)
        except asyncio.CancelledError:
            # Once dispatch starts, let the HTTP request finish before
            # propagating cancellation. Its result is intentionally not
            # retried because the request may already have been delivered.
            logger.warning(
                "Sandbox restart dispatch was cancelled; waiting for terminal request: "
                "sandbox_id=%s",
                pending.sandbox_id,
            )
            try:
                await asyncio.shield(dispatch_task)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error(
                    "Terminal sandbox restart request failed after cancellation: "
                    "sandbox_id=%s error=%s",
                    pending.sandbox_id,
                    exc,
                    exc_info=True,
                )
            raise
        except Exception as exc:
            logger.error(
                "Terminal sandbox restart request failed: sandbox_id=%s error=%s",
                pending.sandbox_id,
                exc,
                exc_info=True,
            )

    @staticmethod
    async def _dispatch_restart(pending: PendingRestart) -> None:
        async with MagicServiceClient(pending.config) as client:
            await client.restart_sandbox(pending.sandbox_id)


sandbox_restart_coordinator = SandboxRestartCoordinator()

__all__ = [
    "PendingRestart",
    "SandboxRestartCoordinator",
    "sandbox_restart_coordinator",
]
