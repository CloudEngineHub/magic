import importlib

import pytest

from agentlang.context.tool_context import ToolContext
from app.tools.read_skills import ReadSkills, ReadSkillsParams

read_skills_module = importlib.import_module("app.tools.read_skills")


class MockSkill:
    def __init__(self, name: str):
        self.name = name
        self.content = f"# {name}\n\nMock skill content."
        self.skill_file = None
        self.skill_dir = None


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
    async def mock_find_skill(skill_name: str, *, agent_name=None):
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


@pytest.mark.asyncio
async def test_read_skills_loads_after_lazy_install(monkeypatch):
    from unittest.mock import AsyncMock
    from app.core.skill_utils import skill_references
    find = AsyncMock(side_effect=[None, None, MockSkill('lazy-skill')])
    monkeypatch.setattr(read_skills_module, 'find_skill', find)
    monkeypatch.setattr(read_skills_module.asyncio, 'sleep', AsyncMock())
    install = AsyncMock(return_value=True)
    monkeypatch.setattr(skill_references, 'install_market_reference', install)
    result = await ReadSkills().execute(None, ReadSkillsParams(skill_names=['lazy-skill'], check_updates=False))
    assert result.ok
    assert '<skill_content name="lazy-skill">' in result.content
    install.assert_awaited_once()
    assert find.await_count == 3


@pytest.mark.asyncio
async def test_read_skills_reports_declared_fetch_failure(monkeypatch):
    from unittest.mock import AsyncMock
    from app.core.skill_utils import skill_references
    monkeypatch.setattr(read_skills_module, 'find_skill', AsyncMock(return_value=None))
    monkeypatch.setattr(read_skills_module.asyncio, 'sleep', AsyncMock())
    monkeypatch.setattr(skill_references, 'install_market_reference', AsyncMock(side_effect=RuntimeError('internal URL must not leak')))
    result = await ReadSkills().execute(None, ReadSkillsParams(skill_names=['private-skill'], check_updates=False))
    assert not result.ok
    assert 'declared but could not be fetched' in result.content
    assert 'internal URL' not in result.content
