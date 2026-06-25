import json

import pytest

from app.path_manager import PathManager
from app.service.crew_agent_cache_manager import CrewAgentCacheManager


@pytest.mark.asyncio
async def test_crew_agent_cache_manifest_tracks_source_changes(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    crew_dir.mkdir()
    (crew_dir / "IDENTITY.md").write_text("---\nname: Mock\n---\nbody\n", encoding="utf-8")
    agent_file = tmp_path / "agents" / "SMA-mock.agent"

    monkeypatch.setattr(
        PathManager,
        "get_compiled_agent_file",
        classmethod(lambda cls, agent_code: agent_file),
    )

    manager = CrewAgentCacheManager()
    await manager.write_manifest("SMA-mock", crew_dir)

    fresh = await manager.evaluate_cache("SMA-mock", crew_dir)
    assert fresh.stale is False
    assert fresh.reason == "fresh"

    (crew_dir / "IDENTITY.md").write_text("---\nname: Mock\n---\nchanged body\n", encoding="utf-8")
    changed = await manager.evaluate_cache("SMA-mock", crew_dir)
    assert changed.stale is True
    assert changed.reason in {"source_changed", "source_file_count_changed"}

    await manager.write_manifest("SMA-mock", crew_dir)
    (crew_dir / "AGENTS.md").write_text("rules\n", encoding="utf-8")
    added = await manager.evaluate_cache("SMA-mock", crew_dir)
    assert added.stale is True

    await manager.write_manifest("SMA-mock", crew_dir)
    (crew_dir / "AGENTS.md").unlink()
    removed = await manager.evaluate_cache("SMA-mock", crew_dir)
    assert removed.stale is True


@pytest.mark.asyncio
async def test_crew_agent_cache_follows_symlinked_crew_root(monkeypatch, tmp_path):
    source_dir = tmp_path / "source-crew"
    source_dir.mkdir()
    (source_dir / "IDENTITY.md").write_text("---\nname: Linked\n---\nbody\n", encoding="utf-8")
    linked_dir = tmp_path / "agents" / "crews" / "SMA-linked"
    linked_dir.parent.mkdir(parents=True)
    linked_dir.symlink_to(source_dir, target_is_directory=True)
    agent_file = tmp_path / "agents" / "SMA-linked.agent"

    monkeypatch.setattr(
        PathManager,
        "get_compiled_agent_file",
        classmethod(lambda cls, agent_code: agent_file),
    )

    manager = CrewAgentCacheManager()
    await manager.write_manifest("SMA-linked", linked_dir)
    (source_dir / "IDENTITY.md").write_text("---\nname: Linked\n---\nchanged\n", encoding="utf-8")

    state = await manager.evaluate_cache("SMA-linked", linked_dir)
    assert state.stale is True


@pytest.mark.asyncio
async def test_crew_agent_cache_follows_nested_skill_symlink(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    skill_source = tmp_path / "repo-skills" / "weather-query"
    crew_skill_link = crew_dir / "skills" / "weather-query"
    crew_skill_link.parent.mkdir(parents=True)
    skill_source.mkdir(parents=True)
    (crew_dir / "IDENTITY.md").write_text("---\nname: Mock\n---\nbody\n", encoding="utf-8")
    (skill_source / "SKILL.md").write_text("---\nname: weather-query\n---\nbody\n", encoding="utf-8")
    crew_skill_link.symlink_to(skill_source, target_is_directory=True)
    agent_file = tmp_path / "agents" / "SMA-mock.agent"

    monkeypatch.setattr(
        PathManager,
        "get_compiled_agent_file",
        classmethod(lambda cls, agent_code: agent_file),
    )

    manager = CrewAgentCacheManager()
    await manager.write_manifest("SMA-mock", crew_dir)
    (skill_source / "SKILL.md").write_text("---\nname: weather-query\n---\nchanged\n", encoding="utf-8")

    state = await manager.evaluate_cache("SMA-mock", crew_dir)
    assert state.stale is True


@pytest.mark.asyncio
async def test_crew_agent_cache_writes_manifest_payload(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    crew_dir.mkdir()
    (crew_dir / "IDENTITY.md").write_text("---\nname: Mock\n---\nbody\n", encoding="utf-8")
    agent_file = tmp_path / "agents" / "SMA-mock.agent"

    monkeypatch.setattr(
        PathManager,
        "get_compiled_agent_file",
        classmethod(lambda cls, agent_code: agent_file),
    )

    manager = CrewAgentCacheManager()
    await manager.write_manifest("SMA-mock", crew_dir)
    manifest = json.loads(manager.manifest_file("SMA-mock").read_text(encoding="utf-8"))

    assert manifest["agent_code"] == "SMA-mock"
    assert manifest["version"] == CrewAgentCacheManager.MANIFEST_VERSION
    assert manifest["file_count"] == 1
    assert manifest["fingerprint"]
    assert manifest["compiled_at"]
