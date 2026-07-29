"""主 Agent 运行后的记忆提取预留服务。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from agentlang.event.data import AfterMainAgentRunEventData
from agentlang.event.event import Event

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryAfterRunService:
    """保留主 Agent 结束后的记忆提取扩展点。"""

    async def handle(
        self,
        agent_context: "AgentContext",
        event: Event[AfterMainAgentRunEventData],
    ) -> None:
        """接收已完成回合，等待后续实现文件记忆提取。"""
        # TODO: 校验回合终态后，通过 AIAbility.MEMORY 提取稳定信息，并安全更新对应作用域的 MEMORY.md 和 notes/。
        return None
