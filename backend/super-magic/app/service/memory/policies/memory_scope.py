"""解析记忆所属目录，供自动读取、after-run 和目录观察复用。"""

import re
import html
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING

from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.service.memory.policies.memory_skill_policy import is_auto_memory_enabled, is_memory_skill_available

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)
_PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class MemoryScopeKind(StrEnum):
    GLOBAL = "global"
    PROJECT = "project"
    CLAW_WORKSPACE = "claw_workspace"


@dataclass(frozen=True)
class MemoryScope:
    kind: MemoryScopeKind
    root: Path

    @property
    def memory_file(self) -> Path:
        return self.root / "MEMORY.md"


def resolve_memory_scopes(agent_context: "AgentContext") -> tuple[MemoryScope, ...]:
    # 普通项目拥有 global 和 p_<project_id>；Claw 拥有 global 和自己的 .magic。
    # Claw 的工作区记忆承担项目背景职责，不再多建普通项目副本。
    # 这里不创建目录、不判断文件已读，路径不存在仍可用于之后发现新目录；文件读取另行检查。
    # 关闭自动记忆后，用户仍能主动查询或整理；目录归属不能由自动设置或 Skill 状态决定。
    memory_root = PathManager.get_memory_root_dir().expanduser().absolute()
    scopes: list[MemoryScope] = [MemoryScope(MemoryScopeKind.GLOBAL, memory_root / "global")]
    if not agent_context.is_magiclaw():
        project_id = str(agent_context.get_project_id() or "").strip()
        if _PROJECT_ID_PATTERN.fullmatch(project_id):
            scopes.append(MemoryScope(MemoryScopeKind.PROJECT, memory_root / "projects" / f"p_{project_id}"))
        elif project_id:
            logger.warning("project_id 不符合安全路径规则，跳过项目记忆")
    if agent_context.is_magiclaw():
        scopes.append(MemoryScope(MemoryScopeKind.CLAW_WORKSPACE, Path(agent_context.get_workspace_dir()).absolute() / ".magic"))
    return tuple(scopes)


def build_memory_runtime_context(agent_context: "AgentContext") -> str:
    """只提供运行时事实；记忆组织和维护策略保持在 Skill 中。"""
    from app.service.memory.policies.memory_file_budget import get_memory_md_budget

    labels = {
        MemoryScopeKind.GLOBAL: "User-global memory",
        MemoryScopeKind.PROJECT: "Current ordinary-project memory",
        MemoryScopeKind.CLAW_WORKSPACE: "Claw workspace memory (its own rules apply)",
    }
    auto_enabled = is_auto_memory_enabled(agent_context)
    lines = [f"Automatic long-term memory: {'enabled' if auto_enabled else 'disabled'}."]
    if not auto_enabled:
        lines.append(
            "Do not automatically read, extract, save, or reorganize memory. "
            "Explicit requests to view, remember, correct, organize, or forget information remain actionable "
            "under the existing permissions."
        )
    if is_memory_skill_available(agent_context):
        lines.append("The memory skill is available independently of the automatic-memory setting.")
    else:
        lines.append(
            "The general memory skill is unavailable or explicitly excluded in this run; "
            "do not start general memory automation without its instructions."
        )
    scopes = resolve_memory_scopes(agent_context)
    lines.extend(f"{labels[scope.kind]}: {html.escape(str(scope.root))}" for scope in scopes)
    budget = get_memory_md_budget()
    if budget is not None:
        lines.append(
            f"Each user-global or ordinary-project MEMORY.md has a target of {budget.target_tokens:,} "
            f"and a maximum of {budget.max_tokens:,} estimated tokens. These are per-file values, not a combined limit."
        )
    else:
        lines.append("The MEMORY.md token budget is unavailable; no budget-driven automatic operation is enabled.")
    return "\n".join(lines)
