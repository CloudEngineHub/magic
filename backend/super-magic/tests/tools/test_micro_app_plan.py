from pathlib import Path

from agentlang.agent.define.parser import parse_agent_file

from app.tools.micro_app_plan import MicroAppPlanTool


AGENT_FILE = Path(__file__).resolve().parents[2] / "agents" / "micro-app.agent"
MAGICBASE_SKILL_FILE = Path(__file__).resolve().parents[2] / "agents" / "skills" / "magicbase" / "SKILL.md"


def test_micro_app_plan_uses_domain_specific_tool_name():
    tool = MicroAppPlanTool()

    assert MicroAppPlanTool.__module__ == "app.tools.micro_app_plan"
    assert tool.name == "micro_app_plan"
    assert tool.to_param()["function"]["name"] == "micro_app_plan"
    assert "call micro_app_plan again" in tool.get_prompt_hint()


def test_micro_app_agent_mounts_domain_specific_plan_tool():
    agent_content = AGENT_FILE.read_text(encoding="utf-8")
    agent_define = parse_agent_file(agent_content)[0]

    assert "micro_app_plan" in agent_define.tools_config
    assert "plan" not in agent_define.tools_config


def test_micro_app_contract_docs_do_not_reference_legacy_plan_tool():
    for contract_file in (AGENT_FILE, MAGICBASE_SKILL_FILE):
        content = contract_file.read_text(encoding="utf-8")

        assert "`micro_app_plan`" in content
        assert "`plan`" not in content
