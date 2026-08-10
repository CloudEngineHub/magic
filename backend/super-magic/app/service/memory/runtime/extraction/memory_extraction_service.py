"""基于完整 fork 执行会话后记忆提取。"""

from __future__ import annotations

import asyncio
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
    """为每个已提交回合独立创建后台 fork 记忆提取任务。"""

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
    ) -> None:
        """独立提交当前回合，不等待或检查其他提取任务。"""
        generation = uuid.uuid4().hex
        task = asyncio.create_task(
            self._run_extraction(agent_context, snapshot, generation),
            name=f"memory-after-run-{generation}",
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        source = snapshot.source
        logger.info(
            "会话后记忆提取任务已发起: "
            f"source={source.target.agent_name}<{source.agent_id}>, generation={generation}"
        )

    async def _run_extraction(
        self,
        agent_context: "AgentContext",
        snapshot: "AgentContextSnapshot",
        generation: str,
    ) -> None:
        """指定记忆模型，在完整 fork 末尾追加 user 消息并继续运行。"""
        try:
            from app.core.ai_abilities import get_memory_model_id
            from app.service.agent_runner import (
                IsolatedAgentModelRequest,
                IsolatedAgentRunRequest,
                run_isolated_agent,
            )

            source = snapshot.source
            prompt = await self._prompt_provider.load(source.target)
            await run_isolated_agent(
                IsolatedAgentRunRequest(
                    target=source.target,
                    agent_id=f"memory-after-run-{generation}",
                    prompt=prompt,
                    parent_context=agent_context,
                    models=IsolatedAgentModelRequest(text_model_id=get_memory_model_id()),
                    snapshot=snapshot,
                )
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("会话后记忆提取失败，本轮主任务不受影响", exc_info=True)


__all__ = ["MemoryExtractionService"]
