"""分享查询工具共用参数。"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from app.tools.core import BaseToolParams


class BaseListShareParams(BaseToolParams):
    """三类分享列表工具共用的分页和过滤参数。"""

    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "expired", "deleted", "all"] = Field(
        "active",
        description=(
            "Share status to list. Active shares are the default. "
            "Expired includes shares that passed their expiry time or were manually disabled."
        ),
    )
    keyword: str | None = Field(
        None,
        max_length=255,
        description="Optional name keyword for browsing shares.",
    )
    page: int = Field(1, ge=1, description="Page number, starting at 1.")
    page_size: int = Field(20, ge=1, le=100, description="Number of shares to return, from 1 to 100.")

    @classmethod
    def model_json_schema_clean(cls, **kwargs: object) -> dict[str, object]:
        """保留所有列表参数的可选语义，避免通用 Schema 回退误标必填。"""
        schema = super().model_json_schema_clean(**kwargs)
        schema["required"] = []
        return schema


__all__ = ["BaseListShareParams"]
