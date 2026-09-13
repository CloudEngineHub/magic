import importlib

import pytest

from agentlang.context.tool_context import ToolContext
from app.tools.read_skills import ReadSkills, ReadSkillsParams

read_skills_module = importlib.import_module("app.tools.read_skills")

_BOUND_PROJECT_ID = "4001"
_SKILL_NAME = "inventory_manager"
_SKILL_BODY = "Count low-stock products in the referenced project."


class MockSkill:
    def __init__(self, name: str):
        self.name = name
        self.content = f"# {name}\n\nMock skill content."
        self.skill_file = None
        self.skill_dir = None


def _write_skill(root, skill_name: str, body: str) -> None:
    skill_dir = root / skill_name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        f"---\nname: {skill_name}\ndescription: Companion skill\n---\n\n{body}\n",
        encoding="utf-8",
    )


def _mount_referenced_project(tmp_path, monkeypatch, project_id: str, skill_name: str, body: str):
    mount_base = tmp_path / "referenced-projects"
    skills_root = mount_base / project_id / ".magic" / "skills"
    _write_skill(skills_root, skill_name, body)
    monkeypatch.setenv("AGENT_REFERENCED_PROJECT_MOUNT_BASE_PATH", str(mount_base))
    return mount_base


def _bind_micro_app_scope(monkeypatch, project_id: str) -> None:
    monkeypatch.setattr(
        "app.service.mention.utils.micro_app_prompt.get_micro_app_project_scopes",
        lambda: {"app-1": {"project_id": project_id, "app_name": "Stock App"}},
    )


def test_read_skills_params_accepts_single_skill_name_string():
    params = ReadSkillsParams(skill_names="mock-skill-a")

    assert params.skill_names == ["mock-skill-a"]


def test_read_skills_params_accepts_comma_separated_skill_names():
    params = ReadSkillsParams(skill_names="mock-skill-a, mock-skill-b")

    assert params.skill_names == ["mock-skill-a", "mock-skill-b"]


def test_read_skills_params_rejects_empty_skill_name_string():
    with pytest.raises(Exception):
        ReadSkillsParams(skill_names="")


@pytest.mark.asyncio
async def test_read_skills_executes_with_single_skill_name_string(monkeypatch):
    async def mock_find_skill(skill_name: str, **kwargs):
        return MockSkill(skill_name)

    monkeypatch.setattr(read_skills_module, "find_skill", mock_find_skill)

    tool = ReadSkills()
    result = await tool.execute(
        ToolContext(tool_name="read_skills", arguments={"skill_names": "mock-skill-a"}),
        ReadSkillsParams(skill_names="mock-skill-a", check_updates=False),
    )

    assert result.ok
    assert result.extra_info["skill_names"] == ["mock-skill-a"]
    assert '<skill_content name="mock-skill-a">' in result.content


def test_read_skills_params_accept_optional_project_id():
    params = ReadSkillsParams(
        skill_names=["inventory_manager"],
        project_id=_BOUND_PROJECT_ID,
        check_updates=False,
    )

    assert params.project_id == _BOUND_PROJECT_ID


@pytest.mark.asyncio
async def test_read_skills_rejects_unbound_project_id(tmp_path, monkeypatch):
    _mount_referenced_project(tmp_path, monkeypatch, _BOUND_PROJECT_ID, _SKILL_NAME, _SKILL_BODY)
    _bind_micro_app_scope(monkeypatch, _BOUND_PROJECT_ID)

    called = {"find_skill": False}

    async def mock_find_skill(skill_name: str, **kwargs):
        called["find_skill"] = True
        return MockSkill(skill_name)

    monkeypatch.setattr(read_skills_module, "find_skill", mock_find_skill)

    result = await ReadSkills().execute(
        ToolContext(tool_name="read_skills", arguments={}),
        ReadSkillsParams(
            skill_names=[_SKILL_NAME],
            project_id="9999",
            check_updates=False,
        ),
    )

    assert result.ok is False or result.extra_info.get("failure_count", 0) >= 1
    assert "9999" in result.content
    assert "bound" in result.content.lower() or "mounted" in result.content.lower()
    assert _SKILL_BODY not in result.content
    assert called["find_skill"] is False


@pytest.mark.asyncio
async def test_read_skills_reads_bound_referenced_project_skill(tmp_path, monkeypatch):
    _mount_referenced_project(tmp_path, monkeypatch, _BOUND_PROJECT_ID, _SKILL_NAME, _SKILL_BODY)
    _bind_micro_app_scope(monkeypatch, _BOUND_PROJECT_ID)

    async def mock_find_skill(skill_name: str, **kwargs):
        raise AssertionError("must not fall back to workspace or system skills")

    monkeypatch.setattr(read_skills_module, "find_skill", mock_find_skill)

    result = await ReadSkills().execute(
        ToolContext(tool_name="read_skills", arguments={}),
        ReadSkillsParams(
            skill_names=[_SKILL_NAME],
            project_id=_BOUND_PROJECT_ID,
            check_updates=True,
        ),
    )

    assert result.ok
    assert result.extra_info["success_count"] == 1
    assert result.extra_info["failure_count"] == 0
    assert f'<skill_content name="{_SKILL_NAME}">' in result.content
    assert _SKILL_BODY in result.content
    assert str(tmp_path / "referenced-projects" / _BOUND_PROJECT_ID) in result.content


@pytest.mark.asyncio
async def test_read_skills_does_not_fallback_to_workspace_same_named_skill(
    tmp_path, monkeypatch
):
    mount_base = tmp_path / "referenced-projects"
    (mount_base / _BOUND_PROJECT_ID / ".magic" / "skills").mkdir(parents=True)
    monkeypatch.setenv("AGENT_REFERENCED_PROJECT_MOUNT_BASE_PATH", str(mount_base))
    _bind_micro_app_scope(monkeypatch, _BOUND_PROJECT_ID)

    async def mock_find_skill(skill_name: str, **kwargs):
        return MockSkill("workspace-" + skill_name)

    monkeypatch.setattr(read_skills_module, "find_skill", mock_find_skill)

    result = await ReadSkills().execute(
        ToolContext(tool_name="read_skills", arguments={}),
        ReadSkillsParams(
            skill_names=[_SKILL_NAME],
            project_id=_BOUND_PROJECT_ID,
            check_updates=False,
        ),
    )

    assert "workspace-" not in result.content
    assert "Mock skill content" not in result.content
    assert _SKILL_NAME in result.content
    assert result.extra_info["failure_count"] == 1
    assert result.extra_info["success_count"] == 0
