"""
Available Agents Parameter

Parameter class for the current user's available agents API
(`/api/v1/open-api/sandbox/agents/me/available`).

Supports server-side keyword search and language-aware names/descriptions.
"""

from typing import Any, Dict, List, Optional

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter


class AvailableAgentsParameter(MagicServiceAbstractParameter):
    """Parameter for the available-agents API (paginated, keyword-searchable)."""

    def __init__(
        self,
        keywords: Optional[List[str]] = None,
        page: int = 1,
        page_size: int = 20,
    ):
        super().__init__()
        self.keywords: List[str] = keywords or []
        self.page: int = page
        self.page_size: int = page_size
        self.language: Optional[str] = self._load_language()

    def to_body(self) -> Dict[str, Any]:
        return {
            "page": self.page,
            "page_size": self.page_size,
            "keywords": self.keywords,
        }

    def to_query_params(self) -> Dict[str, Any]:
        return {}

    def to_headers(self) -> Dict[str, str]:
        headers = super().to_headers()
        if self.language:
            headers["language"] = self.language
        return headers

    def validate(self) -> None:
        super().validate()

    @staticmethod
    def _load_language() -> Optional[str]:
        """Resolve the caller's language from the init client message metadata."""
        try:
            from app.utils.init_client_message_util import InitClientMessageUtil

            full_config = InitClientMessageUtil.get_full_config()
            metadata = full_config.get("metadata", {}) or {}
            language = metadata.get("language")
            return str(language) if language else None
        except Exception:
            return None
