"""
Magic Service AI 能力配置 provider。

从 magic-service sandbox runtime-config 接口加载新版 super-magic 可消费的
ai_abilities 结构。
"""
from typing import List

from agentlang.config.ai_abilities.ability_config import AIAbilityConfig
from agentlang.config.ai_abilities.provider_interface import AIAbilityProvider, RefreshPolicy
from agentlang.logger import get_logger
from app.core.ai_ability_configs import create_ai_ability_config
from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk_with_defaults
from app.infrastructure.sdk.magic_service.parameter.ai_ability_runtime_config_parameter import (
    AiAbilityRuntimeConfigParameter,
)

logger = get_logger(__name__)

PROVIDER_TYPE = "magic-service"
PROVIDER_PRIORITY = 3

_REFRESH_USE_COUNT = 50
_REFRESH_INTERVAL_SECONDS = 3600


class MagicServiceAIAbilityProvider(AIAbilityProvider):
    """从 magic-service 加载 AI 能力运行时配置。"""

    @property
    def provider_type(self) -> str:
        """返回 provider 类型标识。"""
        return PROVIDER_TYPE

    @property
    def priority(self) -> int:
        """返回 magic-service 优先级。"""
        return PROVIDER_PRIORITY

    @property
    def refresh_policy(self) -> RefreshPolicy:
        """返回自动刷新策略。"""
        return RefreshPolicy(
            use_count=_REFRESH_USE_COUNT,
            interval_seconds=_REFRESH_INTERVAL_SECONDS,
        )

    async def load(self) -> List[AIAbilityConfig]:
        """调用 magic-service runtime-config 接口并解析 AI 能力配置。"""
        try:
            sdk = create_magic_service_sdk_with_defaults()
            runtime_config = await sdk.ai_ability.get_runtime_config_async(
                AiAbilityRuntimeConfigParameter()
            )
            ability_items = runtime_config.get_ai_abilities()
        except Exception as e:
            logger.warning(f"MagicServiceAIAbilityProvider: failed to load runtime config: {e}")
            return []

        result: List[AIAbilityConfig] = []
        for ability_key, ability_config_item in ability_items.items():
            if not ability_config_item.enabled:
                logger.debug(
                    f"MagicServiceAIAbilityProvider: ability '{ability_key}' is disabled, skipping"
                )
                continue

            try:
                parsed_config = create_ai_ability_config(
                    ability_key,
                    ability_config_item.to_dict(),
                    PROVIDER_TYPE,
                    self.priority,
                )
                if parsed_config is not None:
                    result.append(parsed_config)
            except Exception as e:
                logger.warning(
                    f"MagicServiceAIAbilityProvider: failed to parse ability '{ability_key}': {e}"
                )

        logger.info(f"MagicServiceAIAbilityProvider loaded {len(result)} abilities")
        return result
