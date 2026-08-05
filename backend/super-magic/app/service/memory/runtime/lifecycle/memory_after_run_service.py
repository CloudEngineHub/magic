"""主 Agent 运行后的记忆提取预留服务。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from agentlang.event.data import AfterMainAgentRunEventData
from agentlang.event.event import Event
from app.service.memory.policies.memory_model_input_filter import MemoryModelInputFilter

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryAfterRunService:
    """保留主 Agent 结束后的记忆提取扩展点。"""

    def __init__(self, input_filter: MemoryModelInputFilter | None = None) -> None:
        """初始化回合结束服务及记忆输入过滤策略。"""
        self._input_filter = input_filter or MemoryModelInputFilter()

    async def handle(
        self,
        agent_context: "AgentContext",
        event: Event[AfterMainAgentRunEventData],
    ) -> None:
        """接收已完成回合，等待后续实现文件记忆提取。"""
        query = str(event.data.query or "").strip()
        if not query or self._input_filter.should_skip(query):
            return None

        # TODO: 校验回合终态后，通过 AIAbility.MEMORY 提取稳定信息，并安全更新对应作用域的 MEMORY.md 和 notes/。
        return None
