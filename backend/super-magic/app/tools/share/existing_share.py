"""已有分享的复用、选择和安全更新配置合并。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace
from typing import cast

from agentlang.context.tool_context import ToolContext
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.result import ShareResult

from .access import share_type_name
from .models import (
    AccessType,
    ShareCandidate,
    ShareCreateOptions,
    ShareCreationResult,
    ShareErrorInfo,
    ShareOperation,
    ShareServiceError,
    ShareTarget,
    TeamScope,
    normalize_optional_resource_id,
    normalize_resource_id,
)
from .service_common import raise_if_interrupted


async def select_resource_id(
    tool_context: ToolContext,
    similar: Sequence[ShareResult],
    requested_resource_id: str | None,
    target: ShareTarget,
    update_existing: bool,
) -> tuple[str, ShareOperation]:
    """为创建生成新 ID，或校验更新时选定的已有 ID。"""
    requested = normalize_optional_resource_id(requested_resource_id)
    candidates = tuple(_candidate(item) for item in similar if item.resource_id)

    if not candidates:
        if requested is not None:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="resource_id_not_found",
                    message="The requested resource_id is not an active similar share. Omit it to create a new share.",
                    target=target,
                    resource_id=requested,
                )
            )
        if update_existing:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="existing_share_not_found",
                    message="No active similar share exists to update. Leave update_existing=false to create one.",
                    target=target,
                )
            )
        await raise_if_interrupted(tool_context)
        generated = await get_magic_service_sdk().share.generate_resource_id_async()
        return normalize_resource_id(generated.id, "invalid_generated_resource_id"), "created"

    if not update_existing:
        raise ShareServiceError(
            ShareErrorInfo(
                code="update_confirmation_required",
                message=(
                    "An active similar share already exists. Use the read-only list tool to reuse it, "
                    "or set update_existing=true to modify it."
                ),
                target=target,
                candidates=candidates,
            )
        )

    if requested is not None:
        if any(candidate.resource_id == requested for candidate in candidates):
            return requested, "updated"
        raise ShareServiceError(
            ShareErrorInfo(
                code="resource_id_not_found",
                message="The requested resource_id is not one of the active similar shares.",
                target=target,
                resource_id=requested,
                candidates=candidates,
            )
        )

    raise ShareServiceError(
        ShareErrorInfo(
            code="resource_id_required_for_update",
            message="Choose an active share from the candidates and pass its resource_id when update_existing=true.",
            target=target,
            candidates=candidates,
        )
    )


def reuse_existing_share(
    similar: Sequence[ShareResult],
    options: ShareCreateOptions,
    target: ShareTarget,
) -> ShareCreationResult | None:
    """无修改意图时复用唯一活动分享，避免创建或更新。"""
    candidates = [item for item in similar if item.resource_id]
    if not candidates:
        if options.resource_id is not None and not options.update_existing:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="update_confirmation_required",
                    message="resource_id is only valid when update_existing=true.",
                    target=target,
                )
            )
        return None

    if options.update_existing:
        return None

    if options.resource_id is not None:
        raise ShareServiceError(
            ShareErrorInfo(
                code="update_confirmation_required",
                message="Set update_existing=true before modifying an existing share.",
                target=target,
                candidates=tuple(_candidate(item) for item in candidates),
            )
        )

    if len(candidates) > 1:
        candidate_items = tuple(_candidate(item) for item in candidates)
        raise ShareServiceError(
            ShareErrorInfo(
                code="ambiguous_share",
                message=_ambiguous_share_message(candidate_items),
                target=target,
                candidates=candidate_items,
            )
        )
    return _build_reused_result(candidates[0], target)


def effective_update_options(
    options: ShareCreateOptions,
    existing: ShareResult | None,
    target: ShareTarget,
) -> ShareCreateOptions:
    """更新时只覆盖用户显式传入的字段，其余配置沿用已有分享。"""
    if not options.update_existing or existing is None:
        return options

    provided = options.provided_fields
    existing_access = _share_access_type(existing, target)
    access_type = options.access_type if "access_type" in provided else existing_access

    password = options.password
    if "password" not in provided:
        password = existing.password if access_type == "password" and existing_access == "password" else None

    existing_user_ids, existing_department_ids = _existing_team_targets(existing)
    if access_type == "team":
        team_scope = options.team_scope if "team_scope" in provided else _existing_team_scope(existing, existing_access)
        if team_scope == "designated":
            team_user_ids = (
                options.team_user_ids
                if "team_user_ids" in provided
                else existing_user_ids
                if existing_access == "team"
                else ()
            )
            team_department_ids = (
                options.team_department_ids
                if "team_department_ids" in provided
                else existing_department_ids
                if existing_access == "team"
                else ()
            )
        else:
            team_user_ids = ()
            team_department_ids = ()
    else:
        team_scope = options.team_scope if "team_scope" in provided else "all"
        team_user_ids = options.team_user_ids if "team_user_ids" in provided else ()
        team_department_ids = options.team_department_ids if "team_department_ids" in provided else ()

    extra = existing.extra if isinstance(existing.extra, Mapping) else {}
    return replace(
        options,
        access_type=access_type,
        password=password,
        team_scope=team_scope,
        team_user_ids=team_user_ids,
        team_department_ids=team_department_ids,
        expire_days=options.expire_days if "expire_days" in provided else existing.expire_days,
        allow_copy=(
            options.allow_copy
            if "allow_copy" in provided
            else _existing_extra_bool(extra, "allow_copy_project_files", options.allow_copy)
        ),
        show_original_info=(
            options.show_original_info
            if "show_original_info" in provided
            else _existing_extra_bool(extra, "show_original_info", options.show_original_info)
        ),
        show_file_list=(
            options.show_file_list
            if "show_file_list" in provided
            else _existing_extra_bool(extra, "view_file_list", options.show_file_list)
        ),
        hide_super_magic_watermark=(
            options.hide_super_magic_watermark
            if "hide_super_magic_watermark" in provided
            else _existing_extra_bool(
                extra,
                "hide_created_by_super_magic",
                options.hide_super_magic_watermark,
            )
        ),
        allow_download=(
            options.allow_download
            if "allow_download" in provided
            else _existing_extra_bool(
                extra,
                "allow_download_project_file",
                options.allow_download,
            )
        ),
        immersive=(
            options.immersive
            if "immersive" in provided
            else _existing_extra_bool(extra, "pure_mode", options.immersive)
        ),
    )


def find_share(items: Sequence[ShareResult], resource_id: str, target: ShareTarget) -> ShareResult:
    """取得已由候选选择流程验证过的活动分享。"""
    for item in items:
        if item.resource_id == resource_id:
            return item
    raise ShareServiceError(
        ShareErrorInfo(
            code="existing_share_not_found",
            message="The selected active share could not be loaded for update.",
            target=target,
            resource_id=resource_id,
        )
    )


def _build_reused_result(result: ShareResult, target: ShareTarget) -> ShareCreationResult:
    resource_id = normalize_resource_id(result.resource_id, "invalid_result_resource_id")
    share_url = (result.share_url or "").strip()
    if not share_url:
        raise ShareServiceError(
            ShareErrorInfo(
                code="share_url_missing",
                message="The existing share was found, but Magic Service did not return share_url. Check MAGIC_WEB_URL.",
                target=target,
                resource_id=resource_id,
            )
        )
    return ShareCreationResult(
        operation="reused",
        target=target,
        share_url=share_url,
        resource_id=resource_id,
        resource_type=result.resource_type,
        resource_name=result.resource_name,
        access_type=_share_access_type(result, target),
        password=result.password if result.has_password or result.is_password_enabled else None,
        expire_days=result.expire_days,
        expire_at=result.expire_at,
    )


def _share_access_type(result: ShareResult, target: ShareTarget) -> AccessType:
    access_type = share_type_name(result.share_type)
    if access_type not in {"password", "team", "public"}:
        raise ShareServiceError(
            ShareErrorInfo(
                code="unsupported_access_type",
                message="The existing share uses an unsupported access type and cannot be updated safely.",
                target=target,
                resource_id=result.resource_id,
            )
        )
    return cast(AccessType, access_type)


def _existing_team_scope(result: ShareResult, existing_access: AccessType) -> TeamScope:
    if existing_access == "team" and result.share_range in {"all", "designated"}:
        return cast(TeamScope, result.share_range)
    return "all"


def _existing_team_targets(result: ShareResult) -> tuple[tuple[str, ...], tuple[str, ...]]:
    user_ids: list[str] = []
    department_ids: list[str] = []
    for item in result.target_ids:
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


def _existing_extra_bool(extra: Mapping[str, object], key: str, default: bool) -> bool:
    value = extra.get(key)
    return value if isinstance(value, bool) else default


def _candidate(result: ShareResult) -> ShareCandidate:
    return ShareCandidate(
        resource_id=result.resource_id,
        resource_name=result.resource_name,
        access_type=share_type_name(result.share_type),
        expire_days=result.expire_days,
        expire_at=result.expire_at,
    )


def _ambiguous_share_message(candidates: Sequence[ShareCandidate]) -> str:
    lines = [
        "Multiple active shares match this target. Ask the user which share to update, then pass its resource_id:",
    ]
    for candidate in candidates:
        name = candidate.resource_name or "unnamed share"
        validity = f"{candidate.expire_days} day(s)" if candidate.expire_days else "permanent or unspecified"
        lines.append(
            f"- resource_id={candidate.resource_id}; name={name}; access={candidate.access_type}; validity={validity}"
        )
    return "\n".join(lines)


__all__ = [
    "effective_update_options",
    "find_share",
    "reuse_existing_share",
    "select_resource_id",
]
