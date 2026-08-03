"""按分享引用读取活动分享的完整配置。"""

from __future__ import annotations

from collections.abc import Mapping
from typing import cast

from agentlang.context.tool_context import ToolContext
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter import GetShareParameter
from app.infrastructure.sdk.magic_service.result import ShareResult

from .access import share_type_name
from .models import (
    AccessType,
    ShareDetail,
    ShareErrorInfo,
    ShareServiceError,
    ShareTarget,
    TeamScope,
    normalize_resource_id,
)
from .service_common import (
    RESOURCE_TYPE_FILE,
    RESOURCE_TYPE_FILE_COLLECTION,
    RESOURCE_TYPE_TOPIC,
    raise_if_interrupted,
    translate_sdk_errors,
)
from .share_ref import parse_share_ref


class ShareDetailService:
    """读取当前用户拥有的单条活动分享。"""

    async def get_share(self, tool_context: ToolContext, share_ref: str) -> ShareDetail:
        return await translate_sdk_errors(self._get_share(tool_context, share_ref))

    async def _get_share(self, tool_context: ToolContext, share_ref: str) -> ShareDetail:
        result = await load_active_share(tool_context, share_ref)
        return build_share_detail(result)


async def load_active_share(tool_context: ToolContext, share_ref: str) -> ShareResult:
    """读取 SDK 原始结果，供详情和更新服务共享。"""
    resource_id = parse_share_ref(share_ref)
    await raise_if_interrupted(tool_context)
    return await get_magic_service_sdk().share.get_share_async(GetShareParameter(resource_id))


def build_share_detail(result: ShareResult) -> ShareDetail:
    """把 SDK 分享结果转换为稳定的扁平配置。"""
    resource_id = normalize_resource_id(result.resource_id, "invalid_result_resource_id")
    target = share_target(result)
    access_type = _access_type(result, target)
    share_url = (result.share_url or "").strip()
    if not share_url:
        raise ShareServiceError(
            ShareErrorInfo(
                code="share_url_missing",
                message="The active share was found without the required share URL. Do not guess or construct a URL.",
                target=target,
                resource_id=resource_id,
            )
        )

    team_scope: TeamScope | None = None
    user_ids: tuple[str, ...] = ()
    department_ids: tuple[str, ...] = ()
    if access_type == "team":
        team_scope = cast(TeamScope, result.share_range) if result.share_range in {"all", "designated"} else "all"
        user_ids, department_ids = _team_targets(result.target_ids)

    extra = result.extra if isinstance(result.extra, Mapping) else {}
    project_id = str(result.project_id).strip() if result.project_id not in (None, "") else None
    default_open_file_id = (
        str(result.default_open_file_id).strip() if result.default_open_file_id not in (None, "") else None
    )
    main_file_name = str(result.main_file_name).strip() if result.main_file_name not in (None, "") else None

    return ShareDetail(
        resource_id=resource_id,
        resource_type=result.resource_type,
        target=target,
        status="active",
        share_url=share_url,
        share_name=result.resource_name,
        access_type=access_type,
        password=result.password if access_type == "password" and result.password else None,
        team_scope=team_scope,
        team_user_ids=user_ids,
        team_department_ids=department_ids,
        expire_days=result.expire_days,
        expire_at=result.expire_at,
        project_id=project_id,
        default_open_file_id=default_open_file_id,
        main_file_name=main_file_name,
        file_ids=tuple(str(file_id) for file_id in result.file_ids),
        allow_copy=_extra_bool(extra, "allow_copy_project_files", True),
        show_original_info=_extra_bool(extra, "show_original_info", True),
        show_file_list=_extra_bool(extra, "view_file_list", True),
        hide_super_magic_watermark=_extra_bool(extra, "hide_created_by_super_magic", False),
        allow_download=_extra_bool(extra, "allow_download_project_file", True),
        immersive=_extra_bool(extra, "pure_mode", False),
    )


def share_target(result: ShareResult) -> ShareTarget:
    """根据服务端资源类型和 share_project 标记确定工具目标。"""
    if result.resource_type == RESOURCE_TYPE_TOPIC:
        return "topic"
    if result.share_project:
        return "project"
    if result.resource_type in {RESOURCE_TYPE_FILE_COLLECTION, RESOURCE_TYPE_FILE}:
        return "files"
    raise ShareServiceError(
        ShareErrorInfo(
            code="unsupported_share_type",
            message="This active share type is not supported by the share management tools.",
            resource_id=result.resource_id,
        )
    )


def _access_type(result: ShareResult, target: ShareTarget) -> AccessType:
    access_type = share_type_name(result.share_type)
    if access_type not in {"password", "team", "public"}:
        raise ShareServiceError(
            ShareErrorInfo(
                code="unsupported_access_type",
                message="This active share uses an unsupported access type.",
                target=target,
                resource_id=result.resource_id,
            )
        )
    return cast(AccessType, access_type)


def _team_targets(items: object) -> tuple[tuple[str, ...], tuple[str, ...]]:
    user_ids: list[str] = []
    department_ids: list[str] = []
    if not isinstance(items, list):
        return (), ()
    for item in items:
        if not isinstance(item, Mapping):
            continue
        target_id = str(item.get("target_id") or "").strip()
        target_type = str(item.get("target_type") or "").strip().lower()
        if not target_id:
            continue
        if target_type == "user":
            user_ids.append(target_id)
        elif target_type == "department":
            department_ids.append(target_id)
    return tuple(user_ids), tuple(department_ids)


def _extra_bool(extra: Mapping[str, object], key: str, default: bool) -> bool:
    value = extra.get(key)
    return value if isinstance(value, bool) else default


__all__ = ["ShareDetailService", "build_share_detail", "load_active_share", "share_target"]
