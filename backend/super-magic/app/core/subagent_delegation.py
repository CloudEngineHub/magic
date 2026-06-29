"""Sub-agent delegation helpers for Crew agents."""

from __future__ import annotations

import re


# 接受 SMA- 和 SMA_ 两种前缀，默认支持两种；后续字符为字母、数字、下划线、点、连字符。
# 这是 Crew 员工 code 的唯一校验口径，分类（是否 Crew）与路径安全校验都复用它。
_CREW_AGENT_CODE_PATTERN = re.compile(r"^SMA[-_][A-Za-z0-9][A-Za-z0-9_.-]*$", re.IGNORECASE)


def is_crew_agent_code(agent_name: str | None) -> bool:
    """Return whether an agent name looks like a Crew agent code."""
    if not agent_name:
        return False
    return _CREW_AGENT_CODE_PATTERN.fullmatch(agent_name.strip()) is not None
