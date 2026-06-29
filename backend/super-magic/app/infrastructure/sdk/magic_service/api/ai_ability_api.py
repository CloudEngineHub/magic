"""
AI Ability API

API implementation for sandbox AI ability runtime config endpoints in Magic Service.
"""

from ..kernel.magic_service_api import MagicServiceAbstractApi
from ..parameter.ai_ability_runtime_config_parameter import AiAbilityRuntimeConfigParameter
from ..result.ai_ability_runtime_config_result import AiAbilityRuntimeConfigResult

_BASE_PATH = "/api/v1/open-api/sandbox/ai-abilities"


class AiAbilityApi(MagicServiceAbstractApi):
    """AI ability runtime config API for Magic Service."""

    async def get_runtime_config_async(
        self,
        parameter: AiAbilityRuntimeConfigParameter,
    ) -> AiAbilityRuntimeConfigResult:
        """
        Get AI ability runtime config for Super Magic.

        Args:
            parameter: Runtime config query parameter.

        Returns:
            AiAbilityRuntimeConfigResult containing ai_abilities.
        """
        data = await self.request_by_parameter_async(parameter, "GET", f"{_BASE_PATH}/runtime-config")
        return AiAbilityRuntimeConfigResult(data)
