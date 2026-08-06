"""分享服务共用的上下文校验、SDK 错误转换和资源常量。"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import TypeVar

from agentlang.context.tool_context import ToolContext
from app.core.context.agent_context import AgentContext
from app.infrastructure.sdk.base.exceptions import HttpRequestError, SdkException
from app.infrastructure.sdk.magic_service.factory import MagicServiceConfigError, get_magic_service_sdk
from app.infrastructure.sdk.magic_service.kernel.magic_service_exception import (
    MagicServiceApiError,
    MagicServiceUnauthorizedException,
)
from app.infrastructure.sdk.magic_service.parameter import GetShareParameter
from app.infrastructure.sdk.magic_service.result import ShareResult

from .models import ShareErrorInfo, ShareServiceError, normalize_resource_id

RESOURCE_TYPE_TOPIC = 5
RESOURCE_TYPE_FILE_COLLECTION = 13
RESOURCE_TYPE_FILE = 15

VIP_REQUIRED_FOR_PASSWORD = 51308
VIP_REQUIRED_FOR_SHOW_ORIGINAL_INFO = 51309
VIP_REQUIRED_FOR_WATERMARK = 51310
PERMISSION_DENIED = 51303
RESOURCE_NOT_FOUND = 51302
SHARE_NOT_FOUND = 51305
TARGET_IDS_REQUIRED = 51313

_T = TypeVar("_T")


async def get_optional_share(resource_id: str) -> ShareResult | None:
    """读取当前用户的有效分享；不存在时返回 None。"""
    try:
        return await get_magic_service_sdk().share.get_share_async(GetShareParameter(resource_id))
    except MagicServiceApiError as exc:
        if exc.api_code in {RESOURCE_NOT_FOUND, SHARE_NOT_FOUND}:
            return None
        raise


def required_numeric_metadata(tool_context: ToolContext, key: str, error_code: str) -> str:
    """读取并校验工具上下文中的数字 ID。"""
    value = str(tool_context.get_metadata(key) or "").strip()
    if not value:
        raise ShareServiceError(
            ShareErrorInfo(code=error_code, message=f"The current tool context does not contain {key}.")
        )
    return normalize_resource_id(value, f"invalid_{key}")


async def raise_if_interrupted(tool_context: ToolContext) -> None:
    """在远程调用前响应用户中断。"""
    agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
    if agent_context is not None and agent_context.is_interruption_requested():
        raise asyncio.CancelledError


async def translate_sdk_errors(operation: Awaitable[_T]) -> _T:
    """把 Magic Service 和 SDK 异常转换为稳定的分享领域错误。"""
    try:
        return await operation
    except asyncio.CancelledError:
        raise
    except ShareServiceError:
        raise
    except MagicServiceApiError as exc:
        raise _from_api_error(exc) from exc
    except MagicServiceUnauthorizedException as exc:
        raise ShareServiceError(
            ShareErrorInfo(
                code="authorization_failed",
                message="Share authorization failed. Refresh the session and retry.",
            )
        ) from exc
    except MagicServiceConfigError as exc:
        raise ShareServiceError(
            ShareErrorInfo(
                code="service_not_configured",
                message="The share service is not configured for this sandbox.",
            )
        ) from exc
    except HttpRequestError as exc:
        raise ShareServiceError(
            ShareErrorInfo(code="service_unavailable", message="The share service is temporarily unavailable.")
        ) from exc
    except SdkException as exc:
        raise ShareServiceError(
            ShareErrorInfo(code="service_error", message="The share service request failed.")
        ) from exc
    except ValueError as exc:
        raise ShareServiceError(
            ShareErrorInfo(
                code="invalid_request",
                message="The share request is invalid. Check the supplied parameters.",
            )
        ) from exc


def _from_api_error(exc: MagicServiceApiError) -> ShareServiceError:
    api_code = exc.api_code
    if api_code == VIP_REQUIRED_FOR_PASSWORD:
        return ShareServiceError(
            ShareErrorInfo(
                code="vip_required_for_password",
                message=(
                    "Password-protected file and project shares require VIP. "
                    "Do not fall back to public sharing automatically."
                ),
            )
        )
    if api_code == VIP_REQUIRED_FOR_WATERMARK:
        return ShareServiceError(
            ShareErrorInfo(
                code="vip_required_for_watermark",
                message='VIP is required to hide the "Created by Super Magic" watermark.',
            )
        )
    if api_code == VIP_REQUIRED_FOR_SHOW_ORIGINAL_INFO:
        return ShareServiceError(
            ShareErrorInfo(
                code="vip_required_for_original_info",
                message="VIP is required to disable original author information.",
            )
        )
    if api_code == PERMISSION_DENIED:
        return ShareServiceError(
            ShareErrorInfo(
                code="permission_denied",
                message="The current user does not have permission to manage this share.",
            )
        )
    if api_code in {RESOURCE_NOT_FOUND, SHARE_NOT_FOUND}:
        return ShareServiceError(
            ShareErrorInfo(
                code="resource_not_found",
                message="The requested share resource was not found or is not shareable.",
            )
        )
    if api_code == TARGET_IDS_REQUIRED:
        return ShareServiceError(
            ShareErrorInfo(
                code="team_targets_required",
                message="Designated team sharing requires at least one valid recipient.",
            )
        )
    return ShareServiceError(
        ShareErrorInfo(
            code="service_rejected",
            message=f"The share service rejected the request (api_code={api_code or 'unknown'}).",
        )
    )


__all__ = [
    "RESOURCE_TYPE_FILE",
    "RESOURCE_TYPE_FILE_COLLECTION",
    "RESOURCE_TYPE_TOPIC",
    "get_optional_share",
    "raise_if_interrupted",
    "required_numeric_metadata",
    "translate_sdk_errors",
]
