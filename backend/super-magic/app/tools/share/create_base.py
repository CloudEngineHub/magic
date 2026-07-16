"""三个创建分享工具共用的扁平参数。"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from app.tools.core import BaseToolParams

from .models import ShareCreateOptions


class BaseCreateShareParams(BaseToolParams):
    """创建分享时所有目标都支持的访问与有效期参数。"""

    model_config = ConfigDict(extra="forbid")

    access_type: Literal["password", "team", "public"] = Field(
        "password",
        description=(
            "Access method. Use password by default. Use team for organization members. "
            "Use public only when the user explicitly accepts that anyone with the link can access it."
        ),
    )
    password: str | None = Field(
        None,
        min_length=4,
        max_length=32,
        description=(
            "Password for password access. Omit it to generate a secure password. "
            "Do not provide it for team or public access."
        ),
    )
    team_scope: Literal["all", "designated"] = Field(
        "all",
        description=(
            "Team access scope. Use all for every team member or designated with team_user_ids "
            "and/or team_department_ids. Ignored only when left at all for non-team access."
        ),
    )
    team_user_ids: list[str] = Field(
        default_factory=list,
        description="User IDs allowed to open the share when team_scope is designated.",
    )
    team_department_ids: list[str] = Field(
        default_factory=list,
        description="Department IDs allowed to open the share when team_scope is designated.",
    )
    expire_days: int | None = Field(
        None,
        ge=1,
        le=365,
        description="Validity in days from 1 to 365. Omit for a permanent share.",
    )
    show_original_info: bool = Field(
        True,
        description="Show original author information on the shared page.",
    )
    allow_download: bool = Field(
        True,
        description="Allow viewers to download or export shared files.",
    )
    update_existing: bool = Field(
        False,
        description=(
            "Set true only when the user explicitly wants to modify an existing share. "
            "Leave false to reuse an existing share without changing it."
        ),
    )


def build_share_options(
    params: BaseCreateShareParams,
    *,
    allow_copy: bool,
    show_file_list: bool,
    hide_super_magic_watermark: bool,
    immersive: bool,
    resource_id: str | None,
    update_existing: bool,
) -> ShareCreateOptions:
    """把扁平 Pydantic 参数转换为强类型内部配置。"""
    return ShareCreateOptions(
        access_type=params.access_type,
        password=params.password,
        team_scope=params.team_scope,
        team_user_ids=tuple(params.team_user_ids),
        team_department_ids=tuple(params.team_department_ids),
        expire_days=params.expire_days,
        allow_copy=allow_copy,
        show_original_info=params.show_original_info,
        show_file_list=show_file_list,
        hide_super_magic_watermark=hide_super_magic_watermark,
        allow_download=params.allow_download,
        immersive=immersive,
        resource_id=resource_id,
        update_existing=update_existing,
        provided_fields=frozenset(params.model_fields_set),
    )


__all__ = ["BaseCreateShareParams", "build_share_options"]
