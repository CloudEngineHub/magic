"""Shared context resolution for tools that manage the current sandbox."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.context.agent_context import AgentContext
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.tools.core.magic_service_tool_context import get_magic_service_tool_context


class LoggerLike(Protocol):
    def debug(self, message: str, *args: object, **kwargs: object) -> object: ...

    def info(self, message: str, *args: object, **kwargs: object) -> object: ...

    def error(self, message: str, *args: object, **kwargs: object) -> object: ...


@dataclass(frozen=True, slots=True)
class SandboxToolContext:
    config: MagicServiceConfig
    agent_context: AgentContext
    sandbox_id: str


def get_sandbox_tool_context(
    tool_context: ToolContext,
    *,
    logger: LoggerLike,
) -> SandboxToolContext | ToolResult:
    """Resolve the authenticated service config and the current sandbox identity."""
    service_context = get_magic_service_tool_context(tool_context, logger=logger)
    if isinstance(service_context, ToolResult):
        return ToolResult.error(
            "Unable to load the authenticated sandbox service context.",
            extra_info={"internal_error": service_context.content},
        )

    agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
    if agent_context is None:
        return ToolResult.error("The current Agent context is unavailable.")

    sandbox_id = agent_context.get_sandbox_id()
    if not isinstance(sandbox_id, str) or not sandbox_id.strip():
        return ToolResult.error("The current sandbox ID is unavailable in AgentContext.")

    return SandboxToolContext(
        config=service_context.config,
        agent_context=agent_context,
        sandbox_id=sandbox_id.strip(),
    )


__all__ = ["SandboxToolContext", "get_sandbox_tool_context"]
