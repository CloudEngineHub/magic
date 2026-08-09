"""聊天记录分类统计与可配置清理。"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from pathlib import Path

from agentlang.config.config import config
from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.tools.subagent_runtime_models import SubagentStatus
from app.tools.subagent_runtime_store import SubagentRuntimeStore
from app.utils.async_file_utils import (
    async_exists,
    async_rmtree,
    async_scandir,
    async_stat,
    async_unlink,
)
from app.utils.runtime_storage import RuntimeEvictionPolicy, evict_runtime_files

logger = get_logger(__name__)

_COMPACTED_NAME = re.compile(r"^[^<>/]+<[^<>/]+>_\d{14}\.json$")
_TERMINAL_STATUSES = {SubagentStatus.DONE, SubagentStatus.ERROR, SubagentStatus.INTERRUPTED}


@dataclass(frozen=True, slots=True)
class _HistoryItem:
    path: Path
    size: int
    modified_at: float
    kind: str


class ChatHistoryCleanupService:
    """配置为空时只统计；只清理新目录和新命名文件。"""

    _lock = asyncio.Lock()
    _task: asyncio.Task[None] | None = None

    @classmethod
    def trigger(cls) -> None:
        if cls._task is not None and not cls._task.done():
            return
        cls._task = asyncio.create_task(cls().run(), name="chat-history-cleanup")

        def _finish(task: asyncio.Task[None]) -> None:
            if cls._task is task:
                cls._task = None
            try:
                task.result()
            except asyncio.CancelledError:
                return
            except Exception as error:
                logger.warning(f"聊天记录清理失败: {error}")

        cls._task.add_done_callback(_finish)

    async def run(self) -> None:
        async with self._lock:
            protected_cron_ids = await self._active_cron_agent_ids()
            subagents = await self._collect_subagents(protected_cron_ids)
            compacted = await self._collect_compacted()
            await self._clean_runtime_logs()

            subagents = await self._apply_limits(
                subagents,
                max_age_days=self._positive_int("chat_history_cleanup.completed_subagent_max_age_days"),
                max_count=self._positive_int("chat_history_cleanup.completed_subagent_max_count"),
            )
            compacted = await self._apply_limits(
                compacted,
                max_age_days=self._positive_int("chat_history_cleanup.compacted_max_age_days"),
                max_count=self._positive_int("chat_history_cleanup.compacted_max_count"),
            )
            await self._apply_total_limit(subagents + compacted)
            await self._log_stats()

    async def _collect_subagents(self, protected_cron_ids: set[str]) -> list[_HistoryItem]:
        root = PathManager.get_subagents_chat_history_dir()
        if not await async_exists(root):
            return []
        items: list[_HistoryItem] = []
        for entry in await async_scandir(root):
            if not entry.is_dir(follow_symlinks=False) or "<" not in entry.name or not entry.name.endswith(">"):
                continue
            agent_name, agent_id = entry.name.rsplit("<", 1)
            agent_id = agent_id[:-1]
            state = await SubagentRuntimeStore.load_state(agent_name, agent_id)
            if state.status not in _TERMINAL_STATUSES or agent_id in protected_cron_ids:
                continue
            size, modified_at = await self._directory_size(Path(entry.path))
            items.append(_HistoryItem(Path(entry.path), size, modified_at, "subagent"))
        return items

    async def _collect_compacted(self) -> list[_HistoryItem]:
        root = PathManager.get_chat_history_dir() / "compacted"
        if not await async_exists(root):
            return []
        items: list[_HistoryItem] = []
        for entry in await async_scandir(root):
            if not entry.is_file(follow_symlinks=False) or not _COMPACTED_NAME.fullmatch(entry.name):
                continue
            stat = await async_stat(Path(entry.path))
            items.append(_HistoryItem(Path(entry.path), stat.st_size, stat.st_mtime, "compacted"))
        return items

    async def _apply_limits(
        self,
        items: list[_HistoryItem],
        *,
        max_age_days: int | None,
        max_count: int | None,
    ) -> list[_HistoryItem]:
        remaining = sorted(items, key=lambda item: item.modified_at)
        if max_age_days is not None:
            cutoff = time.time() - max_age_days * 24 * 60 * 60
            expired = [item for item in remaining if item.modified_at < cutoff]
            for item in expired:
                await self._delete(item)
            expired_paths = {item.path for item in expired}
            remaining = [item for item in remaining if item.path not in expired_paths]
        if max_count is not None and len(remaining) > max_count:
            remove_count = len(remaining) - max_count
            for item in remaining[:remove_count]:
                await self._delete(item)
            remaining = remaining[remove_count:]
        return remaining

    async def _apply_total_limit(self, candidates: list[_HistoryItem]) -> None:
        max_total_bytes = self._positive_int("chat_history_cleanup.total_max_bytes")
        if max_total_bytes is None:
            return
        total = await self._directory_size(PathManager.get_chat_history_dir())
        total_bytes = total[0]
        for item in sorted(candidates, key=lambda candidate: candidate.modified_at):
            if total_bytes <= max_total_bytes:
                break
            if not await async_exists(item.path):
                continue
            await self._delete(item)
            total_bytes -= item.size
        if total_bytes > max_total_bytes:
            logger.warning(
                "聊天记录受保护内容已超过总容量配置，停止删除: "
                f"current={total_bytes}, configured={max_total_bytes}"
            )

    async def _clean_runtime_logs(self) -> None:
        max_age_days = self._positive_int("chat_history_cleanup.llm_request_max_age_days")
        max_entries = self._positive_int("chat_history_cleanup.llm_request_max_count")
        max_bytes = self._positive_int("chat_history_cleanup.llm_request_max_bytes")
        if max_age_days is None and max_entries is None and max_bytes is None:
            return
        policy = RuntimeEvictionPolicy(
            max_entries=max_entries,
            target_entries=max_entries,
            max_total_bytes=max_bytes,
            target_total_bytes=max_bytes,
            max_age_seconds=max_age_days * 24 * 60 * 60 if max_age_days is not None else None,
        )
        await evict_runtime_files(
            PathManager.get_llm_request_dir(),
            policy=policy,
            suffixes=(".log",),
        )

    async def _log_stats(self) -> None:
        root = PathManager.get_chat_history_dir()
        root_files = await self._root_file_stats(root)
        subagent_stats = await self._directory_stats(PathManager.get_subagents_chat_history_dir())
        compacted_stats = await self._directory_stats(root / "compacted")
        llm_stats = await self._directory_stats(PathManager.get_llm_request_dir())
        logger.info(
            "聊天记录存储统计: "
            f"main_files={root_files[0]}/{root_files[1]}B, "
            f"subagents={subagent_stats[0]}/{subagent_stats[1]}B, "
            f"compacted={compacted_stats[0]}/{compacted_stats[1]}B, "
            f"llm_request={llm_stats[0]}/{llm_stats[1]}B"
        )

    async def _root_file_stats(self, root: Path) -> tuple[int, int]:
        if not await async_exists(root):
            return 0, 0
        count = 0
        size = 0
        for entry in await async_scandir(root):
            if entry.is_file(follow_symlinks=False) and "<" in entry.name:
                stat = await async_stat(Path(entry.path))
                count += 1
                size += stat.st_size
        return count, size

    async def _directory_size(self, directory: Path) -> tuple[int, float]:
        if not await async_exists(directory):
            return 0, 0.0
        total = 0
        latest = 0.0
        for entry in await async_scandir(directory):
            path = Path(entry.path)
            if entry.is_dir(follow_symlinks=False):
                child_size, child_latest = await self._directory_size(path)
                total += child_size
                latest = max(latest, child_latest)
            elif entry.is_file(follow_symlinks=False):
                stat = await async_stat(path)
                total += stat.st_size
                latest = max(latest, stat.st_mtime)
        return total, latest

    async def _directory_stats(self, directory: Path) -> tuple[int, int]:
        if not await async_exists(directory):
            return 0, 0
        count = 0
        size = 0
        for entry in await async_scandir(directory):
            path = Path(entry.path)
            if entry.is_dir(follow_symlinks=False):
                child_count, child_size = await self._directory_stats(path)
                count += child_count
                size += child_size
            elif entry.is_file(follow_symlinks=False):
                stat = await async_stat(path)
                count += 1
                size += stat.st_size
        return count, size

    async def _delete(self, item: _HistoryItem) -> None:
        if item.kind == "subagent":
            await async_rmtree(item.path)
        else:
            await async_unlink(item.path)

    async def _active_cron_agent_ids(self) -> set[str]:
        from app.service.cron.store import scan_jobs

        jobs, _ = await scan_jobs({})
        return {job.payload.agent_id for job in jobs if job.payload.agent_id}

    @staticmethod
    def _positive_int(key: str) -> int | None:
        value = config.get(key)
        if value in {None, ""}:
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            logger.warning(f"忽略无效聊天记录清理配置: {key}={value}")
            return None
        return parsed if parsed > 0 else None


__all__ = ["ChatHistoryCleanupService"]
