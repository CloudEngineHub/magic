"""Sub-agent delegation helpers for Crew agents."""

from __future__ import annotations

import re


_CREW_AGENT_CODE_PATTERN = re.compile(r"^SMA[-_][A-Za-z0-9][A-Za-z0-9_.-]*$", re.IGNORECASE)


def is_crew_agent_code(agent_name: str | None) -> bool:
    """Return whether an agent name looks like a Crew agent code."""
    if not agent_name:
        return False
    return _CREW_AGENT_CODE_PATTERN.fullmatch(agent_name.strip()) is not None
