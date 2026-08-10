"""主 Agent 运行前的文件记忆编排服务。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.service.memory.runtime.context import MemoryCoreContextService

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryBeforeRunService:
    """编排主 Agent 运行前需要完成的核心记忆注入。"""

    def __init__(self, core_context_service: MemoryCoreContextService | None = None) -> None:
        """初始化运行前记忆服务。"""
        self._core_context_service = core_context_service or MemoryCoreContextService()

    async def handle(self, agent_context: "AgentContext") -> None:
        """在首次 LLM 调用前将核心记忆写入 Horizon。"""
        await self._core_context_service.load(agent_context)
