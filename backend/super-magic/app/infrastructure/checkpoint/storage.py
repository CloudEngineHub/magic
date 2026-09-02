# -*- coding: utf-8 -*-
"""
Checkpoint底层存储操作

这个模块负责checkpoint的底层存储操作，包括：
- 创建和删除checkpoint目录结构
- 检查checkpoint是否存在
- 管理checkpoint相关的文件路径

目录契约（与 magicfs checkpoint hook 共享）：

    <checkpoints_dir>/checkpoint_manifest.json            共享清单
    <checkpoints_dir>/<id>/checkpoint_info.json           Python 簿记（id/created_time）
    <checkpoints_dir>/<id>/<space>/operations.json        magicfs 操作流水
    <checkpoints_dir>/<id>/<space>/file_snapshots/<fid>/  内容帧

`checkpoint_info.json` 与 `operations.json` 是两个所有物：前者只由
Python 写（创建时一次、之后只读），后者只由 magicfs 写。

聊天历史（运行期在本地 `.chat_history/`，不在 magicfs 挂载内，无帧
可记）由 Python 侧整目录快照补充：

    <checkpoints_dir>/<id>/initial_chat_history_snapshots/   checkpoint 创建时整目录快照
    <checkpoints_dir>/<id>/latest_chat_history_snapshots/    每次聊天记录保存时整目录快照

这两个目录同样只由 Python 写、随 checkpoint 目录懒创建（目录存在即
有快照），远端归档与按需拉取把它们当作 checkpoint 目录的普通内容。
"""

from pathlib import Path
from typing import Optional

from app.path_manager import PathManager
from app.utils.async_file_utils import async_mkdir, async_rmtree, async_exists, async_write_json
from agentlang.logger import get_logger

logger = get_logger(__name__)

# 当前协议中存在挂载分区的空间集合。magicfs 按空间的挂载配置把流水分别
# 落到各自子目录；Python 读数据时按此清单聚合。
KNOWN_SPACES = ("project", "topic")


class CheckpointStorage:
    """Checkpoint底层存储操作类"""

    def __init__(self):
        self.checkpoint_root = PathManager.get_checkpoints_dir()

    async def create_checkpoint_directory(self, checkpoint_id: str) -> str:
        """创建checkpoint目录结构

        只创建簿记文件所在的 checkpoint 根目录；各空间分区由 magicfs 在
        首次真实变更时懒创建，这里不预建空目录。
        """
        try:
            checkpoint_dir = PathManager.get_checkpoint_dir(checkpoint_id)
            await async_mkdir(checkpoint_dir, exist_ok=True)

            meta_file = self.get_checkpoint_info_file_path(checkpoint_id)
            if not await async_exists(meta_file):
                await async_write_json(
                    meta_file,
                    {"checkpoint_id": checkpoint_id},
                    ensure_ascii=False,
                    indent=2,
                )

            logger.info(f"创建checkpoint目录: {checkpoint_dir}")
            return str(checkpoint_dir)
        except Exception as e:
            logger.error(f"创建checkpoint目录失败 {checkpoint_id}: {e}")
            raise

    async def checkpoint_exists(self, checkpoint_id: str) -> bool:
        """检查checkpoint是否存在（以 Python 簿记文件为标记）"""
        try:
            return await async_exists(self.get_checkpoint_info_file_path(checkpoint_id))
        except Exception as e:
            logger.error(f"检查checkpoint存在性失败 {checkpoint_id}: {e}")
            return False

    async def delete_checkpoint_directory(self, checkpoint_id: str) -> bool:
        """删除checkpoint目录"""
        try:
            checkpoint_dir = PathManager.get_checkpoint_dir(checkpoint_id)
            if await async_exists(checkpoint_dir):
                await async_rmtree(checkpoint_dir)
                logger.info(f"删除checkpoint目录: {checkpoint_dir}")
            return True
        except Exception as e:
            logger.error(f"删除checkpoint目录失败 {checkpoint_id}: {e}")
            return False

    def get_checkpoint_info_file_path(self, checkpoint_id: str) -> Path:
        """获取 Python 簿记文件路径（<id>/checkpoint_info.json）"""
        checkpoint_dir = PathManager.get_checkpoint_dir(checkpoint_id)
        return checkpoint_dir / "checkpoint_info.json"

    def get_space_dir(self, checkpoint_id: str, space: str) -> Path:
        """获取某空间的分区目录（<id>/<space>）"""
        return PathManager.get_checkpoint_dir(checkpoint_id) / space

    def get_space_operations_file_path(self, checkpoint_id: str, space: str) -> Path:
        """获取 magicfs 写的空间操作流水路径（<id>/<space>/operations.json）"""
        return self.get_space_dir(checkpoint_id, space) / "operations.json"

    def get_checkpoint_manifest_file_path(self) -> Path:
        """获取checkpoint清单文件路径"""
        return self.checkpoint_root / "checkpoint_manifest.json"

    def get_initial_chat_history_snapshots_dir(self, checkpoint_id: str) -> Path:
        """获取 checkpoint 创建时保存的聊天历史整目录快照（undo 恢复源）"""
        return PathManager.get_checkpoint_dir(checkpoint_id) / "initial_chat_history_snapshots"

    def get_latest_chat_history_snapshots_dir(self, checkpoint_id: str) -> Path:
        """获取 checkpoint 内最后一次保存的聊天历史整目录快照（redo 恢复源）"""
        return PathManager.get_checkpoint_dir(checkpoint_id) / "latest_chat_history_snapshots"

    def get_space_initial_content_file_path(self, checkpoint_id: str, file_id: str, space: str) -> Path:
        """获取某空间内文件快照的初始内容帧路径"""
        return self.get_space_dir(checkpoint_id, space) / "file_snapshots" / file_id / "initial_content"

    def get_space_latest_content_file_path(self, checkpoint_id: str, file_id: str, space: str) -> Path:
        """获取某空间内文件快照的最新内容帧路径"""
        return self.get_space_dir(checkpoint_id, space) / "file_snapshots" / file_id / "latest_content"

    def get_initial_content_file_path(self, checkpoint_id: str, file_id: str, space: Optional[str] = None) -> Path:
        """获取文件快照的初始化内容文件路径

        Args:
            checkpoint_id: checkpoint ID
            file_id: 文件稳定 ID（Snowflake），快照目录以 file_id 为名
            space: 流水条目记录的空间；None 时按 project 解析
        """
        resolved_space = space if space else KNOWN_SPACES[0]
        return self.get_space_initial_content_file_path(checkpoint_id, file_id, resolved_space)

    def get_latest_content_file_path(self, checkpoint_id: str, file_id: str, space: Optional[str] = None) -> Path:
        """获取文件快照的最新内容文件路径

        Args:
            checkpoint_id: checkpoint ID
            file_id: 文件稳定 ID（Snowflake），快照目录以 file_id 为名
            space: 流水条目记录的空间；None 时按 project 解析
        """
        resolved_space = space if space else KNOWN_SPACES[0]
        return self.get_space_latest_content_file_path(checkpoint_id, file_id, resolved_space)

