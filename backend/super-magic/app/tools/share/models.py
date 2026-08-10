"""分享工具使用的强类型领域模型。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

AccessType = Literal["password", "team", "public"]
TeamScope = Literal["all", "designated"]
ShareTarget = Literal["files", "project", "topic", "share"]
ShareOperation = Literal["created", "updated", "reused"]
ShareListStatus = Literal["active", "expired", "deleted", "disabled", "unknown"]

_RESOURCE_ID_PATTERN = re.compile(r"^\d{1,64}$")


@dataclass(frozen=True, slots=True)
class ShareCreateOptions:
    """三个创建工具共用的内部配置，不直接暴露给 Agent。"""

    access_type: AccessType = "password"
    password: str | None = None
    team_scope: TeamScope = "all"
    team_user_ids: tuple[str, ...] = ()
    team_department_ids: tuple[str, ...] = ()
    expire_days: int | None = None
    allow_copy: bool = True
    show_original_info: bool = True
    show_file_list: bool = True
    hide_super_magic_watermark: bool = False
    allow_download: bool = True
    immersive: bool = False
    resource_id: str | None = None
    update_existing: bool = False
    provided_fields: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class ShareUpdateOptions:
    """已有分享的扁平局部更新配置，不直接暴露给 Agent。"""

    share_name: str | None = None
    access_type: AccessType | None = None
    password: str | None = None
    regenerate_password: bool = False
    team_scope: TeamScope | None = None
    team_user_ids: tuple[str, ...] | None = None
    team_department_ids: tuple[str, ...] | None = None
    expire_days: int | None = None
    make_permanent: bool = False
    show_original_info: bool | None = None
    allow_download: bool | None = None
    file_paths: tuple[str, ...] | None = None
    entry_file_path: str | None = None
    allow_copy: bool | None = None
    show_file_list: bool | None = None
    hide_super_magic_watermark: bool | None = None
    immersive: bool | None = None


@dataclass(frozen=True, slots=True)
class ShareDetail:
    """读取或更新后返回给工具层的完整扁平分享配置。"""

    resource_id: str
    resource_type: int
    target: ShareTarget
    status: ShareListStatus
    share_url: str
    share_name: str
    access_type: AccessType
    password: str | None
    team_scope: TeamScope | None
    team_user_ids: tuple[str, ...]
    team_department_ids: tuple[str, ...]
    expire_days: int | None
    expire_at: str | None
    project_id: str | None
    default_open_file_id: str | None
    main_file_name: str | None
    file_ids: tuple[str, ...]
    allow_copy: bool
    show_original_info: bool
    show_file_list: bool
    hide_super_magic_watermark: bool
    allow_download: bool
    immersive: bool


@dataclass(frozen=True, slots=True)
class ResolvedShareFile:
    """已校验且已取得 MagicFS 文件 ID 的工作区文件。"""

    requested_path: str
    relative_path: str
    absolute_path: Path
    file_id: str


@dataclass(frozen=True, slots=True)
class ShareCandidate:
    """相似分享候选，用于让 Agent 请求用户明确选择。"""

    resource_id: str
    resource_name: str
    access_type: str
    expire_days: int | None
    expire_at: str | None


@dataclass(frozen=True, slots=True)
class ShareCreationResult:
    """创建或更新分享后的稳定内部结果。"""

    operation: ShareOperation
    target: ShareTarget
    share_url: str
    resource_id: str
    resource_type: int
    resource_name: str
    access_type: AccessType
    password: str | None
    expire_days: int | None
    expire_at: str | None


@dataclass(frozen=True, slots=True)
class ShareListItem:
    """查询工具返回的单条分享摘要。"""

    resource_id: str
    resource_name: str
    resource_type: int
    share_url: str | None
    access_type: str
    status: ShareListStatus
    has_password: bool
    password: str | None
    expire_days: int | None
    expire_at: str | None
    project_id: str | None
    project_name: str | None
    default_open_file_id: str | None
    view_count: int
    share_project: bool
    file_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ShareListResult:
    """查询工具的分页结果。"""

    target: ShareTarget
    items: tuple[ShareListItem, ...]
    total: int
    page: int
    page_size: int
    exact: bool = False


@dataclass(frozen=True, slots=True)
class ShareDeletionResult:
    """删除请求完成后的幂等结果。"""

    resource_id: str


@dataclass(frozen=True, slots=True)
class ShareErrorInfo:
    """模型错误正文与用户展示所需的稳定错误信息。"""

    code: str
    message: str
    target: ShareTarget | None = None
    path: str | None = None
    resource_id: str | None = None
    candidates: tuple[ShareCandidate, ...] = ()


class ShareServiceError(ValueError):
    """分享领域错误。"""

    def __init__(self, info: ShareErrorInfo) -> None:
        super().__init__(info.message)
        self.info = info


def normalize_optional_resource_id(value: str | None) -> str | None:
    """规范化可选资源 ID。"""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return normalize_resource_id(stripped, "invalid_resource_id")


def normalize_resource_id(value: str, error_code: str) -> str:
    """校验 Magic Service 使用的数字资源 ID。"""
    normalized = value.strip()
    if not _RESOURCE_ID_PATTERN.fullmatch(normalized):
        raise ShareServiceError(
            ShareErrorInfo(code=error_code, message="Resource IDs must be numeric strings up to 64 characters.")
        )
    return normalized


__all__ = [
    "AccessType",
    "ResolvedShareFile",
    "ShareCandidate",
    "ShareCreateOptions",
    "ShareCreationResult",
    "ShareDeletionResult",
    "ShareDetail",
    "ShareErrorInfo",
    "ShareListItem",
    "ShareListResult",
    "ShareListStatus",
    "ShareOperation",
    "ShareServiceError",
    "ShareTarget",
    "ShareUpdateOptions",
    "TeamScope",
    "normalize_optional_resource_id",
    "normalize_resource_id",
]
