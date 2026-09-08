"""构造会话后记忆整理提示。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, cast

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
    suggested_target_bytes: int = 0
    scope: str = "unknown"
    rule_id: str = "unknown"

    @property
    def size_kb(self) -> float:
        """返回以 KiB 表示的文件大小。"""
        return self.size_bytes / 1024

    @property
    def limit_kb(self) -> int:
        """返回以 KiB 表示的触发阈值。"""
        return self.limit_bytes // 1024

    @property
    def suggested_target_kb(self) -> int:
        """返回以 KiB 表示的建议整理目标。"""
        return (self.suggested_target_bytes or self.limit_bytes) // 1024


class MemoryMaintenancePromptBuilder:
    """以文件大小作为触发条件，生成按文件定位的记忆整理提示。"""

    _DEFAULT_LIMIT_KB = 32
    _DEFAULT_TARGET_KB = 24
    _CONFIG_KEY = "memory.after_run.memory_file_max_size_kb"
    _TARGET_CONFIG_KEY = "memory.after_run.memory_file_target_size_kb"

    def __init__(
        self,
        limit_kb: int | None = None,
        target_kb: int | None = None,
    ) -> None:
        """初始化记忆文件触发阈值和建议目标。"""
        self._limit_kb = self._normalize_limit_kb(limit_kb)
        self._target_kb = self._normalize_target_kb(target_kb, self._limit_kb)

    async def build(self, agent_context: "AgentContext") -> str:
        """返回需要整理的记忆文件提示；没有触发文件时返回空字符串。"""
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
            suggested_target_bytes=self._target_kb * 1024,
            scope=candidate.scope,
            rule_id=cast(str, candidate.rule_id.value),
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

    @classmethod
    def _normalize_target_kb(cls, value: int | None, limit_kb: int) -> int:
        """读取建议目标，并确保目标不会高于触发阈值。"""
        raw_value = value if value is not None else config.get(
            cls._TARGET_CONFIG_KEY,
            cls._DEFAULT_TARGET_KB,
        )
        try:
            normalized = int(raw_value)
        except (TypeError, ValueError):
            normalized = cls._DEFAULT_TARGET_KB
        if normalized <= 0:
            normalized = cls._DEFAULT_TARGET_KB
        return min(normalized, limit_kb)

    @staticmethod
    def _render_prompt(notices: tuple[MemoryFileSizeNotice, ...]) -> str:
        """把触发整理的文件渲染为 AfterRun 可直接执行的记忆整理要求。"""
        memory_files = "\n".join(
            "- "
            f"scope: {notice.scope}; rule: {notice.rule_id}; path: {notice.path}; "
            f"current size: {notice.size_kb:.1f} KiB; "
            f"suggested target: <= {notice.suggested_target_kb} KiB"
            for notice in notices
        )
        return get_memory_extraction_prompt(
            MemoryExtractionPromptName.MEMORY_MAINTENANCE,
            memory_files=memory_files,
        )


__all__ = ["MemoryFileSizeNotice", "MemoryMaintenancePromptBuilder"]
