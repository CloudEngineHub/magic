"""三类分享的只读查询、分页和结果状态转换。"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Literal

from agentlang.context.tool_context import ToolContext
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter import FindSimilarShareParameter, ListShareParameter
from app.infrastructure.sdk.magic_service.result import ShareListResult as SdkShareListResult
from app.infrastructure.sdk.magic_service.result import ShareResult

from .access import share_type_name
from .models import (
    ShareErrorInfo,
    ShareListItem,
    ShareListResult,
    ShareListStatus,
    ShareServiceError,
    ShareTarget,
    normalize_resource_id,
)
from .service_common import (
    RESOURCE_TYPE_FILE,
    RESOURCE_TYPE_FILE_COLLECTION,
    RESOURCE_TYPE_TOPIC,
    get_optional_share,
    raise_if_interrupted,
    required_numeric_metadata,
    translate_sdk_errors,
)
from .workspace import get_workspace_root, resolve_workspace_files

ShareListFilter = Literal["active", "expired", "deleted", "all"]
SdkShareListFilter = Literal["active", "expired", "cancelled", "all"]


class ShareQueryService:
    """执行不会创建、更新或删除分享的查询。"""

    async def list_file_shares(
        self,
        tool_context: ToolContext,
        file_paths: Sequence[str],
        status: ShareListFilter,
        keyword: str | None,
        current_project_only: bool,
        page: int,
        page_size: int,
    ) -> ShareListResult:
        return await translate_sdk_errors(
            self._list_file_shares(
                tool_context,
                file_paths,
                status,
                keyword,
                current_project_only,
                page,
                page_size,
            )
        )

    async def list_project_shares(
        self,
        tool_context: ToolContext,
        current_project_only: bool,
        status: ShareListFilter,
        keyword: str | None,
        page: int,
        page_size: int,
    ) -> ShareListResult:
        return await translate_sdk_errors(
            self._list_project_shares(
                tool_context,
                current_project_only,
                status,
                keyword,
                page,
                page_size,
            )
        )

    async def list_topic_shares(
        self,
        tool_context: ToolContext,
        current_topic_only: bool,
        status: ShareListFilter,
        keyword: str | None,
        page: int,
        page_size: int,
    ) -> ShareListResult:
        return await translate_sdk_errors(
            self._list_topic_shares(
                tool_context,
                current_topic_only,
                status,
                keyword,
                page,
                page_size,
            )
        )

    async def _list_file_shares(
        self,
        tool_context: ToolContext,
        file_paths: Sequence[str],
        status: ShareListFilter,
        keyword: str | None,
        current_project_only: bool,
        page: int,
        page_size: int,
    ) -> ShareListResult:
        if file_paths:
            if status != "active":
                raise ShareServiceError(
                    ShareErrorInfo(
                        code="exact_lookup_active_only",
                        message=(
                            "Exact file matching only searches active shares. "
                            "Omit file_paths to browse expired or deleted shares."
                        ),
                        target="files",
                    )
                )
            files = await resolve_workspace_files(get_workspace_root(tool_context), file_paths)
            await raise_if_interrupted(tool_context)
            similar = await get_magic_service_sdk().share.find_similar_shares_async(
                FindSimilarShareParameter(file_ids=[item.file_id for item in files])
            )
            return self._build_exact_list_result("files", list(similar), expose_password=True)

        project_id = (
            required_numeric_metadata(tool_context, "project_id", "missing_project_context")
            if current_project_only
            else None
        )
        await raise_if_interrupted(tool_context)
        result = await get_magic_service_sdk().share.list_shares_async(
            ListShareParameter(
                [RESOURCE_TYPE_FILE_COLLECTION, RESOURCE_TYPE_FILE],
                filter_type=self._sdk_filter_type(status),
                keyword=keyword,
                project_id=project_id,
                page=page,
                page_size=page_size,
            )
        )
        return self._build_paged_list_result("files", result, status)

    async def _list_project_shares(
        self,
        tool_context: ToolContext,
        current_project_only: bool,
        status: ShareListFilter,
        keyword: str | None,
        page: int,
        page_size: int,
    ) -> ShareListResult:
        if current_project_only and status == "active" and keyword is None:
            project_id = required_numeric_metadata(tool_context, "project_id", "missing_project_context")
            await raise_if_interrupted(tool_context)
            similar = await get_magic_service_sdk().share.find_similar_shares_async(
                FindSimilarShareParameter(project_id=project_id, share_project=True)
            )
            return self._build_exact_list_result("project", list(similar), expose_password=True)

        project_id = (
            required_numeric_metadata(tool_context, "project_id", "missing_project_context")
            if current_project_only
            else None
        )
        await raise_if_interrupted(tool_context)
        result = await get_magic_service_sdk().share.list_shares_async(
            ListShareParameter(
                [RESOURCE_TYPE_FILE_COLLECTION],
                filter_type=self._sdk_filter_type(status),
                keyword=keyword,
                project_id=project_id,
                share_project=True,
                page=page,
                page_size=page_size,
            )
        )
        return self._build_paged_list_result("project", result, status)

    async def _list_topic_shares(
        self,
        tool_context: ToolContext,
        current_topic_only: bool,
        status: ShareListFilter,
        keyword: str | None,
        page: int,
        page_size: int,
    ) -> ShareListResult:
        if current_topic_only:
            if status != "active" or keyword is not None:
                raise ShareServiceError(
                    ShareErrorInfo(
                        code="current_topic_active_only",
                        message=(
                            "Current-topic lookup only supports the active share without a keyword. "
                            "Set current_topic_only=false to browse history."
                        ),
                        target="topic",
                    )
                )
            topic_id = required_numeric_metadata(tool_context, "topic_id", "missing_topic_context")
            await raise_if_interrupted(tool_context)
            existing = await get_optional_share(topic_id)
            return self._build_exact_list_result(
                "topic",
                [existing] if existing is not None else [],
                expose_password=True,
            )

        await raise_if_interrupted(tool_context)
        result = await get_magic_service_sdk().share.list_shares_async(
            ListShareParameter(
                [RESOURCE_TYPE_TOPIC],
                filter_type=self._sdk_filter_type(status),
                keyword=keyword,
                page=page,
                page_size=page_size,
            )
        )
        return self._build_paged_list_result("topic", result, status)

    def _build_exact_list_result(
        self,
        target: ShareTarget,
        items: Sequence[ShareResult],
        *,
        expose_password: bool,
    ) -> ShareListResult:
        summaries = tuple(self._list_item(item, "active", expose_password=expose_password) for item in items)
        return ShareListResult(
            target=target,
            items=summaries,
            total=len(summaries),
            page=1,
            page_size=max(1, len(summaries)),
            exact=True,
        )

    def _build_paged_list_result(
        self,
        target: ShareTarget,
        result: SdkShareListResult,
        requested_status: ShareListFilter,
    ) -> ShareListResult:
        return ShareListResult(
            target=target,
            items=tuple(self._list_item(item, requested_status, expose_password=False) for item in result.items),
            total=result.total,
            page=result.page,
            page_size=result.page_size,
            exact=False,
        )

    def _list_item(
        self,
        result: ShareResult,
        requested_status: ShareListFilter,
        *,
        expose_password: bool,
    ) -> ShareListItem:
        return ShareListItem(
            resource_id=normalize_resource_id(result.resource_id, "invalid_result_resource_id"),
            resource_name=result.resource_name,
            resource_type=result.resource_type,
            share_url=(result.share_url or "").strip() or None,
            access_type=share_type_name(result.share_type),
            status=self._share_status(result, requested_status),
            has_password=result.has_password or result.is_password_enabled,
            password=result.password if expose_password and result.password else None,
            expire_days=result.expire_days,
            expire_at=result.expire_at,
            project_id=str(result.project_id) if result.project_id not in (None, "") else None,
            project_name=result.project_name,
            default_open_file_id=result.default_open_file_id,
            view_count=int(result.view_count or 0),
            share_project=result.share_project,
            file_ids=tuple(str(item) for item in result.file_ids),
        )

    @staticmethod
    def _share_status(result: ShareResult, requested_status: ShareListFilter) -> ShareListStatus:
        if result.deleted_at:
            return "deleted"
        if not result.is_enabled:
            return "disabled"
        if ShareQueryService._is_expired(result.expire_at):
            return "expired"
        if requested_status == "all":
            return "active" if result.resource_id else "unknown"
        return requested_status

    @staticmethod
    def _sdk_filter_type(status: ShareListFilter) -> SdkShareListFilter:
        return "cancelled" if status == "deleted" else status

    @staticmethod
    def _is_expired(value: str | None) -> bool:
        if not value:
            return False
        normalized = value.strip().replace("/", "-")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return False
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed < datetime.now(timezone.utc)


__all__ = ["ShareQueryService"]
