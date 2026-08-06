"""三个分享更新工具共用的扁平参数。"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from app.tools.core import BaseToolParams

from .models import ShareUpdateOptions


class BaseUpdateShareParams(BaseToolParams):
    """已有分享支持的通用局部更新参数。"""

    model_config = ConfigDict(extra="forbid")

    share_ref: str = Field(
        ...,
        min_length=1,
        description=(
            "Active share resource ID. For a topic share, pass its topic ID directly. "
            "A complete /share/files/{id} or /share/topic/{id} URL is also accepted."
        ),
    )
    share_name: str | None = Field(
        None,
        max_length=255,
        description="New share title. Omit to keep the current title.",
    )
    access_type: Literal["password", "team", "public"] | None = Field(
        None,
        description=(
            "New access method. Omit to keep the current method. Use public only after the user explicitly accepts "
            "that anyone with the link can access the share."
        ),
    )
    password: str | None = Field(
        None,
        min_length=4,
        max_length=32,
        description=(
            "New password. Omit to keep the current password, or to generate one automatically when changing a "
            "non-password share to password access. Do not combine with regenerate_password."
        ),
    )
    regenerate_password: bool = Field(
        False,
        description=(
            "Generate a new secure password. Use only for password access and do not combine with password."
        ),
    )
    team_scope: Literal["all", "designated"] | None = Field(
        None,
        description="New team access scope. Omit to keep the current scope.",
    )
    team_user_ids: list[str] | None = Field(
        None,
        description="Complete replacement list of allowed user IDs for designated team access. Omit to keep it.",
    )
    team_department_ids: list[str] | None = Field(
        None,
        description=(
            "Complete replacement list of allowed department IDs for designated team access. Omit to keep it."
        ),
    )
    expire_days: int | None = Field(
        None,
        ge=1,
        le=365,
        description="New validity in days from 1 to 365. Omit to keep the current expiration.",
    )
    make_permanent: bool = Field(
        False,
        description="Clear the current expiration and make the share permanent. Do not combine with expire_days.",
    )
    show_original_info: bool | None = Field(
        None,
        description="Whether to show original author information. Omit to keep the current setting.",
    )
    allow_download: bool | None = Field(
        None,
        description="Whether viewers may download or export shared files. Omit to keep the current setting.",
    )

    @classmethod
    def model_json_schema_clean(cls, **kwargs: object) -> dict[str, object]:
        """只把 share_ref 暴露为必填，其他字段均表示可选局部修改。"""
        schema = super().model_json_schema_clean(**kwargs)
        schema["required"] = ["share_ref"]
        return schema


def build_update_options(
    params: BaseUpdateShareParams,
    *,
    file_paths: list[str] | None = None,
    entry_file_path: str | None = None,
    allow_copy: bool | None = None,
    show_file_list: bool | None = None,
    hide_super_magic_watermark: bool | None = None,
    immersive: bool | None = None,
) -> ShareUpdateOptions:
    """把 Agent 可见的扁平参数转换为强类型局部更新配置。"""
    return ShareUpdateOptions(
        share_name=params.share_name,
        access_type=params.access_type,
        password=params.password,
        regenerate_password=params.regenerate_password,
        team_scope=params.team_scope,
        team_user_ids=tuple(params.team_user_ids) if params.team_user_ids is not None else None,
        team_department_ids=(
            tuple(params.team_department_ids) if params.team_department_ids is not None else None
        ),
        expire_days=params.expire_days,
        make_permanent=params.make_permanent,
        show_original_info=params.show_original_info,
        allow_download=params.allow_download,
        file_paths=tuple(file_paths) if file_paths is not None else None,
        entry_file_path=entry_file_path,
        allow_copy=allow_copy,
        show_file_list=show_file_list,
        hide_super_magic_watermark=hide_super_magic_watermark,
        immersive=immersive,
    )


__all__ = ["BaseUpdateShareParams", "build_update_options"]
