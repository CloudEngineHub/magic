"""按资源 ID 对活动分享执行安全的扁平局部更新。"""

from __future__ import annotations

from dataclasses import dataclass

from agentlang.context.tool_context import ToolContext
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter import CreateShareParameter

from .access import build_share_extra, generate_password, prepare_access
from .detail_service import build_share_detail, load_active_share
from .models import (
    ShareCreateOptions,
    ShareDetail,
    ShareErrorInfo,
    ShareServiceError,
    ShareTarget,
    ShareUpdateOptions,
    TeamScope,
)
from .service_common import RESOURCE_TYPE_FILE_COLLECTION, raise_if_interrupted, translate_sdk_errors
from .workspace import find_entry_file, get_workspace_root, resolve_workspace_file


@dataclass(frozen=True, slots=True)
class _TargetUpdate:
    """按目标类型解析出的可选资源更新字段。"""

    file_ids: list[str] | None = None
    default_open_file_id: str | None = None
    project_id: str | None = None
    share_project: bool | None = None
    resource_type: int | None = None


class ShareUpdateService:
    """更新活动分享，同时保留所有未显式修改的字段。"""

    async def update_file_share(
        self,
        tool_context: ToolContext,
        share_ref: str,
        options: ShareUpdateOptions,
    ) -> ShareDetail:
        return await translate_sdk_errors(self._update_share(tool_context, share_ref, "files", options))

    async def update_project_share(
        self,
        tool_context: ToolContext,
        share_ref: str,
        options: ShareUpdateOptions,
    ) -> ShareDetail:
        return await translate_sdk_errors(self._update_share(tool_context, share_ref, "project", options))

    async def update_topic_share(
        self,
        tool_context: ToolContext,
        share_ref: str,
        options: ShareUpdateOptions,
    ) -> ShareDetail:
        return await translate_sdk_errors(self._update_share(tool_context, share_ref, "topic", options))

    async def _update_share(
        self,
        tool_context: ToolContext,
        share_ref: str,
        expected_target: ShareTarget,
        options: ShareUpdateOptions,
    ) -> ShareDetail:
        _validate_update_options(options, expected_target)
        existing_result = await load_active_share(tool_context, share_ref)
        existing = build_share_detail(existing_result)
        if existing.target != expected_target:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="wrong_share_type",
                    message=(
                        f"The selected share is a {existing.target} share. "
                        f"Use the update tool for that share type instead of {expected_target}."
                    ),
                    target=expected_target,
                    resource_id=existing.resource_id,
                )
            )

        effective_options = _effective_options(existing, options, expected_target)
        access = prepare_access(effective_options, expected_target)
        share_name = _effective_share_name(existing, options)
        target_update = await _target_update(
            tool_context,
            existing,
            options,
            expected_target,
        )

        await raise_if_interrupted(tool_context)
        await get_magic_service_sdk().share.create_share_async(
            CreateShareParameter(
                resource_id=existing.resource_id,
                resource_type=target_update.resource_type or existing_result.resource_type,
                share_type=access.share_type,
                resource_name=share_name,
                password=access.password,
                expire_days=options.expire_days,
                clear_expiration=options.make_permanent,
                share_range=access.share_range,
                target_ids=access.target_ids,
                file_ids=target_update.file_ids,
                project_id=target_update.project_id,
                share_project=target_update.share_project,
                default_open_file_id=target_update.default_open_file_id,
                extra=build_share_extra(effective_options),
                show_share_url=True,
            )
        )

        updated_result = await load_active_share(tool_context, existing.resource_id)
        return build_share_detail(updated_result)


def _validate_update_options(options: ShareUpdateOptions, target: ShareTarget) -> None:
    if options.password is not None and options.regenerate_password:
        raise ShareServiceError(
            ShareErrorInfo(
                code="password_update_conflict",
                message="password and regenerate_password cannot be used together.",
                target=target,
            )
        )
    if options.expire_days is not None and options.make_permanent:
        raise ShareServiceError(
            ShareErrorInfo(
                code="expiration_update_conflict",
                message="expire_days and make_permanent cannot be used together.",
                target=target,
            )
        )
    if options.file_paths is not None and options.entry_file_path is None:
        raise ShareServiceError(
            ShareErrorInfo(
                code="file_paths_require_entry",
                message="entry_file_path is required when replacing file_paths.",
                target=target,
            )
        )
    if not _has_update(options):
        raise ShareServiceError(
            ShareErrorInfo(
                code="no_update_fields",
                message="Provide at least one share setting to change.",
                target=target,
            )
        )


def _has_update(options: ShareUpdateOptions) -> bool:
    return any(
        value is not None
        for value in (
            options.share_name,
            options.access_type,
            options.password,
            options.team_scope,
            options.team_user_ids,
            options.team_department_ids,
            options.expire_days,
            options.show_original_info,
            options.allow_download,
            options.file_paths,
            options.entry_file_path,
            options.allow_copy,
            options.show_file_list,
            options.hide_super_magic_watermark,
            options.immersive,
        )
    ) or options.regenerate_password or options.make_permanent


def _effective_share_name(existing: ShareDetail, options: ShareUpdateOptions) -> str | None:
    if options.share_name is not None:
        share_name = options.share_name.strip()
        if not share_name:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="share_name_required",
                    message="share_name must contain at least one non-whitespace character.",
                    target=existing.target,
                    resource_id=existing.resource_id,
                )
            )
        return share_name

    existing_name = existing.share_name.strip()
    if existing_name:
        return existing_name
    if existing.target == "topic":
        return None
    raise ShareServiceError(
        ShareErrorInfo(
            code="share_name_required",
            message="The existing share has no usable title. Provide share_name to update it.",
            target=existing.target,
            resource_id=existing.resource_id,
        )
    )


def _effective_options(
    existing: ShareDetail,
    update: ShareUpdateOptions,
    target: ShareTarget,
) -> ShareCreateOptions:
    access_type = update.access_type or existing.access_type
    password = _effective_password(existing, update, access_type)

    if access_type == "team":
        team_scope: TeamScope = update.team_scope or (
            existing.team_scope if existing.access_type == "team" and existing.team_scope is not None else "all"
        )
        if team_scope == "all":
            if update.team_user_ids is not None or update.team_department_ids is not None:
                raise ShareServiceError(
                    ShareErrorInfo(
                        code="team_targets_not_allowed",
                        message="team_user_ids and team_department_ids require team_scope=designated.",
                        target=target,
                        resource_id=existing.resource_id,
                    )
                )
            team_user_ids = ()
            team_department_ids = ()
        else:
            team_user_ids = (
                update.team_user_ids
                if update.team_user_ids is not None
                else existing.team_user_ids
                if existing.access_type == "team"
                else ()
            )
            team_department_ids = (
                update.team_department_ids
                if update.team_department_ids is not None
                else existing.team_department_ids
                if existing.access_type == "team"
                else ()
            )
    else:
        team_scope = update.team_scope or "all"
        team_user_ids = update.team_user_ids or ()
        team_department_ids = update.team_department_ids or ()

    if update.regenerate_password and access_type != "password":
        raise ShareServiceError(
            ShareErrorInfo(
                code="password_without_password_access",
                message="regenerate_password requires password access.",
                target=target,
                resource_id=existing.resource_id,
            )
        )

    return ShareCreateOptions(
        access_type=access_type,
        password=password,
        team_scope=team_scope,
        team_user_ids=team_user_ids,
        team_department_ids=team_department_ids,
        expire_days=(None if update.make_permanent else update.expire_days or existing.expire_days),
        allow_copy=existing.allow_copy if update.allow_copy is None else update.allow_copy,
        show_original_info=(
            existing.show_original_info if update.show_original_info is None else update.show_original_info
        ),
        show_file_list=existing.show_file_list if update.show_file_list is None else update.show_file_list,
        hide_super_magic_watermark=(
            existing.hide_super_magic_watermark
            if update.hide_super_magic_watermark is None
            else update.hide_super_magic_watermark
        ),
        allow_download=existing.allow_download if update.allow_download is None else update.allow_download,
        immersive=existing.immersive if update.immersive is None else update.immersive,
        resource_id=existing.resource_id,
        update_existing=True,
    )


def _effective_password(existing: ShareDetail, update: ShareUpdateOptions, access_type: str) -> str | None:
    if access_type != "password":
        return update.password
    if update.password is not None:
        return update.password
    if update.regenerate_password:
        return generate_password()
    if existing.access_type == "password":
        if existing.password:
            return existing.password
        raise ShareServiceError(
            ShareErrorInfo(
                code="existing_password_unavailable",
                message="The existing password could not be loaded safely. Use password or regenerate_password.",
                target=existing.target,
                resource_id=existing.resource_id,
            )
        )
    return generate_password()


async def _target_update(
    tool_context: ToolContext,
    existing: ShareDetail,
    options: ShareUpdateOptions,
    target: ShareTarget,
) -> _TargetUpdate:
    if target == "topic":
        return _TargetUpdate()
    if target == "project":
        return await _project_target_update(tool_context, existing, options)
    return await _file_target_update(tool_context, existing, options)


async def _project_target_update(
    tool_context: ToolContext,
    existing: ShareDetail,
    options: ShareUpdateOptions,
) -> _TargetUpdate:
    project_id = _required_project_id(existing)
    default_open_file_id: str | None = None
    if options.entry_file_path is not None:
        entry = await resolve_workspace_file(
            get_workspace_root(tool_context),
            options.entry_file_path,
            expected_project_id=project_id,
        )
        default_open_file_id = entry.file_id
    return _TargetUpdate(
        project_id=project_id,
        share_project=True,
        default_open_file_id=default_open_file_id,
    )


async def _file_target_update(
    tool_context: ToolContext,
    existing: ShareDetail,
    options: ShareUpdateOptions,
) -> _TargetUpdate:
    project_id = existing.project_id
    workspace_root = get_workspace_root(tool_context)

    if options.file_paths is not None:
        verified_project_id = _required_project_id(existing)
        resolved = []
        seen_file_ids: set[str] = set()
        for file_path in options.file_paths:
            item = await resolve_workspace_file(
                workspace_root,
                file_path,
                expected_project_id=verified_project_id,
            )
            if item.file_id not in seen_file_ids:
                resolved.append(item)
                seen_file_ids.add(item.file_id)
        entry = find_entry_file(workspace_root, options.entry_file_path or "", resolved)
        return _TargetUpdate(
            file_ids=[item.file_id for item in resolved],
            default_open_file_id=entry.file_id,
            project_id=verified_project_id,
            share_project=False,
            resource_type=RESOURCE_TYPE_FILE_COLLECTION,
        )

    default_open_file_id: str | None = None
    if options.entry_file_path is not None:
        verified_project_id = _required_project_id(existing)
        entry = await resolve_workspace_file(
            workspace_root,
            options.entry_file_path,
            expected_project_id=verified_project_id,
        )
        if entry.file_id not in existing.file_ids:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="entry_file_not_shared",
                    message="entry_file_path must identify a file already included in this share.",
                    target="files",
                    path=options.entry_file_path,
                    resource_id=existing.resource_id,
                )
            )
        default_open_file_id = entry.file_id

    return _TargetUpdate(
        project_id=project_id,
        share_project=False,
        default_open_file_id=default_open_file_id,
    )


def _required_project_id(existing: ShareDetail) -> str:
    if existing.project_id:
        return existing.project_id
    raise ShareServiceError(
        ShareErrorInfo(
            code="missing_share_project_id",
            message="The selected share has no project ID, so its files or entry file cannot be changed safely.",
            target=existing.target,
            resource_id=existing.resource_id,
        )
    )


__all__ = ["ShareUpdateService"]
