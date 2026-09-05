"""构造会话后记忆文件的超限整理提示。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from agentlang.config.config import config
from agentlang.logger import get_logger
from app.service.auto_read_file_service import AutoReadFileCandidate, AutoReadFileService
from app.service.memory.runtime.extraction.memory_extraction_prompts import (
    MemoryExtractionPromptName,
    get_memory_extraction_prompt,
)
from app.utils.async_file_utils import async_stat

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class MemoryFileSizeNotice:
    """记录一个达到整理阈值的记忆文件。"""

    path: Path
    size_bytes: int
    limit_bytes: int

    @property
    def size_kb(self) -> float:
        """返回以 KiB 表示的文件大小。"""
        return self.size_bytes / 1024

    @property
    def limit_kb(self) -> int:
        """返回以 KiB 表示的整理阈值。"""
        return self.limit_bytes // 1024


class MemoryMaintenancePromptBuilder:
    """检查共享记忆文件大小并生成按文件定位的整理提示。"""

    _DEFAULT_LIMIT_KB = 16
    _CONFIG_KEY = "memory.after_run.memory_file_max_size_kb"

    def __init__(self, limit_kb: int | None = None) -> None:
        """初始化记忆文件大小阈值。"""
        self._limit_kb = self._normalize_limit_kb(limit_kb)

    async def build(self, agent_context: "AgentContext") -> str:
        """返回超限记忆文件的动态整理提示；没有超限文件时返回空字符串。"""
        candidates = await AutoReadFileService.resolve_memory_file_candidates(agent_context)
        notices = await self._collect_notices(candidates)
        if not notices:
            return ""
        return self._render_prompt(notices)

    async def _collect_notices(
        self,
        candidates: tuple[AutoReadFileCandidate, ...],
    ) -> tuple[MemoryFileSizeNotice, ...]:
        """并发读取候选文件大小，并忽略已经消失或无法 stat 的文件。"""
        results = await asyncio.gather(
            *(self._inspect_candidate(candidate) for candidate in candidates),
            return_exceptions=True,
        )
        notices: list[MemoryFileSizeNotice] = []
        for result in results:
            if isinstance(result, MemoryFileSizeNotice):
                notices.append(result)
            elif isinstance(result, Exception):
                logger.debug("记忆文件超限检查失败，跳过本次提醒", exc_info=result)
        return tuple(notices)

    async def _inspect_candidate(
        self,
        candidate: AutoReadFileCandidate,
    ) -> MemoryFileSizeNotice | None:
        """检查单个候选文件，避免文件竞争阻断主任务。"""
        try:
            stat = await async_stat(candidate.absolute_path)
        except (FileNotFoundError, OSError) as error:
            logger.debug(
                "记忆文件在超限检查期间不可读取，跳过本次提醒: "
                f"path={candidate.absolute_path} error={error}"
            )
            return None

        if stat.st_size < self._limit_kb * 1024:
            return None
        return MemoryFileSizeNotice(
            path=candidate.absolute_path,
            size_bytes=stat.st_size,
            limit_bytes=self._limit_kb * 1024,
        )

    @staticmethod
    def _normalize_limit_kb(value: int | None) -> int:
        """读取正整数阈值，非法配置回退到默认值。"""
        raw_value = value if value is not None else config.get(
            MemoryMaintenancePromptBuilder._CONFIG_KEY,
            MemoryMaintenancePromptBuilder._DEFAULT_LIMIT_KB,
        )
        try:
            normalized = int(raw_value)
        except (TypeError, ValueError):
            return MemoryMaintenancePromptBuilder._DEFAULT_LIMIT_KB
        return normalized if normalized > 0 else MemoryMaintenancePromptBuilder._DEFAULT_LIMIT_KB

    @staticmethod
    def _render_prompt(notices: tuple[MemoryFileSizeNotice, ...]) -> str:
        """把超限文件渲染为 AfterRun 可直接执行的维护要求。"""
        memory_files = "\n".join(
            f"- {notice.path} ({notice.size_kb:.1f} KiB; limit {notice.limit_kb} KiB)"
            for notice in notices
        )
        return get_memory_extraction_prompt(
            MemoryExtractionPromptName.MEMORY_FILE_SIZE_MAINTENANCE,
            memory_files=memory_files,
        )


__all__ = ["MemoryFileSizeNotice", "MemoryMaintenancePromptBuilder"]
