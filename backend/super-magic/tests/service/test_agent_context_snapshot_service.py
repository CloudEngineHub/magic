from types import SimpleNamespace

import pytest

from agentlang.chat_history.chat_history import ChatHistory, ChatHistoryForkData
from app.core.horizon.models import HorizonState
from app.core.models.agent_runtime import AgentProviderType, AgentTarget
from app.core.models.agent_session import AgentSessionRef
from app.service.agent_context_snapshot_service import (
    AgentContextSnapshot,
    AgentContextSnapshotMaterializeError,
    AgentContextSnapshotService,
)
from app.utils.async_file_utils import (
    async_read_json,
    async_read_text,
    async_scandir,
    async_write_text,
)


def _session(agent_id: str, directory) -> AgentSessionRef:
    return AgentSessionRef(
        target=AgentTarget(AgentProviderType.CLAW, "openclaw"),
        agent_id=agent_id,
        chat_history_dir=directory,
    )


def _snapshot(source: AgentSessionRef) -> AgentContextSnapshot:
    return AgentContextSnapshot(
        source=source,
        chat_history=ChatHistoryForkData(
            messages=(),
            session_document={
                "version": 1,
                "last": {"model_id": "old-model"},
                "current": {"model_id": "current-model"},
            },
        ),
        horizon_state=HorizonState(agent_id=source.agent_id, memory="parent memory"),
    )


@pytest.mark.asyncio
async def test_snapshot_materialize_writes_chat_session_and_horizon(tmp_path):
    source = _session("parent", tmp_path)
    target = _session("child", tmp_path)

    await AgentContextSnapshotService().materialize(_snapshot(source), target)

    history_path = ChatHistory.history_path_for_session("openclaw", "child", tmp_path)
    session_path = ChatHistory.session_path_for_session("openclaw", "child", tmp_path)
    horizon_path = tmp_path / "openclaw<child>.horizon.json"
    assert await async_read_json(history_path) == []
    assert (await async_read_json(session_path))["current"]["model_id"] == "current-model"
    horizon_document = await async_read_json(horizon_path)
    assert horizon_document["agent_id"] == "child"
    assert horizon_document["memory"] == "parent memory"


@pytest.mark.asyncio
async def test_snapshot_materialize_restores_all_targets_after_partial_commit(
    tmp_path,
    monkeypatch,
):
    source = _session("parent", tmp_path)
    target = _session("child", tmp_path)
    history_path = ChatHistory.history_path_for_session("openclaw", "child", tmp_path)
    session_path = ChatHistory.session_path_for_session("openclaw", "child", tmp_path)
    horizon_path = tmp_path / "openclaw<child>.horizon.json"
    old_files = {
        history_path: "old history",
        session_path: "old session",
        horizon_path: "old horizon",
    }
    for path, content in old_files.items():
        await async_write_text(path, content)

    from app.service import agent_context_snapshot_service as snapshot_module

    original_rename = snapshot_module.async_rename
    failed = False

    async def fail_during_session_commit(source_path, target_path):
        nonlocal failed
        if (
            not failed
            and target_path == session_path
            and source_path.name.endswith(".tmp")
        ):
            failed = True
            raise OSError("simulated session commit failure")
        await original_rename(source_path, target_path)

    monkeypatch.setattr(snapshot_module, "async_rename", fail_during_session_commit)

    with pytest.raises(AgentContextSnapshotMaterializeError):
        await AgentContextSnapshotService().materialize(_snapshot(source), target)

    for path, content in old_files.items():
        assert await async_read_text(path) == content
    assert all(not entry.name.endswith((".tmp", ".bak")) for entry in await async_scandir(tmp_path))


@pytest.mark.asyncio
async def test_persisted_session_reference_prefers_matching_live_context(tmp_path, monkeypatch):
    service = AgentContextSnapshotService()
    source = _session("parent", tmp_path)
    live_context = SimpleNamespace()
    expected = _snapshot(source)
    persisted_called = False

    monkeypatch.setattr(service, "_find_live_context", lambda _source: live_context)

    async def capture_live(context):
        assert context is live_context
        return expected

    async def capture_persisted(_source):
        nonlocal persisted_called
        persisted_called = True
        return expected

    monkeypatch.setattr(service, "_capture_live", capture_live)
    monkeypatch.setattr(service, "_capture_persisted", capture_persisted)

    assert await service.capture(source) is expected
    assert not persisted_called
