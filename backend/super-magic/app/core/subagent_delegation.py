"""Sub-agent delegation helpers for Crew agents."""

from __future__ import annotations

import re
from typing import Any


SUBAGENTS_SKILL = "subagents"

_CREW_AGENT_CODE_PATTERN = re.compile(r"^SMA[-_][A-Za-z0-9][A-Za-z0-9_.-]*$", re.IGNORECASE)


def is_crew_agent_code(agent_name: str | None) -> bool:
    """Return whether an agent name looks like a Crew agent code."""
    if not agent_name:
        return False
    return _CREW_AGENT_CODE_PATTERN.fullmatch(agent_name.strip()) is not None


def is_subagent_delegation_enabled(agent_context: Any) -> bool:
    """Return whether the current AgentContext has sub-agent delegation enabled."""
    if agent_context is None:
        return False

    checker = getattr(agent_context, "is_subagent_delegation_enabled", None)
    if callable(checker):
        try:
            return bool(checker())
        except Exception:
            return False

    has_skill = getattr(agent_context, "has_skill", None)
    if callable(has_skill):
        try:
            return bool(has_skill(SUBAGENTS_SKILL))
        except Exception:
            return False

    return False


def build_crew_delegation_disabled_message() -> str:
    return (
        "Sub-agent delegation is not enabled for the current agent. "
        "Enable the subagents skill together with the agent_list, call_subagent, "
        "and wait_for_subagents tools before assigning work to Crew agents."
    )
