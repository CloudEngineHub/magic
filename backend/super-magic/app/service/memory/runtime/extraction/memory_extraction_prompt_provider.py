"""会话后记忆提取提示词选择服务。"""

from __future__ import annotations

from pathlib import Path

from app.core.models.agent_runtime import AgentProviderType, AgentTarget
from app.utils.async_file_utils import async_read_text


class MemoryExtractionPromptProvider:
    """根据来源 Agent 类型加载对应的会话后记忆提取提示词。"""

    _DEFAULT_PROMPT_PATH = Path(__file__).with_name("memory_after_run_extraction.prompt")
    _CLAW_PROMPT_PATH = Path(__file__).with_name("memory_after_run_claw_extraction.prompt")

    async def load(self, target: AgentTarget) -> str:
        """加载与来源 Agent 类型匹配的提示词。"""
        prompt_path = self._resolve_prompt_path(target)
        return (await async_read_text(prompt_path)).strip()

    @classmethod
    def _resolve_prompt_path(cls, target: AgentTarget) -> Path:
        """为 Claw 选择专用提示词，其他 Agent 使用通用提示词。"""
        if target.provider_type == AgentProviderType.CLAW:
            return cls._CLAW_PROMPT_PATH
        return cls._DEFAULT_PROMPT_PATH


__all__ = ["MemoryExtractionPromptProvider"]
