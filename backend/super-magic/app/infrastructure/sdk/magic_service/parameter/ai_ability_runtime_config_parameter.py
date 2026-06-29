"""
AI Ability Runtime Config Parameter

Parameter class for querying Magic Service AI ability runtime config.
"""

from typing import Any, Dict

from agentlang.utils.metadata import MetadataUtil

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter


class AiAbilityRuntimeConfigParameter(MagicServiceAbstractParameter):
    """Parameter for GET /api/v1/open-api/sandbox/ai-abilities/runtime-config."""

    def __init__(self) -> None:
        """Initialize AI ability runtime config parameter."""
        super().__init__()

    def to_body(self) -> Dict[str, Any]:
        """Return request body."""
        return {}

    def to_query_params(self) -> Dict[str, Any]:
        """Return query params."""
        return {}

    def to_headers(self) -> Dict[str, str]:
        """Return headers with Magic/User authorization."""
        headers = super().to_headers()
        MetadataUtil.add_magic_and_user_authorization_headers(headers)
        return headers
