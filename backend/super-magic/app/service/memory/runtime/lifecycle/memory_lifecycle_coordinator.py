"""文件记忆运行时生命周期协调器。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from agentlang.event.data import AfterMainAgentRunEventData
from agentlang.event.event import Event
from app.service.memory.runtime.lifecycle.memory_after_run_service import MemoryAfterRunService
from app.service.memory.runtime.lifecycle.memory_before_run_service import MemoryBeforeRunService

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryLifecycleCoordinator:
    """组合主 Agent 运行前后的文件记忆生命周期能力。"""

    def __init__(
        self,
        before_run_service: MemoryBeforeRunService | None = None,
        after_run_service: MemoryAfterRunService | None = None,
    ) -> None:
        """初始化运行前后服务，便于独立测试和后续替换。"""
        self._before_run_service = before_run_service or MemoryBeforeRunService()
        self._after_run_service = after_run_service or MemoryAfterRunService()

    async def before_run(self, agent_context: "AgentContext") -> None:
        """执行主 Agent 运行前的核心记忆注入。"""
        await self._before_run_service.handle(agent_context)

    async def after_run(
        self,
        agent_context: "AgentContext",
        event: Event[AfterMainAgentRunEventData],
    ) -> None:
        """调用主 Agent 结束后的记忆提取扩展点。"""
        await self._after_run_service.handle(agent_context, event)
