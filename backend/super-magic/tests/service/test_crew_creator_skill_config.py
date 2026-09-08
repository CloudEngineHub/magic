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