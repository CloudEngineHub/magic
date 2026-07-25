# -*- coding: utf-8 -*-
"""
Checkpoint相关的数据模型定义

这个模块定义了checkpoint功能所需的所有数据模型，包括：
- FileOperation: 文件操作类型枚举
- FileSnapshot: 文件快照信息
- CheckpointInfo: checkpoint元数据
- CheckpointManifest: checkpoint清单
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pathlib import Path
from pydantic import BaseModel, Field


class VirtualCheckpoint:
    """Checkpoint常量定义"""
    INITIAL = "__INITIAL__"  # 初始状态

class FileOperation(str, Enum):
    """文件操作类型枚举"""
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    RENAMED = "renamed"


class FileType(str, Enum):
    """文件类型枚举"""
    FILE = "file"           # 普通文件
    DIRECTORY = "directory" # 目录


class FileSnapshot(BaseModel):
    """文件快照信息模型

    file_id 是文件的稳定 Snowflake ID，是 on-disk 快照存储的主键
    （file_snapshots/<file_id>/）。与 file_path 不同，file_id 在
    rename 时保持不变，因此同一逻辑文件跨 rename 的所有快照
    共享同一个 snapshot_path 目录。

    file_path 是该条目记录时刻的路径（历史观测值，非主键）。
    对于 operation=renamed 的条目，file_path 是新路径，
    old_file_path 是 rename 前的旧路径；其他操作 old_file_path 为 None。
    """

    file_id: str = Field(..., description="文件稳定 ID（Snowflake），快照存储主键")
    file_path: str = Field(..., description="条目记录时刻的文件路径")
    old_file_path: Optional[str] = Field(None, description="rename 前的旧路径（仅 operation=renamed 时有值）")
    modified_time: datetime = Field(..., description="文件修改时间")
    operation: FileOperation = Field(..., description="文件操作类型")
    file_type: FileType = Field(..., description="文件类型（文件或目录）")
    snapshot_path: Optional[str] = Field(None, description="快照文件路径（删除操作时为None）")

    @staticmethod
    def detect_file_type(file_path: str) -> "FileType":
        """检测文件类型

        Args:
            file_path: 文件路径

        Returns:
            FileType: 文件类型
        """
        path = Path(file_path)
        if path.exists():
            return FileType.DIRECTORY if path.is_dir() else FileType.FILE
        else:
            # 文件不存在时，根据路径特征判断
            # 如果路径没有扩展名，认为是目录
            return FileType.DIRECTORY if not path.suffix else FileType.FILE

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ChatHistorySnapshot(BaseModel):
    """聊天历史快照信息模型"""

    file_path: str = Field(..., description="聊天历史目录路径")
    snapshot_path: str = Field(..., description="快照存储路径")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CheckpointInfo(BaseModel):
    """Checkpoint信息模型"""

    checkpoint_id: str = Field(..., description="Checkpoint ID (通常是message_id)")
    created_time: datetime = Field(..., description="创建时间")
    file_snapshots: List[FileSnapshot] = Field(default_factory=list, description="文件快照列表")
    chat_history_snapshot: Optional[ChatHistorySnapshot] = Field(None, description="聊天历史快照信息")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CheckpointManifest(BaseModel):
    """Checkpoint清单模型"""

    checkpoints: List[str] = Field(default_factory=list, description="checkpoint ID列表（按时间顺序）")
    current_checkpoint_id: Optional[str] = Field(None, description="当前所处的checkpoint ID")
    rollback_in_progress: bool = Field(
        False,
        description=(
            "是否正在执行回滚（反向或撤回回滚）。回滚期间 Python 会直接改写工作区，"
            "magicfs 看到 workspace 写入时应跳过 checkpoint 维护，"
            "否则会把正在恢复的内容当成新的用户改动回灌进 checkpoint"
        ),
    )
    created_time: datetime = Field(..., description="创建时间")
    updated_time: datetime = Field(..., description="更新时间")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
