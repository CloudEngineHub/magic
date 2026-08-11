import re
from pathlib import Path

import pytest

from agentlang.agent.define.parser import parse_agent_file


AGENTS_DIR = Path(__file__).resolve().parents[2] / "agents"


def _load_agent(agent_name: str):
    content = (AGENTS_DIR / f"{agent_name}.agent").read_text(encoding="utf-8")
    return parse_agent_file(content)[0]


@pytest.mark.parametrize(
    ("agent_name", "absent_tools"),
    [
        ("design", {"generate_videos_to_canvas", "generate_canvas_videos"}),
    ],
)
def test_video_tools_not_directly_mounted(agent_name, absent_tools):
    """Video tools should not be directly mounted on agents; they go through skills or code mode."""
    agent_define = _load_agent(agent_name)
    tool_names = set(agent_define.tools_config.keys())
    for tool_name in absent_tools:
        assert tool_name not in tool_names


def test_design_agent_uses_canvas_designer_for_video():
    """Video capability remains associated with the canvas-designer skill."""
    agent_define = _load_agent("design")

    assert agent_define.skills_config is not None
    preload_names = [e.name for e in agent_define.skills_config.preload]
    assert "canvas-designer" in preload_names


def test_design_agent_preloads_canvas_designer_without_explicit_files():
    agent_source = (AGENTS_DIR / "design.agent").read_text(encoding="utf-8")
    preload_section = agent_source.split("  preload:", 1)[1].split(
        "  system_skills:", 1
    )[0]

    assert "- name: canvas-designer" in preload_section
    assert "files:" not in preload_section
    assert "SKILL.md" not in preload_section
    assert "reference/video/generation.md" not in preload_section


def test_canvas_designer_routes_video_requests_to_flexible_guidance():
    skill = (AGENTS_DIR / "skills" / "canvas-designer" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    assert "reference/video/generation.md" in skill
    assert "**Mandatory context loading:**" in skill
    assert "your first tool call must directly read `reference/video/generation.md` using the file-reading capability" in skill
    assert "do not call `list_dir`, `shell_exec`, `run_sdk_snippet`, or any canvas tool first" in skill
    assert "Do not answer or draft a prompt until that reference has been read" in skill
    assert "read the complete file from `/app/agents/skills/canvas-designer/reference/video/generation.md` starting at line 1" in skill
    assert "Do not pass an offset, start line, or line range" in skill
    assert "all video-specific tools, parameters, and interaction rules are defined in that reference." in skill
    assert "generate_canvas_videos" not in skill
    assert "estimate_points" not in skill
    assert "ask_user" not in skill
    assert "Mandatory Video Entry Gate" not in skill
    assert "Do not call any other tool first" not in skill
    assert "stop that turn" not in skill


def test_canvas_video_generation_guidance_preserves_business_principles():
    generation_rules = (
        AGENTS_DIR
        / "skills"
        / "canvas-designer"
        / "reference"
        / "video"
        / "generation.md"
    ).read_text(encoding="utf-8")

    required_rules = [
        "Use only `generate_canvas_videos`",
        "executable prompts",
        "original request",
        "risk-reduced alternative",
        'action="estimate_points"',
        "final prompt, main parameters, and estimated points",
        "offer continuing or revising",
        'action="generate"',
        "does not deduct points",
        "do not retry automatically",
    ]

    for rule in required_rules:
        assert rule in generation_rules

    assert "do not substitute another video tool" in generation_rules

    assert "## Video Request Guidance" in generation_rules
    assert 'Confirmation is a hard gate for the first video generation attempt' in generation_rules
    assert 'regardless of whether you first prepare a canvas, images, or other reference materials' in generation_rules
    assert 'never call `action="generate"` in that same turn' in generation_rules
    assert 'only after a later user confirmation' in generation_rules
    assert "## Mandatory Pre-Generation Flow" not in generation_rules
    assert "### 1." not in generation_rules
    assert "```xml" not in generation_rules

    guidance = generation_rules.split("## Video Request Guidance", 1)[1].split(
        "## Timeout", 1
    )[0]
    assert sum(line.startswith("- ") for line in guidance.splitlines()) <= 6


def test_canvas_video_risk_choices_use_ask_user_when_outcome_changes():
    generation_rules = (
        AGENTS_DIR
        / "skills"
        / "canvas-designer"
        / "reference"
        / "video"
        / "generation.md"
    ).read_text(encoding="utf-8")

    risk_pos = generation_rules.index("IP, real-person")
    choice_pos = generation_rules.index("at least two")
    assert risk_pos < choice_pos
    risk_guidance = generation_rules[risk_pos : generation_rules.index("- If estimation or generation fails")]
    risk_guidance_lower = risk_guidance.lower()
    assert "multiple viable directions" in risk_guidance_lower
    assert "choice would change the final result" in risk_guidance_lower
    assert "must directly call `ask_user`" in risk_guidance_lower
    assert "do not list choices only in ordinary text" in risk_guidance_lower
    assert "wait for the user's selection" in risk_guidance_lower
    assert "prefer a `select` question with at least two choices" in risk_guidance_lower
    assert "let the user decide" in risk_guidance_lower
    assert "original request" in generation_rules
    assert "risk-reduced alternative" in generation_rules


def test_canvas_video_generation_examples_are_estimation_only():
    generation_rules = (
        AGENTS_DIR
        / "skills"
        / "canvas-designer"
        / "reference"
        / "video"
        / "generation.md"
    ).read_text(encoding="utf-8")

    python_examples = re.findall(r"```python\n(.*?)```", generation_rules, flags=re.DOTALL)

    assert python_examples
    for example in python_examples:
        assert '"action": "estimate_points"' in example
        assert '"action": "generate"' not in example


def test_canvas_designer_main_skill_routes_video_to_reference_guidance():
    skill = (AGENTS_DIR / "skills" / "canvas-designer" / "SKILL.md").read_text(
        encoding="utf-8"
    )

    assert "reference/video/generation.md" in skill
    assert "your first tool call must directly read `reference/video/generation.md` using the file-reading capability" in skill
    assert "all video-specific tools, parameters, and interaction rules are defined in that reference." in skill
    assert "generate_canvas_videos" not in skill
    assert "estimate_points" not in skill
    assert "ask_user" not in skill
    assert "video tools" not in skill.lower()
    assert "#video-generation" not in skill.lower()
    assert "## video generation" not in skill.lower()
    assert "No → proceed with generation" not in skill


def test_canvas_designer_skill_keeps_video_rules_out_of_main_skill():
    skill = (AGENTS_DIR / "skills" / "canvas-designer" / "SKILL.md").read_text(
        encoding="utf-8"
    )

    video_implementation_details = (
        "generate_canvas_videos",
        "estimate_points",
        "action=\"generate\"",
        "预计积分",
    )
    for detail in video_implementation_details:
        assert detail not in skill


def test_canvas_designer_skill_guides_on_demand_video_reference_loading():
    skill = (AGENTS_DIR / "skills" / "canvas-designer" / "SKILL.md").read_text(
        encoding="utf-8"
    )

    assert "your first tool call must directly read `reference/video/generation.md` using the file-reading capability" in skill
    assert "reference/video/generation.md" in skill
