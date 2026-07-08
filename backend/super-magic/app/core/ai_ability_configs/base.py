"""
AI 能力运行时配置基类。
"""
from typing import Any, ClassVar, Dict, Optional

from agentlang.config.ai_abilities.ability_config import AIAbilityConfig


class BaseAIAbilityConfig(AIAbilityConfig):
    """Super Magic AI 能力运行时配置基类。"""

    ability_key_value: ClassVar[str] = ""

    def __init__(
        self,
        config: Dict[str, Any],
        enabled: bool,
        provider_source: str,
        priority: int,
    ) -> None:
        """初始化 AI 能力运行时配置。"""
        self._config = dict(config)
        self._enabled = enabled
        self._provider_source = provider_source
        self._priority = priority

    @property
    def ability_key(self) -> str:
        """返回能力 key。"""
        return self.ability_key_value

    @property
    def config(self) -> Dict[str, Any]:
        """返回当前配置字典。"""
        return self._config

    @property
    def enabled(self) -> bool:
        """返回该配置是否启用。"""
        return self._enabled

    @property
    def provider_source(self) -> str:
        """返回配置来源。"""
        return self._provider_source

    @property
    def priority(self) -> int:
        """返回配置来源优先级。"""
        return self._priority

    def get(self, key: str, default: Any = None) -> Any:
        """读取配置值。"""
        if key == "enabled":
            return self._enabled
        return self._config.get(key, default)

    def validate_for_merge(self) -> Optional[str]:
        """返回不可合并原因，默认允许合并。"""
        return None

    def merge_with(self, lower_priority_config: Optional[AIAbilityConfig]) -> AIAbilityConfig:
        """与低优先级配置合并。"""
        if lower_priority_config is None:
            return self
        if lower_priority_config.ability_key != self.ability_key:
            return self

        merged_config = dict(lower_priority_config.config)
        for key, value in self._config.items():
            if self._is_present_value(value):
                merged_config[key] = value

        return self.__class__(
            config=merged_config,
            enabled=self.enabled,
            provider_source=self.provider_source,
            priority=self.priority,
        )

    def _is_present_value(self, value: Any) -> bool:
        """判断配置值是否表达了明确覆盖。"""
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
        return True


class ModelIdRequiredAIAbilityConfig(BaseAIAbilityConfig):
    """要求 model_id 非空的 AI 能力运行时配置基类。"""

    def validate_for_merge(self) -> Optional[str]:
        """检查 model_id 是否可用于运行时合并。"""
        if not self.enabled:
            return "ability is disabled"

        model_id = self._config.get("model_id")
        if model_id is None or not str(model_id).strip():
            return "model_id is empty"
        return None
