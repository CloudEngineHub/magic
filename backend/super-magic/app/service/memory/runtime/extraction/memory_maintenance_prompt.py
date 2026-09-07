"""构造 after-run 的主文件用量事实；维护策略由 memory Skill 提供。"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from app.service.memory.policies.memory_file_budget import (
    MemoryFileReadStatus, MemoryFileTokenUsage, MemoryMdBudget, inspect_memory_file,
)
from app.service.memory.policies.memory_scope import MemoryScopeKind, resolve_memory_scopes

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryMaintenancePromptBuilder:
    """并发测量适用的主文件，不读取 notes、不根据数字生成语义整改指令。"""

    async def inspect(self, agent_context: "AgentContext") -> tuple[MemoryFileTokenUsage, ...]:
        # MOCK DEMO：全局 12K、项目 18K -> 两份分别报告，只有项目触发重组 reference。
        # Claw 工作区记忆由自身规则管理，不套普通 MEMORY.md 的 10K/16K 预算。
        scopes = tuple(scope for scope in resolve_memory_scopes(agent_context) if scope.kind != MemoryScopeKind.CLAW_WORKSPACE)
        usages = await asyncio.gather(*(
            inspect_memory_file(scope.memory_file, agent_context.get_interruption_event()) for scope in scopes
        ))
        # 计数结果仍需属于当前项目；自动开关不参与目录归属判断。
        current = resolve_memory_scopes(agent_context)
        return tuple(usage for scope, usage in zip(scopes, usages) if scope in current)

    @staticmethod
    def render_usage(usages: tuple[MemoryFileTokenUsage, ...], budget: MemoryMdBudget | None) -> str:
        lines = ["Initial MEMORY.md usage; counts are estimates, and each file is evaluated separately:"]
        for usage in usages:
            if usage.status == MemoryFileReadStatus.MISSING:
                lines.append(f"- {usage.path}: no file currently exists.")
            elif usage.status != MemoryFileReadStatus.OK:
                lines.append(f"- {usage.path}: current count unavailable ({usage.status.value}); preserve existing content until it can be inspected.")
            else:
                allowance = (
                    f"target {budget.target_tokens:,}; maximum {budget.max_tokens:,}; "
                    f"over maximum: {'yes' if budget.is_over_budget(usage.estimated_tokens) else 'no'}"
                    if budget is not None and usage.estimated_tokens is not None else "configured budget unavailable"
                )
                lines.append(f"- {usage.path}: {usage.estimated_tokens:,} estimated tokens; {usage.size_bytes:,} bytes; {allowance}.")
        if not usages:
            lines.append("No user-global or ordinary-project MEMORY.md usage is available in this scope.")
        lines.append("Reuse these initial counts and subsequent writing-tool feedback; do not recount merely because a write succeeded.")
        return "\n".join(lines)


__all__ = ["MemoryMaintenancePromptBuilder"]
