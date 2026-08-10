import asyncio
import json

import pytest

from app.path_manager import PathManager
from app.service.crew_agent_runtime_service import CrewAgentRuntimeService
from app.service.crew_downloader import CrewPackageInvalidError


def _write_crew_files(crew_dir, identity_body="Initial identity."):
    crew_dir.mkdir(parents=True, exist_ok=True)
    (crew_dir / "IDENTITY.md").write_text(
        f"---\nname: Mock Crew\nrole: mock-role\ndescription: mock description\n---\n{identity_body}\n",
        encoding="utf-8",
    )


def _write_template(template_path):
    template_path.write_text(
        "---\nllm: main_llm\ntools: []\n---\n<identity>\nCREW_ROLE\n</identity>\nCREW_INSTRUCTIONS\nCREW_PERSONALITY\n",
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


@pytest.mark.asyncio
async def test_crew_agent_runtime_service_compiles_and_returns_profile(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    template_path = tmp_path / "crew.template.agent"
    agent_file = tmp_path / "agents" / "SMA-mock.agent"
    _write_crew_files(crew_dir)
    _write_template(template_path)
    _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file)
    invalidations = []

    info = await CrewAgentRuntimeService(
        on_cache_invalidated=lambda code, reason: invalidations.append((code, reason)),
    ).ensure_compiled("SMA-mock")

    assert info.agent_code == "SMA-mock"
    assert info.agent_file == agent_file
    assert info.name == "Mock Crew"
    assert info.role == "mock-role"
    assert info.description == "mock description"
    assert info.compiled is True
    assert agent_file.exists()
    assert invalidations == [("SMA-mock", "compiled_cache_missing")]


@pytest.mark.asyncio
async def test_crew_agent_runtime_service_recompiles_stale_source(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    template_path = tmp_path / "crew.template.agent"
    agent_file = tmp_path / "agents" / "SMA-mock.agent"
    manifest_file = tmp_path / "agents" / "SMA-mock.agent.manifest.json"
    _write_crew_files(crew_dir)
    _write_template(template_path)
    _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file)
    invalidations = []
    service = CrewAgentRuntimeService(
        on_cache_invalidated=lambda code, reason: invalidations.append((code, reason)),
    )

    await service.ensure_compiled("SMA-mock")
    first_manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    invalidations.clear()
    _write_crew_files(crew_dir, identity_body="Changed identity with a longer body.")

    info = await service.ensure_compiled("SMA-mock")

    compiled = agent_file.read_text(encoding="utf-8")
    second_manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert info.compiled is True
    assert "Changed identity with a longer body." in compiled
    assert invalidations == [("SMA-mock", "source_changed")]
    assert first_manifest["fingerprint"] != second_manifest["fingerprint"]


@pytest.mark.asyncio
async def test_crew_agent_runtime_service_classifies_compile_failure_as_invalid_package(
    monkeypatch,
    tmp_path,
):
    crew_dir = tmp_path / "crew"
    template_path = tmp_path / "crew.template.agent"
    agent_file = tmp_path / "agents" / "SMA-mock.agent"
    _write_crew_files(crew_dir)
    _write_template(template_path)
    _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file)
    service = CrewAgentRuntimeService(on_cache_invalidated=lambda code, reason: None)

    async def _fail_compile(agent_code, source_dir):
        raise ValueError("invalid YAML in /private/path/IDENTITY.md")

    monkeypatch.setattr(service._compiler, "compile", _fail_compile)

    with pytest.raises(CrewPackageInvalidError):
        await service.ensure_compiled("SMA-mock")


@pytest.mark.asyncio
async def test_crew_agent_runtime_service_propagates_cancellation(monkeypatch, tmp_path):
    crew_dir = tmp_path / "crew"
    template_path = tmp_path / "crew.template.agent"
    agent_file = tmp_path / "agents" / "SMA-mock.agent"
    _write_crew_files(crew_dir)
    _write_template(template_path)
    _patch_crew_paths(monkeypatch, crew_dir, template_path, agent_file)
    service = CrewAgentRuntimeService(on_cache_invalidated=lambda code, reason: None)

    async def _cancel_compile(agent_code, source_dir):
        raise asyncio.CancelledError

    monkeypatch.setattr(service._compiler, "compile", _cancel_compile)

    with pytest.raises(asyncio.CancelledError):
        await service.ensure_compiled("SMA-mock")
