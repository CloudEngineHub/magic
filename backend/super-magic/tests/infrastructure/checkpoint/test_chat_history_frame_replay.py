# -*- coding: utf-8 -*-
"""聊天历史/工作区帧重放测试（绝对路径 + space 标记协议）。

magicfs checkpoint hook 把每个挂载的变更记录为
file_snapshots/<file_id>/{initial_content,latest_content} 内容帧和
checkpoint_info.json 操作流水；file_path 是 agent 可见绝对路径（网关为
每个挂载下发 path_prefix），space 字段标记来源空间。本测试在临时目录
构造真实帧布局，验证 RollbackExecutor 按 operation 语义和 space 策略
正确重放。
"""

import json
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.entity.checkpoint import FileOperation, FileSnapshot, FileType
from app.infrastructure.checkpoint.rollback_executor import RollbackExecutor, TOPIC_SPACE
from app.path_manager import PathManager


PROJECT_ROOT_PREFIX = "/mnt/agfs/magicfs/project"
TOPIC_ROOT_PREFIX = "/mnt/agfs/magicfs/topic"


def _make_snapshot(
    file_id: str,
    file_path: str,
    operation: FileOperation,
    *,
    old_file_path: str | None = None,
    file_type: FileType = FileType.FILE,
    space: str = "project",
) -> FileSnapshot:
    return FileSnapshot(
        file_id=file_id,
        file_path=file_path,
        old_file_path=old_file_path,
        modified_time=datetime(2026, 1, 1, 12, 0, 0),
        operation=operation,
        file_type=file_type,
        snapshot_path=f"file_snapshots/{file_id}",
        space=space,
    )


class FrameWorld:
    """在一个临时目录里模拟 magicfs 帧布局。恢复目标按绝对路径落盘，
    通过 monkeypatch 把挂载前缀映射进临时目录。"""

    def __init__(self, tmp_path: Path):
        self.checkpoints_root = tmp_path / "checkpoints"
        self.project_root = tmp_path / "mounts" / "project"
        self.topic_root = tmp_path / "mounts" / "topic"
        self.infos: dict[str, list[FileSnapshot]] = {}

    def add_frames(self, checkpoint_id: str, snapshots: list[FileSnapshot]) -> None:
        """登记一个 checkpoint 的操作流水（内容帧由用例自行写入）。"""
        self.infos[checkpoint_id] = list(snapshots)

    def write_frame(self, checkpoint_id: str, file_id: str, initial: bytes | None = None,
                    latest: bytes | None = None, space: str | None = None) -> None:
        """按分区布局写内容帧：<checkpoint_id>/<space>/file_snapshots/<fid>/。

        space 缺省时从该 file_id 已登记的流水条目推导。"""
        if space is None:
            for snapshot in self.infos.get(checkpoint_id, []):
                if snapshot.file_id == file_id:
                    space = snapshot.space or "project"
                    break
            else:
                space = "project"
        frame_dir = self.checkpoints_root / checkpoint_id / space / "file_snapshots" / file_id
        frame_dir.mkdir(parents=True, exist_ok=True)
        if initial is not None:
            (frame_dir / "initial_content").write_bytes(initial)
        if latest is not None:
            (frame_dir / "latest_content").write_bytes(latest)

    def build_executor(self, direction: str, checkpoint_ids: list[str]) -> RollbackExecutor:
        all_checkpoint_ids = list(self.infos) + [c for c in checkpoint_ids if c not in self.infos]
        # 与真实 storage 口径一致：空/None 的 space 回落到 project 分区
        def _partition(space: str | None) -> str:
            return space or "project"

        storage = SimpleNamespace(
            get_initial_content_file_path=lambda cid, fid, space=None: (
                self.checkpoints_root / cid / _partition(space) / "file_snapshots" / fid / "initial_content"
            ),
            get_latest_content_file_path=lambda cid, fid, space=None: (
                self.checkpoints_root / cid / _partition(space) / "file_snapshots" / fid / "latest_content"
            ),
        )
        metadata_manager = SimpleNamespace(
            get_checkpoints_between_in_checkpoint_manifest=AsyncMock(return_value=(direction, checkpoint_ids)),
            load_checkpoint_info=AsyncMock(side_effect=lambda cid: SimpleNamespace(file_snapshots=self.infos.get(cid, []))),
            load_checkpoint_manifest=AsyncMock(return_value=SimpleNamespace(checkpoints=all_checkpoint_ids)),
            get_current_checkpoint=AsyncMock(return_value="C2"),
            update_current_checkpoint=AsyncMock(return_value=True),
        )
        executor = RollbackExecutor.__new__(RollbackExecutor)
        executor.storage = storage
        executor.metadata_manager = metadata_manager
        return executor

    def mount_file(self, prefix: str, rel: str) -> Path:
        return (self.project_root if prefix == PROJECT_ROOT_PREFIX else self.topic_root) / rel


@pytest.fixture
def world(tmp_path, monkeypatch):
    """构建 FrameWorld 并把 agent 可见挂载前缀解析进临时目录。"""
    w = FrameWorld(tmp_path)

    real_resolve = RollbackExecutor._resolve_restore_path

    def fake_resolve(self, file_path: str) -> Path:
        p = Path(file_path)
        # 把协议前缀映射到临时目录，等价于沙箱内的真实布局
        if p.is_absolute() and str(p).startswith("/mnt/agfs/magicfs/"):
            parts = p.relative_to("/mnt/agfs/magicfs").parts
            base = w.project_root if parts[0] == "project" else w.topic_root
            return base.joinpath(*parts[1:])
        return real_resolve(self, file_path)

    monkeypatch.setattr(RollbackExecutor, "_resolve_restore_path", fake_resolve)
    return w


async def test_topic_backward_replays_initial_frames(world: FrameWorld):
    """反向回滚把聊天历史文件恢复到本回合开始前的 initial 帧，落在 topic 前缀绝对路径上。"""
    main_path = f"{TOPIC_ROOT_PREFIX}/chat_history/main<1>.json"
    created_path = f"{TOPIC_ROOT_PREFIX}/chat_history/report.md"

    world.add_frames("C1", [])  # 回滚目标也要在清单里
    world.add_frames("C2", [
        _make_snapshot("111", main_path, FileOperation.UPDATED, space=TOPIC_SPACE),
        _make_snapshot("222", created_path, FileOperation.CREATED, space=TOPIC_SPACE),
    ])
    world.write_frame("C2", "111", initial=b"old history", latest=b"new history")
    world.write_frame("C2", "222", initial=None, latest=b"brand new")

    # 工作区现状：updated 已变新、created 已出现
    world.mount_file(TOPIC_ROOT_PREFIX, "chat_history").mkdir(parents=True, exist_ok=True)
    world.mount_file(TOPIC_ROOT_PREFIX, "chat_history/main<1>.json").write_bytes(b"new history")
    world.mount_file(TOPIC_ROOT_PREFIX, "chat_history/report.md").write_bytes(b"brand new")

    executor = world.build_executor("backward", ["C2"])
    success, _ = await executor.start_rollback("C1")
    assert success is True

    assert world.mount_file(TOPIC_ROOT_PREFIX, "chat_history/main<1>.json").read_bytes() == b"old history"
    assert not world.mount_file(TOPIC_ROOT_PREFIX, "chat_history/report.md").exists()


async def test_topic_forward_replays_latest_frames(world: FrameWorld):
    """正向回滚（撤回回滚）应用 latest 帧到 topic 绝对路径。"""
    main_path = f"{TOPIC_ROOT_PREFIX}/chat_history/main<1>.json"
    world.add_frames("C1", [])  # 回滚目标也要在清单里
    world.add_frames("C2", [
        _make_snapshot("111", main_path, FileOperation.UPDATED, space=TOPIC_SPACE),
    ])
    world.write_frame("C2", "111", initial=b"old", latest=b"new")
    # current=C2 正向重放到 target 时，被 updated 的文件处于已消失状态也无妨，
    # 但真实场景中 UPDATED 重放要求路径可写；预先落一个旧字节模拟现状
    world.mount_file(TOPIC_ROOT_PREFIX, "chat_history").mkdir(parents=True, exist_ok=True)
    live = world.mount_file(TOPIC_ROOT_PREFIX, "chat_history/main<1>.json")
    live.write_bytes(b"rolled-back-old")

    executor = world.build_executor("forward", ["C2"])
    success, _ = await executor.start_rollback("C1")
    assert success is True
    assert live.read_bytes() == b"new"


async def test_workspace_rollback_ignores_topic_entries(world: FrameWorld):
    """工作区重放只处理非 topic 条目；topic 条目不落进 workspace。"""
    project_file = f"{PROJECT_ROOT_PREFIX}/a.txt"
    world.add_frames("C1", [])
    world.add_frames("C2", [
        _make_snapshot("1001", f"{TOPIC_ROOT_PREFIX}/chat_history/main<1>.json",
                       FileOperation.UPDATED, space=TOPIC_SPACE),
        _make_snapshot("3333", project_file, FileOperation.UPDATED, space="project"),
    ])
    world.write_frame("C2", "1001", initial=b"old main", latest=b"new main")
    world.write_frame("C2", "3333", initial=b"old a", latest=b"new a")

    executor = world.build_executor("backward", ["C2"])
    success, affected_files = await executor.start_rollback("C1")

    assert success is True
    assert world.mount_file(PROJECT_ROOT_PREFIX, "a.txt").read_bytes() == b"old a"
    # 工作区不得出现 topic 条目的任何内容
    assert not world.mount_file(PROJECT_ROOT_PREFIX, "chat_history").exists()
    # affected_files 依赖真实 magicfs xattr（本地临时目录没有），只断言
    # 有内容时绝不包含 topic 路径
    assert all("topic" not in f["file_path"] for f in affected_files)


async def test_same_operation_semantics_apply_to_topic_frames(world: FrameWorld):
    """topic 条目与工作区条目走同一套 operation 感知分支（deleted 反向写回）。"""
    deleted_path = f"{TOPIC_ROOT_PREFIX}/chat_history/gone.json"
    world.add_frames("C1", [])  # 回滚目标也要在清单里
    world.add_frames("C2", [
        _make_snapshot("777", deleted_path, FileOperation.DELETED, space=TOPIC_SPACE),
    ])
    world.write_frame("C2", "777", initial=b"precious")

    executor = world.build_executor("backward", ["C2"])
    success, _ = await executor.start_rollback("C1")
    assert success is True
    assert world.mount_file(TOPIC_ROOT_PREFIX, "chat_history/gone.json").read_bytes() == b"precious"


async def test_missing_topic_frames_skips_gracefully(world: FrameWorld):
    """旧版本沙箱创建的 checkpoint 没有 topic 帧，应跳过并视为成功。"""
    world.add_frames("C1", [])  # 回滚目标也要在清单里
    world.add_frames("C2", [])
    executor = world.build_executor("backward", ["C2"])
    success, _ = await executor.start_rollback("C1")
    assert success is True


async def test_relative_path_entry_resolves_to_workspace(world: FrameWorld, monkeypatch, tmp_path):
    """相对路径条目（space 为空串）按 project 分区解析帧、按 workspace 根解析恢复目标。"""
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr(PathManager, "get_workspace_dir", classmethod(lambda cls: workspace_root), raising=True)

    world.add_frames("C1", [])  # 回滚目标也要在清单里
    world.add_frames("C2", [
        _make_snapshot("5555", "legacy.txt", FileOperation.UPDATED, space=""),
    ])
    world.write_frame("C2", "5555", initial=b"legacy old", latest=b"legacy new", space="project")

    executor = world.build_executor("backward", ["C2"])
    success, _ = await executor.start_rollback("C1")
    assert success is True
    assert (workspace_root / "legacy.txt").read_bytes() == b"legacy old"


def test_checkpoint_listener_no_longer_snapshots_chat_history():
    """回归：监听器不再注册 CHAT_HISTORY_CHANGED，全量快照链路已下线。

    该模块所在包的 __init__ 会拉起重依赖（wecom SDK 等），本地单测环境
    无法直接 import；因此对源码做静态断言。
    """
    source = (
        Path(__file__).resolve().parents[3]
        / "app/service/agent_event/checkpoint_listener_service.py"
    ).read_text(encoding="utf-8")

    assert "CHAT_HISTORY_CHANGED" not in source
    assert "ChatHistorySnapshotManager" not in source
    assert "_save_initial_chat_history_snapshot" not in source
    assert "BEFORE_MAIN_AGENT_RUN" in source
