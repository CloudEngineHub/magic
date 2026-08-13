"""MagicClaw 运行前的文件准备与编译服务。"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import ClassVar

from agentlang.logger import get_logger

from app.path_manager import PathManager
from app.service.claw_agent_compiler import ClawAgentCompiler
from app.utils.async_file_utils import (
    CopyConflict,
    async_copytree,
    async_exists,
    async_rename,
    async_unlink,
)

logger = get_logger(__name__)


@dataclass(frozen=True)
class ClawAgentRuntimeInfo:
    """已经完成文件准备和编译的 Claw 运行时信息。"""

    claw_code: str
    agent_file: Path
    magic_dir: Path
    name: str
    role: str
    description: str


class ClawAgentRuntimeService:
    """同步 Claw 模板、初始化工作区文件并刷新编译产物。"""

    _locks: ClassVar[dict[str, asyncio.Lock]] = {}

    def __init__(self) -> None:
        self._compiler = ClawAgentCompiler()

    async def prepare(self, claw_code: str) -> ClawAgentRuntimeInfo:
        normalized_code = (claw_code or "").strip()
        agent_file = PathManager.get_compiled_agent_file(normalized_code)
        magic_dir = PathManager.get_magic_dir()
        claw_dir = PathManager.get_claw_agent_dir(normalized_code)

        lock_key = self._normalize_lock_key(magic_dir)
        lock = self._locks.setdefault(lock_key, asyncio.Lock())
        async with lock:
            return await self._prepare_locked(
                claw_code=normalized_code,
                claw_dir=claw_dir,
                magic_dir=magic_dir,
                agent_file=agent_file,
            )

    async def _prepare_locked(
        self,
        *,
        claw_code: str,
        claw_dir: Path,
        magic_dir: Path,
        agent_file: Path,
    ) -> ClawAgentRuntimeInfo:
        # 用持久化工作区中的 IDENTITY.md 判断首次初始化，不能依赖可再生的 .agent 编译产物。
        already_initialized = await async_exists(magic_dir / "IDENTITY.md")

        if already_initialized:
            # BOOTSTRAP.md 只用于首次初始化；memory 是用户运行数据，均不能从模板恢复。
            await async_copytree(
                claw_dir,
                magic_dir,
                on_conflict=CopyConflict.SKIP,
                exclude={"BOOTSTRAP.md", "memory"},
            )
            logger.info(f"Claw .agent already exists, refresh compile: {agent_file}")
        else:
            await async_copytree(claw_dir, magic_dir, on_conflict=CopyConflict.SKIP)
            await self._prepare_initial_memory(magic_dir)

        # .agent 是模板与 .magic 文件派生出的可再生编译产物，每次 prepare 都必须刷新。
        identity_meta = await self._compiler.compile(claw_code, magic_dir)
        return ClawAgentRuntimeInfo(
            claw_code=claw_code,
            agent_file=agent_file,
            magic_dir=magic_dir,
            name=str(identity_meta.get("name", "") or ""),
            role=str(identity_meta.get("role", "") or ""),
            description=str(identity_meta.get("description", "") or ""),
        )

    async def _prepare_initial_memory(self, magic_dir: Path) -> None:
        placeholder = magic_dir / "memory" / "1900-01-01-none.md"
        if not await async_exists(placeholder):
            return

        today_file = magic_dir / "memory" / f"{date.today().isoformat()}.md"
        if not await async_exists(today_file):
            await async_rename(placeholder, today_file)
            logger.info(f"Renamed memory placeholder to: {today_file.name}")
            return

        await async_unlink(placeholder)
        logger.info(f"Removed memory placeholder (today's file already exists: {today_file.name})")

    @staticmethod
    def _normalize_lock_key(magic_dir: Path) -> str:
        """仅做词法规范化，避免用同步文件系统调用解析路径。"""
        return os.path.normcase(os.path.abspath(os.path.normpath(os.fspath(magic_dir))))
