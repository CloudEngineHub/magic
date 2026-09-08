from pathlib import Path


CREW_CREATOR_DIR = (
    Path(__file__).resolve().parents[2] / "agents" / "skills" / "crew-creator"
)


def test_crew_creator_prefers_choice_questions_for_enumerable_information():
    skill = (CREW_CREATOR_DIR / "SKILL.md").read_text(encoding="utf-8")

    assert "prioritize clickable choices" in skill
    assert "Use `confirm` for yes/no decisions" in skill
    assert "Use `select` whenever 2-8 useful candidate answers can be offered" in skill
    assert "derive 3-6 concrete options" in skill
    assert "Use `input` only" in skill


def test_crew_creator_chinese_guidance_matches_choice_question_policy():
    skill = (CREW_CREATOR_DIR / "SKILL_cn.md").read_text(encoding="utf-8")

    assert "优先让用户点击选择" in skill
    assert "是/否决策使用 `confirm`" in skill
    assert "能给出 2-8 个合理候选答案时使用 `select`" in skill
    assert "生成 3-6 个具体候选项" in skill
    assert "才使用 `input`" in skill