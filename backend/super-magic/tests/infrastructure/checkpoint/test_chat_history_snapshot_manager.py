from pathlib import Path
from unittest.mock import patch

import pytest

from app.infrastructure.checkpoint.chat_history_snapshot_manager import ChatHistorySnapshotManager


@pytest.mark.asyncio
async def test_create_latest_chat_history_snapshot_skips_llm_request(tmp_path: Path):
    chat_history_dir = tmp_path / ".chat_history"
    chat_history_dir.mkdir()
    (chat_history_dir / "history.json").write_text("{}", encoding="utf-8")

    llm_request_dir = chat_history_dir / "llm_request"
    llm_request_dir.mkdir()
    (llm_request_dir / "debug.log").write_text("debug", encoding="utf-8")

    snapshot_dir = tmp_path / "checkpoint" / "latest_chat_history_snapshots"
    manager = ChatHistorySnapshotManager()

    assert await manager.create_latest_chat_history_snapshot(
        snapshot_dir,
        agent_name="mock-agent",
        agent_id="mock-agent-id",
        chat_history_dir=chat_history_dir,
    ) is True

    assert (snapshot_dir / "history.json").exists()
    assert not (snapshot_dir / "llm_request").exists()


@pytest.mark.asyncio
async def test_restore_from_latest_chat_history_skips_llm_request(tmp_path: Path):
    snapshot_dir = tmp_path / "checkpoint" / "latest_chat_history_snapshots"
    snapshot_dir.mkdir(parents=True)
    (snapshot_dir / "history.json").write_text("{}", encoding="utf-8")

    legacy_llm_request_dir = snapshot_dir / "llm_request"
    legacy_llm_request_dir.mkdir()
    (legacy_llm_request_dir / "legacy.log").write_text("legacy", encoding="utf-8")

    chat_history_dir = tmp_path / ".chat_history"
    existing_llm_request_dir = chat_history_dir / "llm_request"
    existing_llm_request_dir.mkdir(parents=True)
    (existing_llm_request_dir / "current.log").write_text("current", encoding="utf-8")

    manager = ChatHistorySnapshotManager()

    with patch("app.path_manager.PathManager.get_chat_history_dir", return_value=chat_history_dir):
        assert await manager.restore_from_latest_chat_history(snapshot_dir) is True

    assert (chat_history_dir / "history.json").exists()
    assert not (chat_history_dir / "llm_request").exists()
