"""会话后记忆提取提示词选择服务。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.models.agent_runtime import AgentProviderType, AgentTarget
from app.service.memory.runtime.extraction.memory_extraction_prompts import (
    MemoryExtractionPromptName,
    get_memory_extraction_prompt,
)
from app.service.memory.runtime.extraction.memory_maintenance_prompt import (
    MemoryMaintenancePromptBuilder,
)

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryExtractionPromptProvider:
    """根据来源 Agent 类型提供对应的内置会话后记忆提取提示词。"""

    def __init__(
        self,
        maintenance_prompt_builder: MemoryMaintenancePromptBuilder | None = None,
    ) -> None:
        """初始化静态提示词和动态超限提示构造器。"""
        self._maintenance_prompt_builder = (
            maintenance_prompt_builder or MemoryMaintenancePromptBuilder()
        )

    async def load(
        self,
        target: AgentTarget,
        *,
        agent_context: "AgentContext | None" = None,
    ) -> str:
        """返回静态提示词，并追加当前记忆文件的动态整理要求。"""
        prompt = self._resolve_prompt(target)
        if agent_context is None:
            return prompt
        maintenance_prompt = await self._maintenance_prompt_builder.build(agent_context)
        return f"{prompt}\n{maintenance_prompt}" if maintenance_prompt else prompt

    @staticmethod
    def _resolve_prompt(target: AgentTarget) -> str:
        """为 Claw 选择专用提示词，其他 Agent 使用通用提示词。"""
        prompt_name = (
            MemoryExtractionPromptName.CLAW
            if target.provider_type == AgentProviderType.CLAW
            else MemoryExtractionPromptName.DEFAULT
        )
        return get_memory_extraction_prompt(prompt_name)


__all__ = ["MemoryExtractionPromptProvider"]
