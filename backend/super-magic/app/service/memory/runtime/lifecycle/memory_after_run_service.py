"""主 Agent 正常结束后的记忆提取生命周期服务。"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from agentlang.agent.state import AgentState
from agentlang.event.data import AfterMainAgentRunEventData
from agentlang.event.event import Event
from agentlang.logger import get_logger
from app.service.agent_context_snapshot_service import AgentContextSnapshotService
from app.service.memory.policies.memory_model_input_filter import MemoryModelInputFilter
from app.service.memory.runtime.extraction.memory_extraction_service import MemoryExtractionService

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)


class MemoryAfterRunService:
    """判断运行后触发条件，并把完整快照交给记忆提取服务。"""

    def __init__(
        self,
        snapshot_service: AgentContextSnapshotService | None = None,
        extraction_service: MemoryExtractionService | None = None,
        input_filter: MemoryModelInputFilter | None = None,
    ) -> None:
        """初始化快照、提取和输入过滤依赖。"""
        self._snapshot_service = snapshot_service or AgentContextSnapshotService()
        self._extraction_service = extraction_service or MemoryExtractionService()
        self._input_filter = input_filter or MemoryModelInputFilter()

    async def handle(
        self,
        agent_context: "AgentContext",
        event: Event[AfterMainAgentRunEventData],
    ) -> None:
        """符合条件时捕获当前快照，并调用提取服务接口。"""
        if event.data.agent_state != AgentState.FINISHED.value:
            return
        if not agent_context.is_main_agent_context():
            return
        query = str(event.data.query or "").strip()
        if not query or self._input_filter.should_skip(query):
            return

        try:
            snapshot = await self._snapshot_service.capture(agent_context)
            self._extraction_service.submit(agent_context, snapshot)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("提交会话后记忆提取失败，本轮主任务继续结束", exc_info=True)
