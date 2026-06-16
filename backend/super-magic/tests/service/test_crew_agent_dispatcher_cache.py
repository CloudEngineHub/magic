import json

import pytest

from app.core.skill_utils.manager import GlobalSkillManager
from app.path_manager import PathManager
from app.service.agent_dispatcher import AgentDispatcher


class FakeAgentContext:
    def __init__(self):
        self.profile = None

    def set_agent_profile(self, profile):
        self.profile = profile


def _write_crew_files(crew_dir, identity_body="Initial identity."):
    crew_dir.mkdir(parents=True, exist_ok=True)
    (crew_dir / "IDENTITY.md").write_text(
        f"---\nname: Mock Crew\nrole: mock-role\n---\n{identity_body}\n",
        encoding="utf-8",
    )


def _write_template(template_path):
    template_path.write_text(
        "---\ntools: []\n---\n<identity>\nCREW_ROLE\n</identity>\nCREW_INSTRUCTIONS\nCREW_PERSONALITY\n",
        encoding="utf-8",
    )


def _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file):
    monkeypatch.setattr(
        PathManager,
        "get_crew_agent_dir",
        classmethod(lambda cls, agent_code: crew_dir),
    )
    monkeypatch.setattr(
        PathManager,
        "get_crew_identity_file",
        classmethod(lambda cls, agent_code: crew_dir / "IDENTITY.md"),
    )
    monkeypatch.setattr(
        PathManager,
        "get_crew_template_file",
        classmethod(lambda cls: template_path),
    )
    monkeypatch.setattr(
        PathManager,
        "get_compiled_agent_file",
        classmethod(lambda cls, agent_code: agent_file),
    )


def _dispatcher():
    dispatcher = object.__new__(AgentDispatcher)
    dispatcher.agents = {}
    dispatcher.agent_context = FakeAgentContext()
    return dispatcher


@pytest.mark.asyncio
async def test_prepare_crew_agent_reuses_fresh_compiled_cache(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    template_path = tmp_path / "crew.template.agent"
    agent_file = tmp_path / "agents" / "SMA-mock.agent"
    _write_crew_files(crew_dir)
    _write_template(template_path)
    _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file)
    reset_calls = []
    monkeypatch.setattr(
        GlobalSkillManager,
        "reset",
        classmethod(lambda cls: reset_calls.append("reset")),
    )
    dispatcher = _dispatcher()

    await dispatcher._prepare_crew_agent("SMA-mock")
    agent_file.write_text("cached compiled content\n", encoding="utf-8")
    cached_agent = object()
    dispatcher.agents["SMA-mock"] = cached_agent
    reset_calls.clear()

    await dispatcher._prepare_crew_agent("SMA-mock")

    assert agent_file.read_text(encoding="utf-8") == "cached compiled content\n"
    assert dispatcher.agents["SMA-mock"] is cached_agent
    assert reset_calls == []


@pytest.mark.asyncio
async def test_prepare_crew_agent_recompiles_stale_source_and_drops_cached_agent(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    template_path = tmp_path / "crew.template.agent"
    agent_file = tmp_path / "agents" / "SMA-mock.agent"
    manifest_file = tmp_path / "agents" / "SMA-mock.agent.manifest.json"
    _write_crew_files(crew_dir)
    _write_template(template_path)
    _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file)
    reset_calls = []
    monkeypatch.setattr(
        GlobalSkillManager,
        "reset",
        classmethod(lambda cls: reset_calls.append("reset")),
    )
    dispatcher = _dispatcher()

    await dispatcher._prepare_crew_agent("SMA-mock")
    first_manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    dispatcher.agents["SMA-mock"] = object()
    reset_calls.clear()
    _write_crew_files(crew_dir, identity_body="Changed identity with a longer body.")

    await dispatcher._prepare_crew_agent("SMA-mock")

    compiled = agent_file.read_text(encoding="utf-8")
    second_manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert "Changed identity with a longer body." in compiled
    assert "SMA-mock" not in dispatcher.agents
    assert reset_calls == ["reset"]
    assert first_manifest["fingerprint"] != second_manifest["fingerprint"]
