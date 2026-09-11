"""Magic Service 动态配置初始化启动器。"""

from agentlang.config.ai_abilities.ability_config_manager import ai_ability_config_manager
from agentlang.config.models.model_config_manager import model_config_manager
from app.core.ai_ability_providers.magic_service_provider import MagicServiceAIAbilityProvider
from app.core.context.agent_context import AgentContext
from app.core.entity.message.client_message import InitClientMessage
from app.core.model_providers.magic_service_provider import MagicServiceProvider
from app.service.init.initializer import InitExecutionMode


class ModelConfigInitializer:
    """加载 Magic Service 模型列表。"""

    name = "magic-service-models"
    order = 100
    mode = InitExecutionMode.PARALLEL

    async def run(self, context: AgentContext) -> None:
        """刷新模型配置。"""
        await model_config_manager.refresh_provider(MagicServiceProvider())


class AIAbilityConfigInitializer:
    """加载 Magic Service AI 能力和全局系统提示词。"""

    name = "magic-service-ai-abilities"
    order = 100
    mode = InitExecutionMode.PARALLEL

    def __init__(self, init_message: InitClientMessage) -> None:
        """保存本次 init 消息。"""
        self._init_message = init_message

    async def run(self, context: AgentContext) -> None:
        """刷新 AI 能力配置并写入全局系统提示词。"""
        provider = MagicServiceAIAbilityProvider(
            (self._init_message.dynamic_config or {}).get("ai_abilities")
        )
        await ai_ability_config_manager.refresh_provider(provider)
        if provider.is_loaded_successfully():
            context.set_global_system_prompt(provider.get_global_system_prompt())
