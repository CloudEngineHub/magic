# -*- coding: utf-8 -*-
"""只保存和恢复当前主 Agent 可重启上下文的聊天历史快照。"""

from pathlib import Path
from collections.abc import Iterable

from agentlang.chat_history.chat_history import ChatHistory
from agentlang.logger import get_logger
from app.core.horizon.store import HorizonStore
from app.path_manager import PathManager
from app.utils.async_file_utils import (
    async_copy2,
    async_exists,
    async_mkdir,
    async_rmtree,
    async_scandir,
    async_unlink,
)

logger = get_logger(__name__)


class ChatHistorySnapshotManager:
    """Checkpoint 仅管理当前主 Agent 的 history、session 和 Horizon 三个文件。"""

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
            agent_name=agent_name,
            agent_id=agent_id,
            chat_history_dir=chat_history_dir,
            label="初始",
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
            agent_name=agent_name,
            agent_id=agent_id,
            chat_history_dir=chat_history_dir,
            label="最新",
        )

    async def restore_from_initial_chat_history(self, snapshot_dir: Path) -> bool:
        return await self._restore_snapshot(snapshot_dir, label="初始")

    async def restore_from_latest_chat_history(self, snapshot_dir: Path) -> bool:
        return await self._restore_snapshot(snapshot_dir, label="最新")

    async def _create_snapshot(
        self,
        snapshot_dir: Path,
        *,
        agent_name: str,
        agent_id: str,
        chat_history_dir: Path,
        label: str,
    ) -> bool:
        try:
            if await async_exists(snapshot_dir):
                await async_rmtree(snapshot_dir)
            await async_mkdir(snapshot_dir, parents=True, exist_ok=True)

            for source in self._agent_files(agent_name, agent_id, chat_history_dir):
                if await async_exists(source):
                    await async_copy2(source, snapshot_dir / source.name)

            logger.info(f"聊天历史{label}快照完成: {snapshot_dir}")
            return True
        except Exception as error:
            logger.error(f"创建聊天历史{label}快照失败: {error}")
            return False

    async def _restore_snapshot(self, snapshot_dir: Path, *, label: str) -> bool:
        try:
            if not await async_exists(snapshot_dir):
                logger.warning(f"{label}快照目录不存在: {snapshot_dir}")
                return True

            snapshot_files = [
                Path(entry.path)
                for entry in await async_scandir(snapshot_dir)
                if entry.is_file(follow_symlinks=False)
            ]
            identity = await self._resolve_identity(snapshot_files)
            if identity is None:
                logger.warning(f"{label}快照无法确定主 Agent，跳过聊天历史恢复")
                return False

            agent_name, agent_id = identity
            target_dir = PathManager.get_chat_history_dir()
            snapshot_by_name = {path.name: path for path in snapshot_files}
            for target in self._agent_files(agent_name, agent_id, target_dir):
                source = snapshot_by_name.get(target.name)
                if source is None:
                    await async_unlink(target)
                else:
                    await async_copy2(source, target)

            logger.info(f"从{label}快照恢复当前主 Agent 聊天历史完成")
            return True
        except Exception as error:
            logger.error(f"从{label}快照恢复聊天历史失败: {error}")
            return False

    async def _resolve_identity(self, snapshot_files: list[Path]) -> tuple[str, str] | None:
        identities = self._identities_from_names(path.name for path in snapshot_files)
        if len(identities) == 1:
            return next(iter(identities))

        root = PathManager.get_chat_history_dir()
        if not await async_exists(root):
            return None
        root_names = (
            entry.name
            for entry in await async_scandir(root)
            if entry.is_file(follow_symlinks=False)
        )
        identities = self._identities_from_names(root_names)
        return next(iter(identities)) if len(identities) == 1 else None

    @staticmethod
    def _identities_from_names(names: Iterable[str]) -> set[tuple[str, str]]:
        identities: set[tuple[str, str]] = set()
        for name in names:
            base = name
            for suffix in (".session.json", ".horizon.json", ".json"):
                if base.endswith(suffix):
                    base = base[:-len(suffix)]
                    break
            else:
                continue
            if "<" not in base or not base.endswith(">"):
                continue
            agent_name, agent_id = base.rsplit("<", 1)
            if agent_name and agent_id[:-1]:
                identities.add((agent_name, agent_id[:-1]))
        return identities

    @staticmethod
    def _agent_files(agent_name: str, agent_id: str, chat_history_dir: Path) -> tuple[Path, Path, Path]:
        return (
            ChatHistory.history_path_for_session(agent_name, agent_id, chat_history_dir),
            ChatHistory.session_path_for_session(agent_name, agent_id, chat_history_dir),
            HorizonStore.path_for_session(agent_name, agent_id, chat_history_dir),
        )
