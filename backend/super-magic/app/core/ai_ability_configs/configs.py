"""
Super Magic 当前支持的 AI 能力运行时配置类。
"""
from app.core.ai_ability_configs.base import ModelIdRequiredAIAbilityConfig


class VisualUnderstandingAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """视觉理解能力运行时配置。"""

    ability_key_value = "visual_understanding"


class SummarizeAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """摘要能力运行时配置。"""

    ability_key_value = "summarize"


class SmartFilenameAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """智能文件名能力运行时配置。"""

    ability_key_value = "smart_filename"


class PurifyAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """内容净化能力运行时配置。"""

    ability_key_value = "purify"


class DeepWriteAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """深度写作能力运行时配置。"""

    ability_key_value = "deep_write"


class CompactAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """上下文压缩能力运行时配置。"""

    ability_key_value = "compact"


class AnalysisAudioAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """音频分析能力运行时配置。"""

    ability_key_value = "analysis_audio"


class VideoUnderstandingAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """视频理解能力运行时配置。"""

    ability_key_value = "video_understanding"


class AgentRerankAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """Agent 搜索排序能力运行时配置。"""

    ability_key_value = "agent_rerank"

    def validate_for_merge(self) -> str | None:
        """允许禁用配置合并，启用时仍要求 model_id。"""
        if not self.enabled:
            return None
        return super().validate_for_merge()
