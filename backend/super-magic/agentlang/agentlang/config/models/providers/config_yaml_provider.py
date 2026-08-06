"""
config.yaml 模型服务商

从 config.yaml 的 providers/model_profiles 段读取本地模型配置，无网络请求。
ConfigYamlProvider 是配置源，内部 providers.* 才是真正的本地服务商。
"""
from typing import Callable, List, Optional

from agentlang.config.config import config
from agentlang.config.models.model_catalog import ModelCatalog
from agentlang.config.models.model_config import ModelConfig
from agentlang.config.models.provider_interface import ModelProvider
from agentlang.config.models.provider_config import ProviderConfig
from agentlang.logger import get_logger

logger = get_logger(__name__)

PROVIDER_TYPE = "config.yaml"
PROVIDER_PRIORITY = 2

# model_filter 类型：接收 ModelConfig，返回 True 表示该模型应被跳过
ModelFilterFunc = Callable[[ModelConfig], bool]


class ConfigYamlProvider(ModelProvider):
    """从 config.yaml 的 providers 段加载模型配置"""

    def __init__(self, model_filter: Optional[ModelFilterFunc] = None) -> None:
        """初始化 ConfigYamlProvider

        Args:
            model_filter: 可选的模型过滤函数。接收 ModelConfig，返回 True 表示应跳过该模型。
                         未提供时不做任何过滤。
        """
        self._model_filter = model_filter

    @property
    def provider_type(self) -> str:
        return PROVIDER_TYPE

    @property
    def priority(self) -> int:
        return PROVIDER_PRIORITY

    async def load(self) -> List[ModelConfig]:
        """读取 config.yaml 中的所有本地模型入口

        Returns:
            List[ModelConfig]: 解析成功的模型列表，单个解析失败时跳过并记录日志
        """
        providers_dict = config.get("providers", {})
        if not isinstance(providers_dict, dict):
            logger.warning("config.yaml 'providers' section is not a dict, skipping")
            return []

        model_catalog = ModelCatalog(config.get("model_profiles", {}))
        result: List[ModelConfig] = []
        skipped: List[str] = []

        for provider_id, provider_dict in providers_dict.items():
            if not isinstance(provider_dict, dict):
                logger.warning(f"Provider '{provider_id}' config is not a dict, skipping")
                continue
            try:
                provider = ProviderConfig.from_dict(
                    str(provider_id),
                    provider_dict,
                    default_priority=PROVIDER_PRIORITY,
                )
                for model_id, provider_model in provider.models.items():
                    profile = model_catalog.resolve(
                        profile=provider_model.profile,
                        api_model=provider_model.api_model,
                        model_type=provider_model.type,
                    )
                    mc = ModelConfig.from_provider_model_and_profile(
                        provider=provider,
                        provider_model=provider_model,
                        profile=profile,
                        provider_source=PROVIDER_TYPE,
                    )
                    if self._model_filter and self._model_filter(mc):
                        skipped.append(model_id)
                        continue
                    result.append(mc)
            except Exception as e:
                logger.error(f"Failed to parse provider '{provider_id}' from config.yaml: {e}")

        if skipped:
            logger.info(f"Skipped {len(skipped)} models from config.yaml (filtered): {skipped}")

        logger.debug(f"ConfigYamlProvider loaded {len(result)} models from config.yaml")
        return result
