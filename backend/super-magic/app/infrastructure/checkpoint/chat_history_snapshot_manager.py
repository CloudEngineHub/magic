# -*- coding: utf-8 -*-
"""聊天记录目录快照与恢复。

目录边界：

    .chat_history/  = 话题的持久状态，需要 checkpoint 和归档
    .runtime/       = 可重新生成的运行数据，不需要 checkpoint，不进入归档
    .workspace/     = 用户文件，由现有文件 checkpoint 机制单独处理
    .checkpoints/   = checkpoint 自身，不能复制进自己

因此 checkpoint 复制整个 ``.chat_history/``，包括 ``compacted/``、
``subagents/`` 和根目录辅助 JSON；``.runtime/`` 不在快照源目录内，
不会被复制，也不会在恢复时被删除。
"""

from pathlib import Path
from agentlang.llms.utils.debug_logger import LLM_REQUEST_LOG_DIR_NAME
from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.utils.async_file_utils import (
    async_copy2,
    async_copytree,
    async_exists,
    async_mkdir,
    async_rmtree,
    async_scandir,
)

logger = get_logger(__name__)


def _should_skip_chat_history_entry(entry_name: str) -> bool:
    """判断是否应跳过历史遗留的 LLM 调试日志目录。"""
    return entry_name == LLM_REQUEST_LOG_DIR_NAME


class ChatHistorySnapshotManager:
    """按话题目录保存和恢复完整聊天记录持久状态。"""

    async def create_initial_chat_history_snapshot(
        self,
        snapshot_dir: Path,
        *,
        agent_name: str,
        agent_id: str,
        chat_history_dir: Path,
    ) -> bool:
        return await self._create_snapshot(
            snapshot_dir,
            chat_history_dir=chat_history_dir,
            label=f"初始（owner={agent_name}<{agent_id}>）",
        )

    async def create_latest_chat_history_snapshot(
        self,
        snapshot_dir: Path,
        *,
        agent_name: str,
        agent_id: str,
        chat_history_dir: Path,
    ) -> bool:
        return await self._create_snapshot(
            snapshot_dir,
            chat_history_dir=chat_history_dir,
            label=f"最新（owner={agent_name}<{agent_id}>）",
        )

    async def restore_from_initial_chat_history(self, snapshot_dir: Path) -> bool:
        return await self._restore_snapshot(snapshot_dir, label="初始")

    async def restore_from_latest_chat_history(self, snapshot_dir: Path) -> bool:
        return await self._restore_snapshot(snapshot_dir, label="最新")

    async def _create_snapshot(
        self,
        snapshot_dir: Path,
        *,
        chat_history_dir: Path,
        label: str,
    ) -> bool:
        try:
            if not await async_exists(chat_history_dir):
                logger.info("聊天记录目录不存在，跳过%s快照", label)
                return True

            if await async_exists(snapshot_dir):
                await async_rmtree(snapshot_dir)
            await async_mkdir(snapshot_dir, parents=True, exist_ok=True)

            for entry in await async_scandir(chat_history_dir):
                if _should_skip_chat_history_entry(entry.name):
                    logger.debug("跳过历史 LLM 调试日志目录: %s", entry.name)
                    continue
                source = Path(entry.path)
                target = snapshot_dir / entry.name
                if entry.is_file(follow_symlinks=False):
                    await async_copy2(source, target)
                elif entry.is_dir(follow_symlinks=False):
                    await async_copytree(source, target)

            logger.info("聊天记录%s快照完成: %s", label, snapshot_dir)
            return True
        except Exception as error:
            logger.error("创建聊天记录%s快照失败: %s", label, error)
            return False

    async def _restore_snapshot(self, snapshot_dir: Path, *, label: str) -> bool:
        try:
            if not await async_exists(snapshot_dir):
                logger.warning("%s聊天记录快照目录不存在: %s", label, snapshot_dir)
                return True

            target_dir = PathManager.get_chat_history_dir()
            if await async_exists(target_dir):
                await async_rmtree(target_dir)
            await async_mkdir(target_dir, parents=True, exist_ok=True)

            for entry in await async_scandir(snapshot_dir):
                if _should_skip_chat_history_entry(entry.name):
                    logger.debug("跳过历史 LLM 调试日志目录: %s", entry.name)
                    continue
                source = Path(entry.path)
                target = target_dir / entry.name
                if entry.is_file(follow_symlinks=False):
                    await async_copy2(source, target)
                elif entry.is_dir(follow_symlinks=False):
                    await async_copytree(source, target)

            logger.info("恢复%s聊天记录快照完成: %s", label, target_dir)
            return True
        except Exception as error:
            logger.error("恢复%s聊天记录快照失败: %s", label, error)
            return False


__all__ = ["ChatHistorySnapshotManager"]
