"""将历史 Agent 定义归一化为当前运行时契约。"""

from collections.abc import Callable
from dataclasses import replace

from agentlang.agent.define import AgentDefine, SkillsConfig, SystemSkillEntry
from agentlang.logger import get_logger

from app.tools.core.tool_factory import tool_factory

logger = get_logger(__name__)

_LEGACY_CODE_MODE_TOOL_TO_SYSTEM_SKILL: dict[str, str] = {
    "download_from_urls": "download",
}

_AgentDefinitionRule = Callable[[str, AgentDefine], AgentDefine]


# 归一化规则


def _normalize_legacy_code_mode_tools(
    agent_name: str,
    agent_define: AgentDefine,
) -> AgentDefine:
    tools_config = dict(agent_define.tools_config)
    skills_config = agent_define.skills_config
    migrated_tools: list[str] = []
    target_skills: list[str] = []

    for tool_name, skill_name in _LEGACY_CODE_MODE_TOOL_TO_SYSTEM_SKILL.items():
        if tool_name not in tools_config:
            continue
        if not agent_define.code_execution:
            raise ValueError(
                f"Agent '{agent_name}' declares legacy tool '{tool_name}' while "
                "code_execution is disabled. Remove the legacy tool or enable code execution."
            )

        skills_config = _ensure_system_skill(
            agent_name=agent_name,
            skills_config=skills_config,
            legacy_tool_name=tool_name,
            skill_name=skill_name,
        )
        tools_config.pop(tool_name)
        migrated_tools.append(tool_name)
        target_skills.append(skill_name)

    if not migrated_tools:
        return agent_define

    logger.warning(
        f"Agent '{agent_name}' uses legacy Code Mode tools {sorted(migrated_tools)}; "
        f"mapped them to system Skills {sorted(target_skills)}"
    )
    return replace(
        agent_define,
        tools_config=tools_config,
        skills_config=skills_config,
    )


def _remove_explicit_auto_mount_tools(
    agent_name: str,
    agent_define: AgentDefine,
) -> AgentDefine:
    tools_config = dict(agent_define.tools_config)
    removed_tools: list[str] = []

    for tool_name in agent_define.tools_config:
        tool_info = tool_factory.get_tool(tool_name)
        if tool_info is None or tool_info.auto_mount is None:
            continue

        tools_config.pop(tool_name)
        removed_tools.append(tool_name)

    if not removed_tools:
        return agent_define

    logger.warning(
        f"Agent '{agent_name}' explicitly declares runtime-managed tools "
        f"{sorted(removed_tools)}; removed them from the canonical Agent definition"
    )
    return replace(agent_define, tools_config=tools_config)


_NORMALIZATION_RULES: tuple[_AgentDefinitionRule, ...] = (
    _normalize_legacy_code_mode_tools,
    _remove_explicit_auto_mount_tools,
)


# 统一入口


def normalize_agent_definition(
    agent_name: str,
    agent_define: AgentDefine,
) -> AgentDefine:
    """应用历史兼容规则，返回当前格式的 Agent 定义。"""
    normalized = agent_define
    for rule in _NORMALIZATION_RULES:
        normalized = rule(agent_name, normalized)
    return normalized


# 规则辅助函数


def _ensure_system_skill(
    agent_name: str,
    skills_config: SkillsConfig | None,
    legacy_tool_name: str,
    skill_name: str,
) -> SkillsConfig:
    if skills_config is None:
        return SkillsConfig(
            system_skills=[SystemSkillEntry(name=skill_name)],
        )

    if skill_name in skills_config.excluded_skills:
        raise ValueError(
            f"Agent '{agent_name}' declares legacy tool '{legacy_tool_name}' "
            f"but excludes required system Skill '{skill_name}'."
        )

    if skills_config.system_skills == "*":
        return skills_config

    system_skills = skills_config.system_skills
    if not isinstance(system_skills, list):
        raise ValueError(
            f"Agent '{agent_name}' has an unsupported system_skills configuration."
        )

    if any(entry.name == skill_name for entry in system_skills):
        return skills_config

    return replace(
        skills_config,
        system_skills=[
            *system_skills,
            SystemSkillEntry(name=skill_name),
        ],
    )
