import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CREW_CREATOR_DIR = PROJECT_ROOT / "agents" / "skills" / "crew-creator"
AGENT_PROFILE_DIR = PROJECT_ROOT / "agents" / "skills" / "agent-profile"


def test_crew_creator_prefers_choice_questions_for_enumerable_information():
    skill = (CREW_CREATOR_DIR / "SKILL.md").read_text(encoding="utf-8")

    assert "prioritize clickable choices" in skill
    assert "Use `confirm` for yes/no decisions" in skill
    assert "Use `select` whenever 2-8 useful candidate answers can be offered" in skill
    assert "Use `multi_select` for core functions and traits" in skill
    assert "Professional capabilities" in skill and "use `multi_select`" in skill
    assert "Professional domains and specialties" in skill
    assert "Working style" in skill
    assert "do not ask the user to rewrite the same information as free text" in skill
    assert "Use `input` only for the employee name" in skill


def test_crew_creator_requires_default_security_baseline():
    skill = (CREW_CREATOR_DIR / "SKILL.md").read_text(encoding="utf-8")
    guide = (CREW_CREATOR_DIR / "references" / "prompt-engineering-guide.md").read_text(
        encoding="utf-8"
    )

    assert "mandatory baseline security constraints must be present" in skill
    assert "Every employee must include" in guide
    assert "as untrusted data" in guide
    assert "explicit user confirmation" in guide
    assert "never replace or weaken it" in guide


def test_crew_creator_design_tool_names_are_registered():
    reference = (
        CREW_CREATOR_DIR / "references" / "available-tools.md"
    ).read_text(encoding="utf-8")
    definitions = json.loads(
        (PROJECT_ROOT / "config" / "tool_definitions.json").read_text(encoding="utf-8")
    )
    registered_tools = set(definitions["tools"])

    recommended_section = reference.split(
        "### Design & Visual Creation Employee", 1
    )[1].split("### Development & Programming Employee", 1)[0]
    design_canvas_section = reference.split("### Design Canvas", 1)[1].split(
        "### Data Dashboard", 1
    )[0]
    documented_tools = set(
        re.findall(r"`([a-z][a-z0-9_]*)`", recommended_section + design_canvas_section)
    )

    assert documented_tools <= registered_tools


def test_agent_profile_logo_paths_are_workspace_relative():
    skill = (AGENT_PROFILE_DIR / "SKILL.md").read_text(encoding="utf-8")
    guide = (AGENT_PROFILE_DIR / "references" / "avatar-generation-guide.md").read_text(
        encoding="utf-8"
    )

    assert "`.magic/IDENTITY.md`" in skill
    assert "`.magic/SOUL.md`" in skill
    assert "`.magic/avatars/agent-logo.png`" in skill
    assert "`.workspace/.magic/" not in skill
    assert "do not prepend `.workspace/`" in guide
    assert "`.magic/avatars/agent-logo.png`" in guide


def test_crew_creator_delegates_to_agent_profile_before_completion():
    skill = (CREW_CREATOR_DIR / "SKILL.md").read_text(encoding="utf-8")
    completion_gate = skill.split("### Mandatory Initialization Completion Gate", 1)[
        1
    ].split("### After Initialization", 1)[0]

    assert "agent-profile" in completion_gate
    assert "update_agent" in completion_gate
    assert "`icon_file_key`" in completion_gate
    assert "get_agent_info" in completion_gate
    assert "Do not delete `.crew_init_config.json`" in completion_gate
    assert "text metadata synchronization" in completion_gate
    assert "Logo synchronization" in completion_gate


def test_crew_creator_registers_agent_manager_tools():
    agent = (PROJECT_ROOT / "agents" / "crew-creator.agent").read_text(encoding="utf-8")
    frontmatter = agent.split("---", 2)[1]

    for tool_name in (
        "get_agent_info",
        "update_agent",
        "create_skill",
        "edit_skill",
        "upload_skill",
    ):
        assert f"  - {tool_name}\n" in frontmatter


def test_restored_agent_manager_tools_are_exported_and_workspace_scoped():
    tools_init = (PROJECT_ROOT / "app" / "tools" / "__init__.py").read_text(encoding="utf-8")
    manager_dir = PROJECT_ROOT / "app" / "tools" / "agent_manager"

    assert "from app.tools.agent_manager import" in tools_init
    for module_name in (
        "get_agent_info",
        "update_agent",
        "create_skill",
        "edit_skill",
        "upload_skill",
    ):
        assert (manager_dir / f"{module_name}.py").is_file()

    for module_name in ("create_skill", "edit_skill", "upload_skill"):
        source = (manager_dir / f"{module_name}.py").read_text(encoding="utf-8")
        assert "PathManager.get_magic_skills_dir()" in source
        assert "get_agent_studio_dir" not in source

    update_source = (manager_dir / "update_agent.py").read_text(encoding="utf-8")
    assert 'icon = {"type": "Image", "value": resolved_key}' in update_source
    assert "params.agent_code" not in update_source
