from pathlib import Path


CREW_CREATOR_DIR = (
    Path(__file__).resolve().parents[2] / "agents" / "skills" / "crew-creator"
)


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


def test_crew_creator_chinese_guidance_matches_choice_question_policy():
    skill = (CREW_CREATOR_DIR / "SKILL_cn.md").read_text(encoding="utf-8")

    assert "优先让用户点击选择" in skill
    assert "是/否决策使用 `confirm`" in skill
    assert "能给出 2-8 个合理候选答案时使用 `select`" in skill
    assert "核心功能与特点、专业能力、专业领域/特长、工作风格、沟通风格使用 `multi_select`" in skill
    assert "禁止再用 `input` 要求用户手写描述" in skill
    assert "禁止再要求用户详细手写相同内容" in skill
    assert "`input` 仅用于员工名称" in skill