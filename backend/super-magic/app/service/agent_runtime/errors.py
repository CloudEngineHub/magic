"""Agent runtime errors."""

from __future__ import annotations

from app.core.models.agent_runtime import AgentTargetError


class AgentRuntimeError(RuntimeError):
    """Base error for the unified Agent runtime."""


class AgentDefinitionPrepareError(AgentRuntimeError):
    """Raised when a static Agent definition cannot be prepared."""


class AgentRuntimeBusyError(AgentRuntimeError):
    """Raised when a cached Agent is still running and cannot be replaced."""
