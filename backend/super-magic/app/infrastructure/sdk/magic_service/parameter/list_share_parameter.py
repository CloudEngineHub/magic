"""分享列表查询参数。"""

from __future__ import annotations

from typing import Any

from ..kernel.magic_service_parameter import MagicServiceAbstractParameter

_VALID_FILTER_TYPES = frozenset({"all", "active", "expired", "cancelled"})


class ListShareParameter(MagicServiceAbstractParameter):
    """查询当前用户分享列表的参数。"""

    def __init__(
        self,
        resource_types: list[int],
        *,
        filter_type: str = "active",
        keyword: str | None = None,
        project_id: str | None = None,
        share_project: bool | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> None:
        super().__init__()
        self.resource_types = resource_types
        self.filter_type = filter_type
        self.keyword = keyword
        self.project_id = project_id
        self.share_project = share_project
        self.page = page
        self.page_size = page_size

    def to_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "resource_type": self.resource_types,
            "filter_type": self.filter_type,
            "page": self.page,
            "page_size": self.page_size,
        }
        if self.keyword is not None:
            body["keyword"] = self.keyword
        if self.project_id is not None:
            body["project_id"] = self.project_id
        if self.share_project is not None:
            body["share_project"] = self.share_project
        return body

    def to_query_params(self) -> dict[str, Any]:
        return {}

    def validate(self) -> None:
        super().validate()
        if not self.resource_types or any(item <= 0 for item in self.resource_types):
            raise ValueError("resource_types must contain positive integers")
        if self.filter_type not in _VALID_FILTER_TYPES:
            raise ValueError("filter_type must be all, active, expired, or cancelled")
        if self.keyword is not None and len(self.keyword) > 255:
            raise ValueError("keyword must be at most 255 characters")
        if self.project_id is not None and not self.project_id.isdigit():
            raise ValueError("project_id must be a numeric string")
        if self.page < 1:
            raise ValueError("page must be at least 1")
        if self.page_size < 1 or self.page_size > 100:
            raise ValueError("page_size must be between 1 and 100")


__all__ = ["ListShareParameter"]
