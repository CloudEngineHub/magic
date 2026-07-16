"""
Magic Service SDK

A complete SDK for interacting with Magic Service APIs.
"""

# ruff: noqa: I001 - this aggregate module keeps API-surface groups readable

from .magic_service import MagicService
from .factory import (
    create_magic_service_sdk,
    create_magic_service_sdk_with_defaults,
    MagicServiceConfigError
)

# API classes
from .api.ai_ability_api import AiAbilityApi
from .api.agent_api import AgentApi
from .api.message_schedule_api import MessageScheduleApi
from .api.oauth2_callback_relay_api import OAuth2CallbackRelayApi
from .api.share_api import ShareApi

# Parameter classes
from .parameter.ai_ability_runtime_config_parameter import AiAbilityRuntimeConfigParameter
from .parameter.get_agent_details_parameter import GetAgentDetailsParameter
from .parameter.tool_execute_parameter import ToolExecuteParameter
from .parameter.search_knowledge_parameter import SearchKnowledgeParameter
from .parameter.message_schedule_parameter import (
    MessageScheduleParameter,
    TimeConfig,
    QueryMessageSchedulesParameter,
    GetMessageScheduleDetailParameter,
    UpdateMessageScheduleParameter,
    DeleteMessageScheduleParameter,
)
from .parameter.oauth2_callback_relay_parameter import OAuth2CallbackRelayParameter
from .parameter.share_resource_id_parameter import ShareResourceIdParameter
from .parameter.create_share_parameter import CreateShareParameter, ShareExtraParameter, TargetId
from .parameter.find_similar_share_parameter import FindSimilarShareParameter
from .parameter.cancel_share_parameter import CancelShareParameter
from .parameter.get_share_parameter import GetShareParameter
from .parameter.list_share_parameter import ListShareParameter
from .parameter.ingest_third_party_message_parameter import IngestThirdPartyMessageParameter

# Result classes
from .result.ai_ability_runtime_config_result import AiAbilityRuntimeConfigItem, AiAbilityRuntimeConfigResult
from .result.agent_details_result import (
    AgentDetailsResult,
    Tool
)
from .result.tool_execute_result import ToolExecuteResult
from .result.search_knowledge_result import SearchKnowledgeResult
from .result.message_schedule_result import (
    MessageScheduleResult,
    MessageScheduleListResult,
    DeleteMessageScheduleResult,
)
from .result.oauth2_callback_relay_result import OAuth2CallbackRelayResult
from .result.share_result import (
    ShareResourceIdResult,
    ShareResult,
    CancelShareResult,
    FindSimilarSharesResult,
    ShareListResult,
)
from .result.ingest_third_party_message_result import IngestThirdPartyMessageResult

# Kernel classes
from .kernel.magic_service_exception import (
    MagicServiceException,
    MagicServiceUnauthorizedException,
    MagicServiceConfigurationError,
    MagicServiceApiError
)

# Import abstract classes from sdk-base
from app.infrastructure.sdk.base import AbstractApi, AbstractParameter, AbstractResult

__version__ = '1.0.0'

__all__ = [  # noqa: RUF022 - 分组顺序属于此聚合模块的既有结构
    # Main API class
    'MagicService',

    # Factory functions
    'create_magic_service_sdk',
    'create_magic_service_sdk_with_defaults',
    'MagicServiceConfigError',

    # API classes
    'AiAbilityApi',
    'AgentApi',
    'MessageScheduleApi',
    'OAuth2CallbackRelayApi',
    'ShareApi',

    # Parameter classes
    'AiAbilityRuntimeConfigParameter',
    'GetAgentDetailsParameter',
    'ToolExecuteParameter',
    'SearchKnowledgeParameter',
    'MessageScheduleParameter',
    'TimeConfig',
    'QueryMessageSchedulesParameter',
    'GetMessageScheduleDetailParameter',
    'UpdateMessageScheduleParameter',
    'DeleteMessageScheduleParameter',
    'OAuth2CallbackRelayParameter',
    'ShareResourceIdParameter',
    'CreateShareParameter',
    'ShareExtraParameter',
    'TargetId',
    'FindSimilarShareParameter',
    'CancelShareParameter',
    'GetShareParameter',
    'ListShareParameter',
    'IngestThirdPartyMessageParameter',

    # Result classes
    'AiAbilityRuntimeConfigResult',
    'AiAbilityRuntimeConfigItem',
    'AgentDetailsResult',
    'ToolExecuteResult',
    'SearchKnowledgeResult',
    'Tool',
    'MessageScheduleResult',
    'MessageScheduleListResult',
    'DeleteMessageScheduleResult',
    'OAuth2CallbackRelayResult',
    'ShareResourceIdResult',
    'ShareResult',
    'CancelShareResult',
    'FindSimilarSharesResult',
    'ShareListResult',
    'IngestThirdPartyMessageResult',

    # Kernel classes
    'MagicServiceException',
    'MagicServiceUnauthorizedException',
    'MagicServiceConfigurationError',
    'MagicServiceApiError',
    'AbstractApi',
    'AbstractParameter',
    'AbstractResult'
]
