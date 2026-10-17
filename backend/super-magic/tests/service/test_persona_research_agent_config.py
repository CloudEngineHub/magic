from pathlib import Path

from agentlang.agent.define.parser import parse_agent_file
from app.core.entity.message.client_message import AgentMode
from app.core.models.agent_runtime import AgentProviderType, AgentTarget
from app.tools.core.tool_factory import tool_factory

AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"
SKILLS_DIR = AGENTS_DIR / "skills"


def _load_agent(agent_name: str):
    content = (AGENTS_DIR / f"{agent_name}.agent").read_text(encoding="utf-8")
    return parse_agent_file(content)


def test_persona_research_mode_routes_to_builtin_agent():
    assert AgentMode.PERSONA_RESEARCH.value == "persona_research"
    assert AgentMode.PERSONA_RESEARCH.get_agent_type() == "persona-research"
    assert AgentMode.resolve_agent_type("persona_research") == "persona-research"

    target = AgentTarget.from_mode("persona_research")
    assert target == AgentTarget(AgentProviderType.BUILTIN, "persona-research")


def test_persona_interviewer_resolves_by_name_as_builtin():
    """子 Agent 按 .agent 文件名调用，不需要新增 AgentMode。"""
    target = AgentTarget.from_name("persona-interviewer")
    assert target == AgentTarget(AgentProviderType.BUILTIN, "persona-interviewer")
    assert (AGENTS_DIR / f"{target.agent_name}.agent").is_file()


def test_persona_research_agent_definition():
    agent_define, prompt = _load_agent("persona-research")

    assert "persona_chat" in agent_define.tools_config
    assert "ask_user" in agent_define.tools_config
    assert agent_define.code_execution is True  # call_subagent 依赖 Code Mode
    system_skill_names = [entry.name for entry in agent_define.skills_config.system_skills]
    assert {"subagents", "persona-research", "deep-research"} <= set(system_skill_names)
    assert [entry.name for entry in agent_define.skills_config.preload] == ["persona-research"]
    assert "<!--zh" not in prompt


def test_persona_interviewer_agent_definition():
    agent_define, prompt = _load_agent("persona-interviewer")

    assert set(agent_define.tools_config) == {"list_dir", "read_files", "write_file", "persona_chat"}
    assert agent_define.code_execution is False
    assert agent_define.skills_config is None
    assert "persona_chat" in prompt
    assert "<!--zh" not in prompt


def test_persona_agents_reference_existing_tools_and_skills():
    for agent_name in ("persona-research", "persona-interviewer"):
        agent_define, _ = _load_agent(agent_name)
        missing_tools = [name for name in agent_define.tools_config if tool_factory.get_tool(name) is None]
        assert missing_tools == [], f"{agent_name} references unknown tools: {missing_tools}"
        if agent_define.skills_config is not None:
            for entry in agent_define.skills_config.system_skills:
                assert (SKILLS_DIR / entry.name / "SKILL.md").is_file(), entry.name


def test_persona_research_skill_references_exist():
    skill_dir = SKILLS_DIR / "persona-research"
    skill = (skill_dir / "SKILL.md").read_text(encoding="utf-8")

    assert skill.startswith("---\nname: persona-research\n")
    for relative_path in (
        "reference/file-contracts.md",
        "reference/methods.md",
        "reference/report-template.html",
    ):
        assert relative_path in skill
        assert (skill_dir / relative_path).is_file()
