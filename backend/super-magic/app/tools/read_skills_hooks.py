"""Generic hooks fired after read_skills successfully loads a Skill."""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class SkillLoadedHookContext:
    requested_skill_name: str
    resolved_skill_name: str
    location: str | None
    skill_dir: Path | None
    tool_context: ToolContext | None
    agent_context: object | None


SkillLoadedHook = Callable[
    [SkillLoadedHookContext],
    None | Awaitable[None],
]


class SkillLoadedHookRegistry:
    def __init__(self) -> None:
        self._hooks_by_skill_name: dict[str, list[SkillLoadedHook]] = {}

    def register(self, skill_name: str, hook: SkillLoadedHook) -> None:
        normalized_name = skill_name.strip()
        if not normalized_name:
            raise ValueError("skill_name cannot be empty")

        hooks = self._hooks_by_skill_name.setdefault(normalized_name, [])
        if hook not in hooks:
            hooks.append(hook)

    async def notify_loaded(self, context: SkillLoadedHookContext) -> None:
        for skill_name in _iter_skill_names(context):
            for hook in tuple(self._hooks_by_skill_name.get(skill_name, ())):
                try:
                    result = hook(context)
                    if inspect.isawaitable(result):
                        await result
                except Exception as exc:
                    logger.warning(
                        "read_skills hook failed: "
                        f"skill={skill_name}, hook={getattr(hook, '__name__', repr(hook))}, error={exc}"
                    )


_REGISTRY = SkillLoadedHookRegistry()


def register_skill_loaded_hook(skill_name: str, hook: SkillLoadedHook) -> None:
    _REGISTRY.register(skill_name, hook)


async def notify_skill_loaded(context: SkillLoadedHookContext) -> None:
    await _REGISTRY.notify_loaded(context)


def _iter_skill_names(context: SkillLoadedHookContext) -> tuple[str, ...]:
    names: list[str] = []
    for name in (context.requested_skill_name, context.resolved_skill_name):
        normalized_name = (name or "").strip()
        if normalized_name and normalized_name not in names:
            names.append(normalized_name)
    return tuple(names)
