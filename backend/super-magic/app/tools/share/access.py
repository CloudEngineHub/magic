"""分享访问方式与前端高级选项的领域映射。"""

from __future__ import annotations

import secrets
import string
from collections.abc import Sequence
from dataclasses import dataclass

from app.infrastructure.sdk.magic_service.parameter import ShareExtraParameter, TargetId

from .models import ShareCreateOptions, ShareErrorInfo, ShareServiceError, ShareTarget

SHARE_TYPE_TEAM = 2
SHARE_TYPE_PUBLIC = 4
SHARE_TYPE_PASSWORD = 5

PASSWORD_LENGTH = 12
MAX_ID_LENGTH = 64


@dataclass(frozen=True, slots=True)
class PreparedAccess:
    """已转换为 Magic Service 参数的访问控制。"""

    share_type: int
    password: str | None
    share_range: str | None
    target_ids: list[TargetId] | None


def prepare_access(options: ShareCreateOptions, target: ShareTarget) -> PreparedAccess:
    """校验访问方式并生成 ShareApi 所需的权限字段。"""
    user_ids = normalize_target_ids(options.team_user_ids)
    department_ids = normalize_target_ids(options.team_department_ids)

    if options.access_type == "password":
        if user_ids or department_ids or options.team_scope != "all":
            raise ShareServiceError(
                ShareErrorInfo(
                    code="team_settings_without_team_access",
                    message="Team recipient settings are only valid when access_type is team.",
                    target=target,
                )
            )
        password = options.password or generate_password()
        return PreparedAccess(SHARE_TYPE_PASSWORD, password, None, None)

    if options.password is not None:
        raise ShareServiceError(
            ShareErrorInfo(
                code="password_without_password_access",
                message="password is only valid when access_type is password.",
                target=target,
            )
        )

    if options.access_type == "public":
        if user_ids or department_ids or options.team_scope != "all":
            raise ShareServiceError(
                ShareErrorInfo(
                    code="team_settings_without_team_access",
                    message="Team recipient settings are only valid when access_type is team.",
                    target=target,
                )
            )
        return PreparedAccess(SHARE_TYPE_PUBLIC, None, None, None)

    if options.team_scope == "designated" and not (user_ids or department_ids):
        raise ShareServiceError(
            ShareErrorInfo(
                code="team_targets_required",
                message="Designated team sharing requires at least one team_user_id or team_department_id.",
                target=target,
            )
        )
    if options.team_scope == "all" and (user_ids or department_ids):
        raise ShareServiceError(
            ShareErrorInfo(
                code="team_targets_not_allowed",
                message="team_user_ids and team_department_ids require team_scope=designated.",
                target=target,
            )
        )

    targets = [TargetId("User", item) for item in user_ids]
    targets.extend(TargetId("Department", item) for item in department_ids)
    return PreparedAccess(SHARE_TYPE_TEAM, None, options.team_scope, targets or None)


def build_share_extra(options: ShareCreateOptions) -> ShareExtraParameter:
    """把创建默认值或已合并的更新配置完整映射到 Magic Service。"""
    return ShareExtraParameter(
        allow_copy_project_files=options.allow_copy,
        show_original_info=options.show_original_info,
        view_file_list=options.show_file_list,
        hide_created_by_super_magic=options.hide_super_magic_watermark,
        allow_download_project_file=options.allow_download,
        pure_mode=options.immersive,
    )


def normalize_target_ids(values: Sequence[str]) -> tuple[str, ...]:
    """去重并校验团队用户或部门 ID。"""
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = value.strip()
        if not item:
            continue
        if len(item) > MAX_ID_LENGTH:
            raise ShareServiceError(
                ShareErrorInfo(code="team_target_invalid", message="Team target IDs must be at most 64 characters.")
            )
        if item not in seen:
            normalized.append(item)
            seen.add(item)
    return tuple(normalized)


def share_type_name(share_type: int) -> str:
    """将 Magic Service 分享类型转换为模型可读的名称。"""
    return {
        SHARE_TYPE_TEAM: "team",
        SHARE_TYPE_PUBLIC: "public",
        SHARE_TYPE_PASSWORD: "password",
    }.get(share_type, "unknown")


def generate_password() -> str:
    """生成符合分享服务基本约束的随机密码。"""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(PASSWORD_LENGTH))


__all__ = [
    "SHARE_TYPE_PASSWORD",
    "SHARE_TYPE_PUBLIC",
    "SHARE_TYPE_TEAM",
    "PreparedAccess",
    "build_share_extra",
    "generate_password",
    "normalize_target_ids",
    "prepare_access",
    "share_type_name",
]
