# -*- coding: utf-8 -*-
"""变更附件候选路径选择器的过滤规则测试。

覆盖核心回归点：聚合流水中 topic 空间的条目（聊天历史等内部状态）
不得进入用户可见的变更附件列表；工作区空间（project / user）条目
（含以 "." 开头的隐藏目录下的持久文件，如用户空间记忆文件）进入变更
附件候选。
"""

from datetime import datetime

from app.core.entity.checkpoint import (
    TOPIC_SPACE,
    USER_SPACE,
    FileOperation,
    FileSnapshot,
    FileType,
)
from app.infrastructure.checkpoint.attachment_candidates import (
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


def test_created_kept_and_deleted_renamed_dirs_filtered():
    """既有规则不回归：created 保留、deleted/renamed/目录剔除。"""
    snapshots = [
        _snap("1", "created.txt", FileOperation.CREATED),
        _snap("2", "deleted.txt", FileOperation.DELETED),
        _snap("3", "renamed-target.txt", FileOperation.RENAMED),
        _snap("4", "docs/readme.md"),
    ]

    assert select_changed_attachment_paths(snapshots) == ["created.txt", "docs/readme.md"]


def test_hidden_path_files_are_user_visible():
    """回归（生产案例）：以 "." 开头的目录里的持久文件不得被过滤。

    用户空间的记忆文件位于 .magic/ 下，曾因隐藏路径过滤被整条剔除，
    导致变更附件缺失、magic-service 文件版本停在 v1。
    """
    snapshots = [
        _snap("1", "/mnt/agfs/magicfs/user/.magic/memory/global/MEMORY.md",
              FileOperation.CREATED, space=USER_SPACE),
        _snap("2", "/mnt/agfs/magicfs/user/.venv/lib.py", space=USER_SPACE),
        _snap("3", "/mnt/agfs/magicfs/project/.magic/skills/README.md",
              space="project"),
    ]

    assert select_changed_attachment_paths(snapshots) == [
        "/mnt/agfs/magicfs/user/.magic/memory/global/MEMORY.md",
        "/mnt/agfs/magicfs/user/.venv/lib.py",
        "/mnt/agfs/magicfs/project/.magic/skills/README.md",
    ]


def test_user_space_entries_enter_user_visible_changes():
    """user 空间与项目空间同为工作区空间：变更进入用户可见附件候选。"""
    snapshots = [
        _snap("1", "/mnt/agfs/magicfs/project/report.md", space="project"),
        _snap("2", "/mnt/agfs/magicfs/user/notes.txt", space=USER_SPACE),
        _snap("4", "/mnt/agfs/magicfs/user/gone.txt", FileOperation.DELETED,
              space=USER_SPACE),
    ]

    assert select_changed_attachment_paths(snapshots) == [
        "/mnt/agfs/magicfs/project/report.md",
        "/mnt/agfs/magicfs/user/notes.txt",
    ]


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
