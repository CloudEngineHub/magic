"""复用来源 Agent 的 Skill 配置，向 after-run 提供低频说明和当前用量。"""

from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from agentlang.agent.define import parse_agent_file
from agentlang.environment import Environment
from agentlang.logger import get_logger
from agentlang.skills.loader import SkillLoader
from app.core.agent_definition_normalizer import normalize_agent_definition
from app.core.models.agent_runtime import AgentProviderType, AgentTarget
from app.core.skill_manager import resolve_skills_metadata
from app.core.skill_utils.runtime_policy import resolve_runtime_skills
from app.path_manager import PathManager
from app.service.memory.policies.memory_file_budget import get_memory_md_budget
from app.service.memory.policies.memory_scope import build_memory_runtime_context
from app.service.memory.policies.memory_skill_policy import MEMORY_SKILL_NAME, is_memory_skill_available
from app.service.memory.runtime.extraction.memory_maintenance_prompt import MemoryMaintenancePromptBuilder
from app.utils.async_file_utils import async_read_text

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext
    from app.core.horizon.models import SuperMagicProductContextState
    from app.service.agent_context_snapshot_service import AgentContextSnapshot

logger = get_logger(__name__)


class MemoryExtractionPromptProvider:
    """高频主文由 fork 初始化预加载，本请求只增加 after-run 和必要的重组 reference。"""

    def __init__(self, maintenance_prompt_builder: MemoryMaintenancePromptBuilder | None = None) -> None:
        self._maintenance_prompt_builder = maintenance_prompt_builder or MemoryMaintenancePromptBuilder()

    async def load(self, snapshot: "AgentContextSnapshot", agent_context: "AgentContext") -> str:
        try:
            request = await self._load_memory_request(snapshot.source.target, agent_context=agent_context)
        except Exception as error:
            # 读取中 Skill 或 reference 消失，也不能取消 Claw 独立的工作区维护。
            # CancelledError 不在 Exception 内，用户中断不会触发这条降级。
            if not agent_context.is_magiclaw():
                raise
            logger.warning(f"通用 memory 说明不可用，Claw 仅维护自身工作区记忆: {error}")
            request = self._unavailable_request(agent_context)
        # 快照中的话题是来源模型当时已见的产品话题，不是本次后台 Agent 的运行 ID。
        # 只复用已有信息；来源缺失不新增失败条件，也不再捕获快照或查询话题接口。
        source_context = self._format_source_context(snapshot.horizon_state.super_magic_product_context)
        return f"{source_context}\n\n{request}"

    @staticmethod
    def _format_source_context(context: "SuperMagicProductContextState | None") -> str:
        if context is None:
            return "Source project and topic: unavailable in the captured context."
        return (
            "Source conversation captured for this memory task:\n"
            f"Project: {html.escape(context.project.name)} (ID: {html.escape(context.project.id)})\n"
            f"Topic: {html.escape(context.topic.name)} (ID: {html.escape(context.topic.id)})"
        )

    async def _load_memory_request(self, target: AgentTarget, *, agent_context: "AgentContext") -> str:
        # 复用编译后的来源定义、归一化和同一 Skill 发现顺序，避免后台读到另一来源的同名 Skill。
        # MOCK DEMO：只有项目主文件超过 max -> 注入重组 reference，范围仍只针对该文件；
        # Claw 排除通用 memory -> 仍执行原工作区维护，不能把排除 Skill 当成取消 Claw 记忆。
        if not is_memory_skill_available(agent_context):
            return self._unavailable_request(agent_context)
        definition_text = await async_read_text(PathManager.get_compiled_agent_file(target.agent_name))
        definition, _ = parse_agent_file(definition_text)
        if target.provider_type != AgentProviderType.BUILTIN:
            definition = normalize_agent_definition(target.agent_name, definition)
        runtime = resolve_runtime_skills(definition.skills_config)
        if MEMORY_SKILL_NAME in runtime.skills_config.excluded_skills:
            return self._unavailable_request(agent_context)
        sources = await resolve_skills_metadata(runtime.skills_config, target.agent_name)
        metadata = next((item for item in sources.metadata if item.name == MEMORY_SKILL_NAME), None)
        if metadata is None or metadata.skill_dir is None:
            return self._unavailable_request(agent_context)
        loaded = await SkillLoader().load_from_file(metadata.skill_file or metadata.skill_dir / "SKILL.md")
        if not loaded.content.strip() or not loaded.enabled or (Environment.is_mainland() and loaded.region == "international"):
            return self._unavailable_request(agent_context)

        budget = get_memory_md_budget()
        usages = await self._maintenance_prompt_builder.inspect(agent_context)
        over_budget_files = [
            usage.path for usage in usages
            if budget is not None and usage.estimated_tokens is not None
            and budget.is_over_budget(usage.estimated_tokens)
        ]
        references = ["after-run.md"]
        if over_budget_files:
            references.append("reorganize.md")
        # Skill 提供维护规则；这条 User 消息明确发起本次任务，不能仅提供说明和用量。
        # 同一超限结果同时决定整理目标和 reference 注入，写后超限仍按 Skill 按需读取。
        parts = [
            "<memory_after_run>",
            "Perform this internal after-run memory task now. Follow the supplied after-run.md rules and the "
            "preloaded memory skill to maintain the permitted scopes from the source conversation available "
            "in this fork. Save missing useful information, fill gaps in existing entries, and apply confirmed "
            "corrections and forget requests. Do not resume the source business task.",
            f"The fork preloads the daily memory instructions from {loaded.skill_file}.",
            build_memory_runtime_context(agent_context),
            self._format_time_context(agent_context),
            self._maintenance_prompt_builder.render_usage(usages, budget),
        ]
        if over_budget_files:
            parts.append(
                "Also reorganize the following over-budget MEMORY.md files under the supplied reorganize.md "
                "rules, preserving useful information and bringing each within its stated maximum:\n"
                + "\n".join(f"- {html.escape(str(path))}" for path in over_budget_files)
            )
        for filename in references:
            path = metadata.skill_dir / "references" / filename
            content = await async_read_text(path)
            if not content.strip():
                raise ValueError(f"Required memory reference is empty: {path}")
            parts.append(f'<reference path="{html.escape(str(path), quote=True)}">\n{html.escape(content, quote=False)}\n</reference>')
        parts.append("</memory_after_run>")
        return "\n\n".join(parts)

    @staticmethod
    def _unavailable_request(agent_context: "AgentContext") -> str:
        if not agent_context.is_magiclaw():
            raise RuntimeError("Long-term memory maintenance is unavailable or excluded")
        # 只触发 Claw 已有政策，不在 Python 复制一套记忆维护规则，也不加载被排除的 Skill。
        return (
            "Internal after-run task: maintain this Claw's own workspace memory according to the inherited "
            "AGENTS.md, workspace rules, and claw_memory path. Its workspace memory replaces ordinary project "
            "memory; do not create ordinary project memory. User-global memory maintenance is unavailable "
            "in this run. Do not resume the source business task or repeat already successful memory writes."
        )

    @staticmethod
    def _format_time_context(agent_context: "AgentContext") -> str:
        source_timezone = agent_context.shared_context.get_field("user_timezone")
        zone = timezone.utc
        timezone_label = "unknown; UTC is used for the current clock"
        if isinstance(source_timezone, str) and source_timezone:
            try:
                zone = ZoneInfo(source_timezone)
                timezone_label = source_timezone
            except (ZoneInfoNotFoundError, ValueError):
                pass
        now = datetime.now(timezone.utc).astimezone(zone)
        # 维护时钟只解释「现在」；不能用它填补历史事件缺失的日期或时区。
        return (
            f"Current maintenance time: {now.strftime('%Y-%m-%d %H:%M:%S %Z')} (UTC offset {now.strftime('%z')}). "
            f"User timezone: {timezone_label}. Date historical events from their source messages, not this clock."
        )


__all__ = ["MemoryExtractionPromptProvider"]
