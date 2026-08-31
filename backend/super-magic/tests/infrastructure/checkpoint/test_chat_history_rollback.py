"""聊天历史整目录快照的回滚方向语义测试。

运行期聊天历史在本地普通目录（.chat_history/），不在 magicfs 挂载内，
回滚时按 checkpoint 里的 initial/latest 整目录快照恢复：
- backward（undo）取 checkpoints_to_process[0] 的 initial 快照
- forward（redo）取 checkpoints_to_process[-1] 的 latest 快照
- 快照缺失（旧版本 checkpoint）时跳过且不触碰本地目录
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from app.infrastructure.checkpoint.rollback_executor import RollbackExecutor

HISTORY_FILE = "magic<agent-1>.json"


def _make_snapshot_dir(checkpoints_root: Path, checkpoint_id: str, kind: str, content: str) -> Path:
    snapshot_dir = checkpoints_root / checkpoint_id / kind
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    (snapshot_dir / HISTORY_FILE).write_text(content, encoding="utf-8")
    return snapshot_dir


def _write_live_file(chat_history_dir: Path, content: str) -> None:
    chat_history_dir.mkdir(parents=True, exist_ok=True)
    (chat_history_dir / HISTORY_FILE).write_text(content, encoding="utf-8")


def _patched_paths(checkpoints_root: Path, chat_history_dir: Path):
    return (
        patch(
            "app.path_manager.PathManager.get_checkpoint_dir",
            side_effect=lambda checkpoint_id: checkpoints_root / checkpoint_id,
        ),
        patch(
            "app.path_manager.PathManager.get_chat_history_dir",
            return_value=chat_history_dir,
        ),
    )


@pytest.mark.asyncio
async def test_backward_rollback_restores_initial_snapshot_of_first_checkpoint(tmp_path: Path):
    checkpoints_root = tmp_path / ".checkpoints"
    chat_history_dir = tmp_path / ".chat_history"

    _make_snapshot_dir(checkpoints_root, "c1", "initial_chat_history_snapshots", "after-turn-1")
    _make_snapshot_dir(checkpoints_root, "c2", "initial_chat_history_snapshots", "after-turn-2")
    _write_live_file(chat_history_dir, "current-stale")
    # 快照里不存在的多余文件应随恢复被清掉（破坏性替换语义）
    (chat_history_dir / "stale-extra.json").write_text("junk", encoding="utf-8")

    executor = RollbackExecutor()
    patches = _patched_paths(checkpoints_root, chat_history_dir)
    with patches[0], patches[1]:
        assert await executor._execute_chat_history_rollback("backward", ["c1", "c2"]) is True

    assert (chat_history_dir / HISTORY_FILE).read_text(encoding="utf-8") == "after-turn-1"
    assert not (chat_history_dir / "stale-extra.json").exists()


@pytest.mark.asyncio
async def test_forward_rollback_restores_latest_snapshot_of_last_checkpoint(tmp_path: Path):
    checkpoints_root = tmp_path / ".checkpoints"
    chat_history_dir = tmp_path / ".chat_history"

    _make_snapshot_dir(checkpoints_root, "c1", "latest_chat_history_snapshots", "turn-1-last-save")
    _make_snapshot_dir(checkpoints_root, "c2", "latest_chat_history_snapshots", "turn-2-last-save")
    _write_live_file(chat_history_dir, "rolled-back-state")

    executor = RollbackExecutor()
    patches = _patched_paths(checkpoints_root, chat_history_dir)
    with patches[0], patches[1]:
        assert await executor._execute_chat_history_rollback("forward", ["c1", "c2"]) is True

    assert (chat_history_dir / HISTORY_FILE).read_text(encoding="utf-8") == "turn-2-last-save"


@pytest.mark.asyncio
async def test_missing_snapshot_skips_restore_and_keeps_live_dir(tmp_path: Path):
    checkpoints_root = tmp_path / ".checkpoints"
    chat_history_dir = tmp_path / ".chat_history"
    _write_live_file(chat_history_dir, "current-stale")

    executor = RollbackExecutor()
    patches = _patched_paths(checkpoints_root, chat_history_dir)
    with patches[0], patches[1]:
        assert await executor._execute_chat_history_rollback("backward", ["c1"]) is True
        assert await executor._execute_chat_history_rollback("forward", ["c1"]) is True

    assert (chat_history_dir / HISTORY_FILE).read_text(encoding="utf-8") == "current-stale"


@pytest.mark.asyncio
async def test_direction_none_and_empty_range_skip_restore(tmp_path: Path):
    checkpoints_root = tmp_path / ".checkpoints"
    chat_history_dir = tmp_path / ".chat_history"
    _write_live_file(chat_history_dir, "current-state")

    executor = RollbackExecutor()
    patches = _patched_paths(checkpoints_root, chat_history_dir)
    with patches[0], patches[1]:
        assert await executor._execute_chat_history_rollback("none", ["c1"]) is True
        assert await executor._execute_chat_history_rollback("backward", []) is True
        assert await executor._execute_chat_history_rollback("forward", []) is True

    assert (chat_history_dir / HISTORY_FILE).read_text(encoding="utf-8") == "current-state"
