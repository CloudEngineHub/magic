# -*- coding: utf-8 -*-
"""变更附件候选路径选择器的过滤规则测试。

覆盖核心回归点：聚合流水中 topic 空间的条目（聊天历史等内部状态）
不得进入用户可见的变更附件列表；项目空间的既有过滤规则不回归。
"""

from datetime import datetime

from app.core.entity.checkpoint import TOPIC_SPACE, FileOperation, FileSnapshot, FileType
from app.infrastructure.checkpoint.attachment_candidates import (
    is_hidden_checkpoint_path,
    select_changed_attachment_paths,
)


def _snap(
    file_id: str,
    file_path: str,
    operation: FileOperation = FileOperation.UPDATED,
    *,
    space: str = "project",
    file_type: FileType = FileType.FILE,
) -> FileSnapshot:
    return FileSnapshot(
        file_id=file_id,
        file_path=file_path,
        modified_time=datetime(2026, 8, 27, 12, 0, 0),
        operation=operation,
        file_type=file_type,
        snapshot_path=f"cp/file_snapshots/{file_id}",
        space=space,
    )


def test_topic_entries_never_become_user_visible_changes():
    """核心回归：topic 空间条目（聊天历史）不得出现在变更附件候选里。"""
    snapshots = [
        _snap("1", "/mnt/agfs/magicfs/project/report.md", space="project"),
        # 聊天历史文件：本轮被频繁保存，但属于内部状态
        _snap("2", "/mnt/agfs/magicfs/topic/chat_history/magic<main>.json",
              space=TOPIC_SPACE),
        _snap("3", "/mnt/agfs/magicfs/topic/chat_history/magic<main>.horizon.json",
              space=TOPIC_SPACE),
    ]

    assert select_changed_attachment_paths(snapshots) == [
        "/mnt/agfs/magicfs/project/report.md",
    ]


def test_project_rules_keep_deeleted_and_hidden_filtered():
    """既有规则不回归：created 保留、deleted/renamed/目录/隐藏路径剔除。"""
    snapshots = [
        _snap("1", "created.txt", FileOperation.CREATED),
        _snap("2", "deleted.txt", FileOperation.DELETED),
        _snap("3", "renamed-target.txt", FileOperation.RENAMED),
        _snap("4", ".cache/junk.bin"),
        _snap("5", "docs/readme.md"),
    ]

    assert select_changed_attachment_paths(snapshots) == ["created.txt", "docs/readme.md"]


def test_renamed_then_updated_keeps_target():
    """rename 后同 file_id 出现 UPDATED 时，新路径仍进列表（按 path 去重）。"""
    snapshots = [
        _snap("9", "final.txt", FileOperation.RENAMED),
        _snap("9", "final.txt", FileOperation.UPDATED),
    ]

    assert select_changed_attachment_paths(snapshots) == ["final.txt"]


def test_directory_entries_skipped_regardless_of_space():
    snapshots = [
        _snap("7", "/mnt/agfs/magicfs/project/notes", FileOperation.CREATED,
              space="project", file_type=FileType.DIRECTORY),
        _snap("8", "/mnt/agfs/magicfs/topic/subagents/x<1>", FileOperation.CREATED,
              space=TOPIC_SPACE, file_type=FileType.DIRECTORY),
    ]

    assert select_changed_attachment_paths(snapshots) == []


def test_is_hidden_checkpoint_path_segment_semantics():
    assert is_hidden_checkpoint_path(".tmp/a.txt") is True
    assert is_hidden_checkpoint_path("a/.hidden") is True
    assert is_hidden_checkpoint_path("a.txt") is False
    assert is_hidden_checkpoint_path("..") is True
