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


class MemoryAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """后续回合记忆提取使用的运行时配置。"""

    ability_key_value = "memory"


class SkillRerankAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """始终启用的 Skill Candidate 选择能力运行时配置。"""

    ability_key_value = "skill_rerank"


class AgentRerankAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """始终启用的 Agent 搜索排序能力运行时配置。"""

    ability_key_value = "agent_rerank"


class JsonRepairValidationAbilityConfig(ModelIdRequiredAIAbilityConfig):
    """JSON repair candidate validation ability runtime configuration."""

    ability_key_value = "json_repair_validation"
