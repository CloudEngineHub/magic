"""文件记忆运行时生命周期协调器。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from agentlang.event.data import AfterMainAgentRunEventData
from agentlang.event.event import Event
from app.service.memory.runtime.lifecycle.memory_after_run_service import MemoryAfterRunService

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryLifecycleCoordinator:
    """编排主 Agent 运行后的文件记忆扩展能力。"""

    def __init__(
        self,
        after_run_service: MemoryAfterRunService | None = None,
    ) -> None:
        """初始化回合后服务，便于独立测试和后续替换。"""
        self._after_run_service = after_run_service or MemoryAfterRunService()

    async def after_run(
        self,
        agent_context: "AgentContext",
        event: Event[AfterMainAgentRunEventData],
    ) -> None:
        """调用主 Agent 结束后的记忆提取扩展点。"""
        await self._after_run_service.handle(agent_context, event)
