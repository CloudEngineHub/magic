from __future__ import annotations

import hashlib
import html
import re
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING

from agentlang.chat_history.chat_history import ChatHistory
from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.tools.read_file import ReadFile, ReadFileParams
from app.utils.async_file_utils import (
    async_exists,
    async_is_dir,
)

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext
    from app.utils.file_utils import WorkspaceEntry

logger = get_logger(__name__)

_PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_AUTO_READ_SOURCE_PREFIX = "auto_read_file:"
_INSTRUCTION_INDEX_SOURCE_PREFIX = "project_instruction_index:"
_INSTRUCTION_INDEX_MAX_CHARS = 24 * 1024


class AutoReadLoadPolicy(StrEnum):
    """自动文件规则的正文加载策略。"""

    ALWAYS = "always"
    DISCOVER_ONLY = "discover_only"


class AutoReadRuleId(StrEnum):
    """模型可见的自动文件角色。"""

    PROJECT_INSTRUCTIONS = "project_instructions"
    GLOBAL_MEMORY = "global_memory"
    PROJECT_MEMORY = "project_memory"
    CLAW_MEMORY = "claw_memory"


class AutoReadPathKind(StrEnum):
    """规则候选路径的解析方式。"""

    WORKSPACE_ROOT_AGENTS = "workspace_root_agents"
    NESTED_AGENTS = "nested_agents"
    GLOBAL_MEMORY = "global_memory"
    PROJECT_MEMORY = "project_memory"
    CLAW_MEMORY = "claw_memory"


@dataclass(frozen=True)
class AutoReadFileRule:
    """声明自动文件的角色、加载方式和路径来源。"""

    rule_id: AutoReadRuleId
    load_policy: AutoReadLoadPolicy
    path_kind: AutoReadPathKind
    priority: int


@dataclass(frozen=True)
class AutoReadFileCandidate:
    """已完成作用域和安全校验的自动文件候选。"""

    rule_id: AutoReadRuleId
    load_policy: AutoReadLoadPolicy
    absolute_path: Path
    display_path: str
    scope: str
    priority: int


AUTO_READ_FILE_RULES: tuple[AutoReadFileRule, ...] = (
    AutoReadFileRule(
        rule_id=AutoReadRuleId.PROJECT_INSTRUCTIONS,
        load_policy=AutoReadLoadPolicy.ALWAYS,
        path_kind=AutoReadPathKind.WORKSPACE_ROOT_AGENTS,
        priority=10,
    ),
    AutoReadFileRule(
        rule_id=AutoReadRuleId.GLOBAL_MEMORY,
        load_policy=AutoReadLoadPolicy.ALWAYS,
        path_kind=AutoReadPathKind.GLOBAL_MEMORY,
        priority=20,
    ),
    AutoReadFileRule(
        rule_id=AutoReadRuleId.PROJECT_MEMORY,
        load_policy=AutoReadLoadPolicy.ALWAYS,
        path_kind=AutoReadPathKind.PROJECT_MEMORY,
        priority=30,
    ),
    AutoReadFileRule(
        rule_id=AutoReadRuleId.CLAW_MEMORY,
        load_policy=AutoReadLoadPolicy.ALWAYS,
        path_kind=AutoReadPathKind.CLAW_MEMORY,
        priority=40,
    ),
    AutoReadFileRule(
        rule_id=AutoReadRuleId.PROJECT_INSTRUCTIONS,
        load_policy=AutoReadLoadPolicy.DISCOVER_ONLY,
        path_kind=AutoReadPathKind.NESTED_AGENTS,
        priority=50,
    ),
)


class AutoReadFileService:
    """在每次真实模型调用前统一发现并读取声明式自动文件。"""

    @classmethod
    async def prepare_before_llm(
        cls,
        agent_context: "AgentContext",
        chat_history: ChatHistory,
        *,
        workspace_entries: list["WorkspaceEntry"] | None = None,
    ) -> None:
        """使用现有工作区快照追加规则索引，并通过 ReadFile 交付自动文件。"""
        try:
            candidates = await cls._resolve_candidates(agent_context, workspace_entries)
            await cls._append_instruction_index(chat_history, candidates)
            await cls._append_always_read_files(agent_context, chat_history, candidates)
        except Exception as error:
            logger.warning(f"自动文件准备失败，本轮继续执行: {error}", exc_info=True)

    @classmethod
    async def _resolve_candidates(
        cls,
        agent_context: "AgentContext",
        workspace_entries: list["WorkspaceEntry"] | None,
    ) -> tuple[AutoReadFileCandidate, ...]:
        candidates: list[AutoReadFileCandidate] = []
        for rule in AUTO_READ_FILE_RULES:
            try:
                candidates.extend(await cls._resolve_rule(agent_context, rule, workspace_entries))
            except Exception as error:
                logger.warning(
                    "自动文件规则解析失败，已跳过: "
                    f"rule_id={rule.rule_id.value} path_kind={rule.path_kind.value} error={error}",
                    exc_info=True,
                )

        deduplicated: dict[str, AutoReadFileCandidate] = {}
        for candidate in sorted(
            candidates,
            key=lambda item: (item.priority, len(Path(item.display_path).parts), item.display_path),
        ):
            path_key = str(candidate.absolute_path.absolute())
            existing = deduplicated.get(path_key)
            if existing is None or candidate.load_policy == AutoReadLoadPolicy.ALWAYS:
                deduplicated[path_key] = candidate

        return tuple(
            sorted(
                deduplicated.values(),
                key=lambda item: (item.priority, len(Path(item.display_path).parts), item.display_path),
            )
        )

    @classmethod
    async def _resolve_rule(
        cls,
        agent_context: "AgentContext",
        rule: AutoReadFileRule,
        workspace_entries: list["WorkspaceEntry"] | None,
    ) -> list[AutoReadFileCandidate]:
        workspace_dir = Path(agent_context.get_workspace_dir()).absolute()
        memory_root = PathManager.get_memory_root_dir().expanduser().absolute()

        if rule.path_kind == AutoReadPathKind.WORKSPACE_ROOT_AGENTS:
            return await cls._single_candidate(
                rule,
                workspace_dir / "AGENTS.md",
                display_path="AGENTS.md",
                scope=".",
            )
        if rule.path_kind == AutoReadPathKind.NESTED_AGENTS:
            return cls._resolve_nested_agents_from_snapshot(workspace_dir, rule, workspace_entries)
        if rule.path_kind == AutoReadPathKind.GLOBAL_MEMORY:
            return await cls._single_candidate(
                rule,
                memory_root / "global" / "MEMORY.md",
                display_path=str(memory_root / "global" / "MEMORY.md"),
                scope="user-global",
            )
        if rule.path_kind == AutoReadPathKind.PROJECT_MEMORY:
            project_id = cls._resolve_project_id(agent_context)
            if not project_id or agent_context.is_magiclaw():
                return []
            project_path = memory_root / "projects" / f"p_{project_id}" / "MEMORY.md"
            return await cls._single_candidate(
                rule,
                project_path,
                display_path=str(project_path),
                scope=f"user-project:{project_id}",
            )
        if rule.path_kind == AutoReadPathKind.CLAW_MEMORY:
            if not agent_context.is_magiclaw():
                return []
            claw_path = workspace_dir / ".magic" / "MEMORY.md"
            return await cls._single_candidate(
                rule,
                claw_path,
                display_path=".magic/MEMORY.md",
                scope="claw-runtime",
            )
        return []

    @classmethod
    async def _single_candidate(
        cls,
        rule: AutoReadFileRule,
        file_path: Path,
        *,
        display_path: str,
        scope: str,
    ) -> list[AutoReadFileCandidate]:
        if not await cls._is_safe_regular_file(file_path):
            return []
        return [
            AutoReadFileCandidate(
                rule_id=rule.rule_id,
                load_policy=rule.load_policy,
                absolute_path=file_path.absolute(),
                display_path=display_path,
                scope=scope,
                priority=rule.priority,
            )
        ]

    @classmethod
    def _resolve_nested_agents_from_snapshot(
        cls,
        workspace_dir: Path,
        rule: AutoReadFileRule,
        workspace_entries: list["WorkspaceEntry"] | None,
    ) -> list[AutoReadFileCandidate]:
        if not workspace_entries:
            return []

        candidates: list[AutoReadFileCandidate] = []
        for entry in workspace_entries:
            relative_path = str(entry["path"]).strip()
            if not relative_path or relative_path.endswith("/"):
                continue
            path = Path(relative_path)
            if path.name != "AGENTS.md" or relative_path == "AGENTS.md":
                continue
            if ".magic" in path.parts:
                continue
            scope_path = path.parent.as_posix()
            candidates.append(
                AutoReadFileCandidate(
                    rule_id=rule.rule_id,
                    load_policy=rule.load_policy,
                    absolute_path=(workspace_dir / path).absolute(),
                    display_path=relative_path,
                    scope=f"{scope_path}/",
                    priority=rule.priority,
                )
            )
        return candidates

    @staticmethod
    def _resolve_project_id(agent_context: "AgentContext") -> str:
        project_id = str(agent_context.get_project_id() or "").strip()
        if _PROJECT_ID_PATTERN.fullmatch(project_id):
            return project_id
        if project_id:
            logger.warning("project_id 不符合安全路径规则，跳过项目记忆")
        return ""

    @staticmethod
    async def _is_safe_regular_file(file_path: Path) -> bool:
        candidate = file_path.expanduser().absolute()
        return await async_exists(candidate) and not await async_is_dir(candidate)

    @classmethod
    async def _append_instruction_index(
        cls,
        chat_history: ChatHistory,
        candidates: tuple[AutoReadFileCandidate, ...],
    ) -> None:
        nested_candidates = [
            candidate
            for candidate in candidates
            if candidate.load_policy == AutoReadLoadPolicy.DISCOVER_ONLY
        ]
        index_lines = [
            "<system_injected_context>",
            '<available_project_instructions state="current">',
            (
                "These nested AGENTS.md files are discoverable project instructions. Their paths are indexed, "
                "but their contents have not been read. After locating a target path, read every applicable "
                "indexed AGENTS.md from the shallowest scope to the deepest scope before reading in detail, "
                "modifying files, or running commands that affect that path."
            ),
        ]
        omitted_count = 0
        truncation_reasons: set[str] = set()
        for order, candidate in enumerate(nested_candidates, start=1):
            line = (
                f'<instruction path="{html.escape(candidate.display_path, quote=True)}" '
                f'scope="{html.escape(candidate.scope, quote=True)}" order="{order}" />'
            )
            projected_content = "\n".join(
                (*index_lines, line, "</available_project_instructions>", "</system_injected_context>")
            )
            if len(projected_content) > _INSTRUCTION_INDEX_MAX_CHARS:
                omitted_count += 1
                truncation_reasons.add("max_index_chars")
                continue
            index_lines.append(line)
        if omitted_count:
            reason = ",".join(sorted(truncation_reasons)) or "max_index_chars"
            index_lines.append(
                f'<index_status truncated="true" reason="{html.escape(reason, quote=True)}" '
                f'omitted_count="{omitted_count}">'
                "Use file search to locate additional AGENTS.md files before changing an unlisted directory."
                "</index_status>"
            )
        index_lines.extend(("</available_project_instructions>", "</system_injected_context>"))
        content = "\n".join(index_lines)
        fingerprint = hashlib.sha256(content.encode("utf-8")).hexdigest()[:20]
        source = f"{_INSTRUCTION_INDEX_SOURCE_PREFIX}{fingerprint}"
        if cls._has_source(chat_history, source):
            return
        await chat_history.append_user_message(content, show_in_ui=False, source=source)

    @classmethod
    async def _append_always_read_files(
        cls,
        agent_context: "AgentContext",
        chat_history: ChatHistory,
        candidates: tuple[AutoReadFileCandidate, ...],
    ) -> None:
        workspace_dir = Path(agent_context.get_workspace_dir())
        tool_context = ToolContext(metadata=agent_context.get_metadata())
        tool_context.register_extension("agent_context", agent_context)
        read_file = ReadFile(base_dir=workspace_dir)

        for candidate in candidates:
            if candidate.load_policy != AutoReadLoadPolicy.ALWAYS:
                continue
            source = cls._build_file_source(candidate.absolute_path)
            delivered = cls._has_source(chat_history, source)
            tracked = await agent_context.horizon.is_file_tracked(candidate.absolute_path)
            if delivered and tracked:
                continue

            result = await read_file.execute(
                tool_context,
                ReadFileParams(
                    file_path=str(candidate.absolute_path),
                    offset=0,
                    limit=-1,
                ),
            )
            if not result.ok:
                logger.warning(
                    "自动读取文件失败: "
                    f"rule_id={candidate.rule_id.value} path={candidate.display_path} content={result.content}"
                )
                continue

            content = "\n".join(
                (
                    "<system_injected_context>",
                    (
                        f'<auto_read_file state="current" rule_id="{candidate.rule_id.value}" '
                        f'path="{html.escape(candidate.display_path, quote=True)}" '
                        f'scope="{html.escape(candidate.scope, quote=True)}">'
                    ),
                    (
                        "The runtime called read_file for this file. Treat the result as content already read in "
                        "the current context. The shared file-loading mechanism does not change the file's "
                        "ownership or authority."
                    ),
                    "<read_file_result>",
                    html.escape(result.content, quote=False),
                    "</read_file_result>",
                    "</auto_read_file>",
                    "</system_injected_context>",
                )
            )
            await chat_history.append_user_message(content, show_in_ui=False, source=source)

    @staticmethod
    def _build_file_source(file_path: Path) -> str:
        path_hash = hashlib.sha256(str(file_path.absolute()).encode("utf-8")).hexdigest()[:20]
        return f"{_AUTO_READ_SOURCE_PREFIX}{path_hash}"

    @staticmethod
    def _has_source(chat_history: ChatHistory, source: str) -> bool:
        return any(getattr(message, "source", None) == source for message in chat_history.messages)
