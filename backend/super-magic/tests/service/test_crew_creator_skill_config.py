import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CREW_CREATOR_DIR = PROJECT_ROOT / "agents" / "skills" / "crew-creator"


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


def test_crew_creator_logo_paths_are_workspace_relative():
    skill = (CREW_CREATOR_DIR / "SKILL.md").read_text(encoding="utf-8")
    guide = (CREW_CREATOR_DIR / "references" / "avatar-generation-guide.md").read_text(
        encoding="utf-8"
    )
    logo_section = skill.split("### Generating the Default Logo", 1)[1].split(
        "### Synchronizing the Agent Profile", 1
    )[0]

    assert "`.magic/IDENTITY.md`" in logo_section
    assert "`.magic/SOUL.md`" in logo_section
    assert "`.magic/avatars/agent-logo.png`" in logo_section
    assert "`.workspace/.magic/" not in logo_section
    assert "| `.magic/avatars/agent-logo.png` |" in skill
    assert "do not prepend `.workspace/`" in guide
    assert "`.magic/avatars/agent-logo.png`" in guide
