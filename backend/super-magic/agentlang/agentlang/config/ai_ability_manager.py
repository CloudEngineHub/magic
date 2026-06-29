"""
AI 能力配置兼容入口。

新链路由 AIAbilityConfigManager 统一读取 provider 化配置；本类保留旧 import
路径，避免一次性修改所有调用方。
"""
from typing import Any

from agentlang.config.ai_abilities.ability_config_manager import ai_ability_config_manager
from agentlang.config.config import config
from agentlang.logger import get_logger

logger = get_logger(__name__)


class AIAbilityManager:
    """AI 能力配置兼容管理器。"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AIAbilityManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化兼容管理器。"""
        if not hasattr(self, '_initialized'):
            self._initialized = True
            logger.debug("AIAbilityManager initialized")

    def get(
        self,
        ability_key: str,
        config_key: str,
        default: Any = None
    ) -> Any:
        """获取指定 AI 能力的配置值。"""
        if not isinstance(ability_key, str):
            logger.warning(f"ability_key must be string, got {type(ability_key)}")
            return default

        if not isinstance(config_key, str):
            logger.warning(f"config_key must be string, got {type(config_key)}")
            return default

        value = ai_ability_config_manager.get_value(ability_key, config_key, default=None)
        if self._is_valid_value(value):
            logger.info(f"Using provider config for {ability_key}.{config_key}: {value}")
            return value

        logger.debug(f"No configuration found for {ability_key}.{config_key}")
        return default

    def _is_valid_value(self, value: Any) -> bool:
        """判断配置值是否有效。"""
        if value is None:
            return False

        if isinstance(value, str):
            if not value or not value.strip():
                return False

        if isinstance(value, (list, dict)):
            if not value:
                return False

        return True

    def reload(self) -> None:
        """重新加载底层 config.yaml。"""
        logger.info("Reloading AI ability configuration...")
        config.reload_config()
        logger.info("AI ability configuration reloaded")


# Global singleton instance
ai_ability_manager = AIAbilityManager()
