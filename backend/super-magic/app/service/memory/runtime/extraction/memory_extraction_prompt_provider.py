"""会话后记忆提取提示词选择服务。"""

from __future__ import annotations

from app.core.models.agent_runtime import AgentProviderType, AgentTarget
from app.service.memory.runtime.extraction.memory_extraction_prompts import (
    CLAW_MEMORY_EXTRACTION_PROMPT,
    DEFAULT_MEMORY_EXTRACTION_PROMPT,
)


class MemoryExtractionPromptProvider:
    """根据来源 Agent 类型提供对应的内置会话后记忆提取提示词。"""

    async def load(self, target: AgentTarget) -> str:
        """返回与来源 Agent 类型匹配的内置提示词。"""
        return self._resolve_prompt(target)

    @staticmethod
    def _resolve_prompt(target: AgentTarget) -> str:
        """为 Claw 选择专用提示词，其他 Agent 使用通用提示词。"""
        if target.provider_type == AgentProviderType.CLAW:
            return CLAW_MEMORY_EXTRACTION_PROMPT
        return DEFAULT_MEMORY_EXTRACTION_PROMPT


__all__ = ["MemoryExtractionPromptProvider"]
