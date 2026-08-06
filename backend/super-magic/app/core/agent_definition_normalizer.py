"""将历史 Agent 定义归一化为当前运行时契约。"""

from collections.abc import Callable
from dataclasses import replace

from agentlang.agent.define import AgentDefine, SkillsConfig, SystemSkillEntry
from agentlang.logger import get_logger

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
    migrated_tools: dict[str, str] = {}
    ignored_tools: dict[str, str] = {}

    for tool_name, skill_name in _LEGACY_CODE_MODE_TOOL_TO_SYSTEM_SKILL.items():
        if tool_name not in tools_config:
            continue
        if not agent_define.code_execution:
            tools_config.pop(tool_name)
            ignored_tools[tool_name] = "代码执行已关闭，无法迁移到 Skill + Code Mode"
            continue
        if skills_config and skill_name in skills_config.excluded_skills:
            tools_config.pop(tool_name)
            ignored_tools[tool_name] = f"迁移所需的 system Skill '{skill_name}' 已被排除"
            continue
        if (
            skills_config
            and skills_config.system_skills != "*"
            and not isinstance(skills_config.system_skills, list)
        ):
            tools_config.pop(tool_name)
            ignored_tools[tool_name] = "system_skills 配置格式不支持自动迁移"
            continue

        skills_config = _ensure_system_skill(
            skills_config=skills_config,
            skill_name=skill_name,
        )
        tools_config.pop(tool_name)
        migrated_tools[tool_name] = skill_name

    if not migrated_tools and not ignored_tools:
        return agent_define

    if migrated_tools:
        logger.info(
            f"用户 Agent '{agent_name}' 已迁移历史工具声明: {migrated_tools}"
        )
    if ignored_tools:
        logger.warning(
            f"用户 Agent '{agent_name}' 的历史工具声明无法安全迁移，"
            f"已忽略这些工具并继续初始化: {ignored_tools}"
        )
    return replace(
        agent_define,
        tools_config=tools_config,
        skills_config=skills_config,
    )


_NORMALIZATION_RULES: tuple[_AgentDefinitionRule, ...] = (
    _normalize_legacy_code_mode_tools,
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
    skills_config: SkillsConfig | None,
    skill_name: str,
) -> SkillsConfig:
    if skills_config is None:
        return SkillsConfig(
            system_skills=[SystemSkillEntry(name=skill_name)],
        )

    if skills_config.system_skills == "*":
        return skills_config

    system_skills = skills_config.system_skills
    if not isinstance(system_skills, list):
        return skills_config

    if any(entry.name == skill_name for entry in system_skills):
        return skills_config

    return replace(
        skills_config,
        system_skills=[
            *system_skills,
            SystemSkillEntry(name=skill_name),
        ],
    )
