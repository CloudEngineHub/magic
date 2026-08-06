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


def test_design_agent_preloads_canvas_video_generation_rules():
    agent_define = _load_agent("design")

    assert agent_define.skills_config is not None
    canvas_designer = next(
        entry
        for entry in agent_define.skills_config.preload
        if entry.name == "canvas-designer"
    )
    assert canvas_designer.files == []


def test_canvas_designer_routes_video_requests_to_flexible_guidance():
    skill = (AGENTS_DIR / "skills" / "canvas-designer" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    skill_lower = skill.lower()

    assert "reference/video/generation.md" in skill
    assert "reuse `ask_user`" in skill
    assert "estimate points, seek confirmation, and generate" in skill_lower
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
        "clear, executable prompt",
        "reuse the existing `ask_user`",
        "original request",
        "risk-reduced adjustment",
        'action="estimate_points"',
        "final prompt, main generation parameters, and estimated points",
        "let the user choose whether to continue",
        'action="generate"',
        "does not deduct points",
        "avoid automatic retries",
    ]

    for rule in required_rules:
        assert rule in generation_rules

    assert "## Video Request Guidance" in generation_rules
    assert "## Mandatory Pre-Generation Flow" not in generation_rules
    assert "### 1." not in generation_rules
    assert "```xml" not in generation_rules

    guidance = generation_rules.split("## Video Request Guidance", 1)[1].split(
        "## Timeout", 1
    )[0]
    assert sum(line.startswith("- ") for line in guidance.splitlines()) <= 6


def test_canvas_video_risk_choices_allow_flexible_user_interaction():
    generation_rules = (
        AGENTS_DIR
        / "skills"
        / "canvas-designer"
        / "reference"
        / "video"
        / "generation.md"
    ).read_text(encoding="utf-8")

    risk_pos = generation_rules.index("copyright or IP")
    choice_pos = generation_rules.index("at least two")
    assert risk_pos < choice_pos
    risk_guidance = generation_rules[
        risk_pos : generation_rules.index("- When the request calls")
    ]
    risk_guidance_lower = risk_guidance.lower()
    assert "reuse the existing `ask_user` or another suitable interaction" in risk_guidance_lower
    assert "use your judgment" in risk_guidance_lower
    assert "original request" in generation_rules
    assert "risk-reduced adjustment" in generation_rules


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


def test_canvas_designer_main_skill_routes_video_through_estimation_first():
    skill = (AGENTS_DIR / "skills" / "canvas-designer" / "SKILL.md").read_text(
        encoding="utf-8"
    )

    assert 'generate_canvas_videos` with `action="estimate_points"`' in skill
    assert 'suitable confirmation' in skill
    assert "No → proceed with generation" not in skill
