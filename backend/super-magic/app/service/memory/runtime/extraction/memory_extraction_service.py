"""基于完整 fork 执行会话后记忆提取。"""

from __future__ import annotations

import asyncio
import threading
import uuid
from typing import TYPE_CHECKING

from agentlang.logger import get_logger
from app.service.memory.runtime.extraction.memory_extraction_prompt_provider import (
    MemoryExtractionPromptProvider,
)

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext
    from app.service.agent_context_snapshot_service import AgentContextSnapshot

logger = get_logger(__name__)


class MemoryExtractionService:
    """为符合条件的回合创建后台 fork 记忆提取任务，并保证全局单任务运行。"""

    _run_lock_guard = threading.Lock()
    _run_lock = threading.Lock()

    def __init__(
        self,
        prompt_provider: MemoryExtractionPromptProvider | None = None,
    ) -> None:
        """初始化提示词提供者和后台任务强引用集合。"""
        self._prompt_provider = prompt_provider or MemoryExtractionPromptProvider()
        self._tasks: set[asyncio.Task[None]] = set()

    def submit(
        self,
        agent_context: "AgentContext",
        snapshot: "AgentContextSnapshot",
    ) -> bool:
        """提交当前回合；已有记忆整理任务运行时直接跳过并返回 False。"""
        if not self._try_acquire_run_lock():
            source = snapshot.source
            logger.info(
                "已有会话后记忆整理任务运行，跳过本次提取: "
                f"source={source.target.agent_name}<{source.agent_id}>"
            )
            return False

        generation = uuid.uuid4().hex
        try:
            task = asyncio.create_task(
                self._run_extraction(agent_context, snapshot, generation),
                name=f"memory-after-run-{generation}",
            )
        except BaseException:
            self._release_run_lock()
            raise
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        task.add_done_callback(self._release_run_lock_callback)
        source = snapshot.source
        logger.info(
            "会话后记忆提取任务已发起: "
            f"source={source.target.agent_name}<{source.agent_id}>, generation={generation}"
        )
        return True

    async def _run_extraction(
        self,
        agent_context: "AgentContext",
        snapshot: "AgentContextSnapshot",
        generation: str,
    ) -> None:
        """指定记忆模型，在完整 fork 末尾追加 user 消息并继续运行。"""
        try:
            from app.core.ai_abilities import get_memory_model_id
            from app.path_manager import PathManager
            from app.service.agent_runner import (
                IsolatedAgentModelRequest,
                IsolatedAgentRunRequest,
                run_isolated_agent,
            )
            from app.utils.runtime_storage import (
                RuntimeEvictionPolicy,
                ensure_runtime_directory,
                evict_runtime_directories,
                get_runtime_config_int,
                trigger_opportunistic_cleanup,
            )

            source = snapshot.source
            agent_id = f"memory-after-run-{generation}"
            prompt = await self._prompt_provider.load(
                snapshot,
                agent_context=agent_context,
            )
            runtime_dir = await ensure_runtime_directory(
                PathManager.get_memory_after_run_dir()
                / f"{source.target.agent_name}<{agent_id}>"
            )
            trigger_opportunistic_cleanup(
                "memory_after_run",
                lambda: evict_runtime_directories(
                    PathManager.get_memory_after_run_dir(),
                    policy=RuntimeEvictionPolicy(
                        max_age_seconds=get_runtime_config_int(
                            "runtime_cleanup.memory_after_run.max_age_days",
                            minimum=1,
                        )
                        * 24
                        * 60
                        * 60,
                    ),
                    protected_paths=frozenset({runtime_dir}),
                ),
            )
            await run_isolated_agent(
                IsolatedAgentRunRequest(
                    target=source.target,
                    agent_id=agent_id,
                    prompt=prompt,
                    parent_context=agent_context,
                    models=IsolatedAgentModelRequest(text_model_id=get_memory_model_id()),
                    snapshot=snapshot,
                    chat_history_dir=runtime_dir,
                )
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("会话后记忆提取失败，本轮主任务不受影响", exc_info=True)

    @classmethod
    def _try_acquire_run_lock(cls) -> bool:
        """以非阻塞方式获取进程内跨实例的记忆整理锁。"""
        with cls._run_lock_guard:
            return cls._run_lock.acquire(blocking=False)

    @classmethod
    def _release_run_lock_callback(cls, _task: "asyncio.Task[None]") -> None:
        """在记忆整理子 Agent 完成后释放运行时锁。"""
        cls._release_run_lock()

    @classmethod
    def _release_run_lock(cls) -> None:
        """释放当前进程持有的内存记忆整理锁。"""
        with cls._run_lock_guard:
            if cls._run_lock.locked():
                cls._run_lock.release()


__all__ = ["MemoryExtractionService"]
