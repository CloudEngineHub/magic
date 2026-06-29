"""
config.yaml AI 能力配置 provider。

从 config.yaml 的 ai_abilities 段读取本地兜底配置，不访问网络。
"""
from typing import Callable, Dict, List, Optional, Any

from agentlang.config.ai_abilities.ability_config import AIAbilityConfig
from agentlang.config.ai_abilities.provider_interface import AIAbilityProvider
from agentlang.config.config import config
from agentlang.logger import get_logger

logger = get_logger(__name__)

PROVIDER_TYPE = "config.yaml"
PROVIDER_PRIORITY = 2

AIAbilityConfigFactory = Callable[[str, Dict[str, Any], str, int], Optional[AIAbilityConfig]]


class ConfigYamlAIAbilityProvider(AIAbilityProvider):
    """从 config.yaml 加载 AI 能力配置。"""

    def __init__(self, ability_config_factory: AIAbilityConfigFactory):
        """初始化 config.yaml AI 能力配置 provider。"""
        self._ability_config_factory = ability_config_factory

    @property
    def provider_type(self) -> str:
        """返回 provider 类型标识。"""
        return PROVIDER_TYPE

    @property
    def priority(self) -> int:
        """返回本地配置优先级。"""
        return PROVIDER_PRIORITY

    async def load(self) -> List[AIAbilityConfig]:
        """读取 config.yaml 中的 ai_abilities 配置。"""
        abilities_dict = config.get("ai_abilities", {})
        if not isinstance(abilities_dict, dict):
            logger.warning("config.yaml 'ai_abilities' section is not a dict, skipping")
            return []

        result: List[AIAbilityConfig] = []
        for ability_key, ability_dict in abilities_dict.items():
            if not isinstance(ability_dict, dict):
                logger.warning(f"AI ability '{ability_key}' config is not a dict, skipping")
                continue
            try:
                ability_config = self._ability_config_factory(
                    str(ability_key),
                    ability_dict,
                    PROVIDER_TYPE,
                    self.priority,
                )
                if ability_config is not None:
                    result.append(ability_config)
            except Exception as e:
                logger.error(f"Failed to parse AI ability '{ability_key}' from config.yaml: {e}")

        logger.debug(f"ConfigYamlAIAbilityProvider loaded {len(result)} abilities from config.yaml")
        return result
