"""Runtime preparation service for Crew agents."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Optional

from agentlang.logger import get_logger
from app.core.subagent_delegation import is_crew_agent_code
from app.path_manager import PathManager
from app.service.crew_agent_cache_manager import CrewAgentCacheManager
from app.service.crew_agent_compiler import CrewAgentCompiler
from app.service.crew_downloader import CrewDownloader, CrewPackageInvalidError
from app.utils.async_file_utils import (
    async_exists,
    async_read_markdown,
    async_rmtree,
)

logger = get_logger(__name__)


@dataclass(frozen=True)
class CrewAgentRuntimeInfo:
    agent_code: str
    agent_file: Path
    crew_dir: Path
    name: str = ""
    role: str = ""
    description: str = ""
    compiled: bool = False


class CrewAgentRuntimeService:
    """Ensure a Crew agent package is downloaded and compiled for runtime use."""

    _locks: ClassVar[dict[str, asyncio.Lock]] = {}

    def __init__(
        self,
        on_cache_invalidated: Optional[Callable[[str, str], None]] = None,
    ) -> None:
        self._on_cache_invalidated = on_cache_invalidated
        self._compiler = CrewAgentCompiler()
        self._downloader = CrewDownloader()
        self._cache_manager = CrewAgentCacheManager()

    async def ensure_compiled(self, agent_code: str) -> CrewAgentRuntimeInfo:
        normalized_code = self._normalize_agent_code(agent_code)
        lock = self._locks.setdefault(normalized_code, asyncio.Lock())
        async with lock:
            return await self._ensure_compiled_locked(normalized_code)

    async def _ensure_compiled_locked(self, agent_code: str) -> CrewAgentRuntimeInfo:
        crew_dir = PathManager.get_crew_agent_dir(agent_code)
        agent_file = PathManager.get_compiled_agent_file(agent_code)
        identity_file = PathManager.get_crew_identity_file(agent_code)

        if await async_exists(agent_file):
            if not await async_exists(identity_file):
                logger.warning(
                    f"IDENTITY.md not found for existing crew agent, skip profile metadata: {identity_file}"
                )
                return CrewAgentRuntimeInfo(
                    agent_code=agent_code,
                    agent_file=agent_file,
                    crew_dir=crew_dir,
                    compiled=False,
                )

            cache_state = await self._cache_manager.evaluate_cache(agent_code, crew_dir)
            if not cache_state.stale:
                logger.info(f"Crew .agent cache fresh, skip download/compile: {agent_file}")
                identity_meta = (await async_read_markdown(identity_file)).meta
                return self._build_info(agent_code, agent_file, crew_dir, identity_meta, compiled=False)

            logger.info(
                f"Crew source cache stale, recompile: agent_code={agent_code}, "
                f"reason={cache_state.reason}, file_count={cache_state.source.file_count}"
            )
            await self._cache_manager.clear_compiled_cache(agent_code)
            self._invalidate_runtime_cache(agent_code, cache_state.reason)
            identity_meta = await self._compile(agent_code, crew_dir)
            await self._cache_manager.write_manifest(agent_code, crew_dir, cache_state.source)
            return self._build_info(agent_code, agent_file, crew_dir, identity_meta, compiled=True)

        if not await async_exists(identity_file):
            logger.info(f"Crew files not found locally, downloading: {agent_code}")
            if await async_exists(crew_dir):
                await async_rmtree(crew_dir)
            await self._downloader.download_and_extract(agent_code, crew_dir)

        self._invalidate_runtime_cache(agent_code, "compiled_cache_missing")
        identity_meta = await self._compile(agent_code, crew_dir)
        await self._cache_manager.write_manifest(agent_code, crew_dir)
        return self._build_info(agent_code, agent_file, crew_dir, identity_meta, compiled=True)

    async def _compile(self, agent_code: str, crew_dir: Path) -> dict:
        try:
            return await self._compiler.compile(agent_code, crew_dir)
        except asyncio.CancelledError:
            raise
        except CrewPackageInvalidError:
            raise
        except Exception as exc:
            raise CrewPackageInvalidError(
                f"Employee package compilation failed: {agent_code}"
            ) from exc

    def _invalidate_runtime_cache(self, agent_code: str, reason: str) -> None:
        if self._on_cache_invalidated is not None:
            self._on_cache_invalidated(agent_code, reason)
            return

        from app.core.skill_utils.manager import GlobalSkillManager

        GlobalSkillManager.reset()
        logger.info(
            f"Invalidated crew runtime cache: agent_code={agent_code}, reason={reason}, removed_agent=False"
        )

    def _build_info(
        self,
        agent_code: str,
        agent_file: Path,
        crew_dir: Path,
        identity_meta: dict,
        compiled: bool,
    ) -> CrewAgentRuntimeInfo:
        return CrewAgentRuntimeInfo(
            agent_code=agent_code,
            agent_file=agent_file,
            crew_dir=crew_dir,
            name=str(identity_meta.get("name", "") or ""),
            role=str(identity_meta.get("role", "") or ""),
            description=str(identity_meta.get("description", "") or ""),
            compiled=compiled,
        )

    def _normalize_agent_code(self, agent_code: str) -> str:
        code = (agent_code or "").strip()
        if not code:
            raise ValueError("agent_code is required")
        # 复用 Crew code 的唯一校验口径：要求 SMA-/SMA_ 前缀，天然排除 "." / ".." 等路径穿越输入。
        if not is_crew_agent_code(code):
            raise ValueError(f"Invalid agent_code: {agent_code}")
        return code
