"""创建和删除分享的领域编排。"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from agentlang.context.tool_context import ToolContext
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter import (
    CancelShareParameter,
    CreateShareParameter,
    FindSimilarShareParameter,
)
from app.infrastructure.sdk.magic_service.result import ShareResult

from .access import build_share_extra, prepare_access
from .existing_share import (
    effective_update_options,
    find_share,
    reuse_existing_share,
    select_resource_id,
)
from .models import (
    ShareCreateOptions,
    ShareCreationResult,
    ShareDeletionResult,
    ShareErrorInfo,
    ShareOperation,
    ShareServiceError,
    ShareTarget,
    normalize_resource_id,
)
from .service_common import (
    RESOURCE_TYPE_FILE_COLLECTION,
    RESOURCE_TYPE_TOPIC,
    get_optional_share,
    raise_if_interrupted,
    required_numeric_metadata,
    translate_sdk_errors,
)
from .share_ref import parse_share_ref
from .workspace import find_entry_file, get_workspace_root, resolve_workspace_file, resolve_workspace_files

MAX_RESOURCE_NAME_LENGTH = 255
class ShareService:
    """在扁平创建/删除参数与 Magic Service ShareApi 之间完成安全编排。"""

    async def create_file_share(
        self,
        tool_context: ToolContext,
        file_paths: Sequence[str],
        entry_file_path: str,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        return await translate_sdk_errors(self._create_file_share(tool_context, file_paths, entry_file_path, options))

    async def create_project_share(
        self,
        tool_context: ToolContext,
        entry_file_path: str,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        return await translate_sdk_errors(self._create_project_share(tool_context, entry_file_path, options))

    async def create_topic_share(
        self,
        tool_context: ToolContext,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        return await translate_sdk_errors(self._create_topic_share(tool_context, options))

    async def delete_share(self, tool_context: ToolContext, share_ref: str) -> ShareDeletionResult:
        return await translate_sdk_errors(self._delete_share(tool_context, share_ref))

    async def _create_file_share(
        self,
        tool_context: ToolContext,
        file_paths: Sequence[str],
        entry_file_path: str,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        project_id = required_numeric_metadata(tool_context, "project_id", "missing_project_context")
        workspace_root = get_workspace_root(tool_context)
        files = await resolve_workspace_files(workspace_root, file_paths)
        entry_file = find_entry_file(workspace_root, entry_file_path, files)
        await raise_if_interrupted(tool_context)

        sdk = get_magic_service_sdk()
        similar = await sdk.share.find_similar_shares_async(
            FindSimilarShareParameter(file_ids=[item.file_id for item in files])
        )
        similar_items = list(similar)
        reused = reuse_existing_share(similar_items, options, "files")
        if reused is not None:
            return reused

        resource_id, operation = await select_resource_id(
            tool_context,
            similar_items,
            options.resource_id,
            "files",
            options.update_existing,
        )
        effective_options = effective_update_options(
            options,
            find_share(similar_items, resource_id, "files") if operation == "updated" else None,
            "files",
        )
        access = prepare_access(effective_options, "files")

        await raise_if_interrupted(tool_context)
        result = await sdk.share.create_share_async(
            CreateShareParameter(
                resource_id=resource_id,
                resource_type=RESOURCE_TYPE_FILE_COLLECTION,
                share_type=access.share_type,
                resource_name=self._resource_name(entry_file.absolute_path.name),
                password=access.password,
                expire_days=effective_options.expire_days,
                clear_expiration=_clear_expiration_requested(options),
                share_range=access.share_range,
                target_ids=access.target_ids,
                file_ids=[item.file_id for item in files],
                project_id=project_id,
                share_project=False,
                default_open_file_id=entry_file.file_id,
                extra=build_share_extra(effective_options),
                show_share_url=True,
            )
        )
        return self._build_creation_result(
            result,
            operation,
            "files",
            access.password,
            effective_options,
        )

    async def _create_project_share(
        self,
        tool_context: ToolContext,
        entry_file_path: str,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        project_id = required_numeric_metadata(tool_context, "project_id", "missing_project_context")
        entry_file = await resolve_workspace_file(
            get_workspace_root(tool_context),
            entry_file_path,
            expected_project_id=project_id,
        )
        await raise_if_interrupted(tool_context)

        sdk = get_magic_service_sdk()
        similar = await sdk.share.find_similar_shares_async(
            FindSimilarShareParameter(project_id=project_id, share_project=True)
        )
        similar_items = list(similar)
        reused = reuse_existing_share(similar_items, options, "project")
        if reused is not None:
            return reused

        resource_id, operation = await select_resource_id(
            tool_context,
            similar_items,
            options.resource_id,
            "project",
            options.update_existing,
        )
        effective_options = effective_update_options(
            options,
            find_share(similar_items, resource_id, "project") if operation == "updated" else None,
            "project",
        )
        access = prepare_access(effective_options, "project")

        await raise_if_interrupted(tool_context)
        result = await sdk.share.create_share_async(
            CreateShareParameter(
                resource_id=resource_id,
                resource_type=RESOURCE_TYPE_FILE_COLLECTION,
                share_type=access.share_type,
                resource_name=self._project_name(tool_context, entry_file.relative_path, project_id),
                password=access.password,
                expire_days=effective_options.expire_days,
                clear_expiration=_clear_expiration_requested(options),
                share_range=access.share_range,
                target_ids=access.target_ids,
                project_id=project_id,
                share_project=True,
                default_open_file_id=entry_file.file_id,
                extra=build_share_extra(effective_options),
                show_share_url=True,
            )
        )
        return self._build_creation_result(
            result,
            operation,
            "project",
            access.password,
            effective_options,
        )

    async def _create_topic_share(
        self,
        tool_context: ToolContext,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        topic_id = required_numeric_metadata(tool_context, "topic_id", "missing_topic_context")
        await raise_if_interrupted(tool_context)
        existing = await get_optional_share(topic_id)
        if existing is not None:
            if not options.update_existing:
                reused = reuse_existing_share([existing], options, "topic")
                if reused is not None:
                    return reused
        elif options.update_existing:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="existing_share_not_found",
                    message="No active topic share exists to update. Leave update_existing=false to create one.",
                    target="topic",
                )
            )

        effective_options = effective_update_options(options, existing, "topic")
        access = prepare_access(effective_options, "topic")
        result = await get_magic_service_sdk().share.create_share_async(
            CreateShareParameter(
                resource_id=topic_id,
                resource_type=RESOURCE_TYPE_TOPIC,
                share_type=access.share_type,
                password=access.password,
                expire_days=effective_options.expire_days,
                clear_expiration=_clear_expiration_requested(options),
                share_range=access.share_range,
                target_ids=access.target_ids,
                extra=build_share_extra(effective_options),
                show_share_url=True,
            )
        )
        operation: ShareOperation = "updated" if existing is not None else "created"
        return self._build_creation_result(
            result,
            operation,
            "topic",
            access.password,
            effective_options,
        )

    async def _delete_share(self, tool_context: ToolContext, share_ref: str) -> ShareDeletionResult:
        resource_id = parse_share_ref(share_ref)
        await raise_if_interrupted(tool_context)
        result = await get_magic_service_sdk().share.cancel_share_async(CancelShareParameter(resource_id))
        return ShareDeletionResult(resource_id=result.id or resource_id)

    @staticmethod
    def _build_creation_result(
        result: ShareResult,
        operation: ShareOperation,
        target: ShareTarget,
        password: str | None,
        options: ShareCreateOptions,
    ) -> ShareCreationResult:
        resource_id = normalize_resource_id(result.resource_id, "invalid_result_resource_id")
        share_url = (result.share_url or "").strip()
        if not share_url:
            raise ShareServiceError(
                ShareErrorInfo(
                    code="share_url_missing",
                    message="The share was saved, but Magic Service did not return share_url. Check MAGIC_WEB_URL.",
                    target=target,
                    resource_id=resource_id,
                )
            )
        return ShareCreationResult(
            operation=operation,
            target=target,
            share_url=share_url,
            resource_id=resource_id,
            resource_type=result.resource_type,
            resource_name=result.resource_name,
            access_type=options.access_type,
            password=password,
            expire_days=options.expire_days,
            expire_at=result.expire_at,
        )

    @staticmethod
    def _resource_name(value: str) -> str:
        return (value.strip() or "shared-resource")[:MAX_RESOURCE_NAME_LENGTH]

    def _project_name(self, tool_context: ToolContext, entry_file_path: str, project_id: str) -> str:
        metadata_name = str(tool_context.get_metadata("project_name") or "").strip()
        if metadata_name:
            return self._resource_name(metadata_name)
        parts = Path(entry_file_path).parts
        fallback = parts[0] if len(parts) > 1 else Path(entry_file_path).stem
        return self._resource_name(fallback or project_id)

    @staticmethod
    def parse_resource_id(share_ref: str) -> str:
        return parse_share_ref(share_ref)


def _clear_expiration_requested(options: ShareCreateOptions) -> bool:
    """兼容旧更新入口：显式传 expire_days=None 表示改为永久有效。"""
    return options.update_existing and "expire_days" in options.provided_fields and options.expire_days is None


__all__ = ["ShareService"]
