"""分享工具的模型正文、用户详情和 i18n 辅助方法。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from urllib.parse import urlparse

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.utils.time_display import format_tool_time

from .models import (
    ShareCandidate,
    ShareCreationResult,
    ShareDeletionResult,
    ShareErrorInfo,
    ShareTarget,
)
from .share_url import build_share_access_url


def translate_action(tool_name: str) -> str:
    """Translate a tool action label."""
    return i18n.translate(tool_name, category="tool.actions")


def translate_message(message_key: str, **kwargs: object) -> str:
    """Translate a share-facing message."""
    return i18n.translate(f"share.{message_key}", category="tool.messages", **kwargs)


def translate_error(info: Mapping[str, object] | None) -> str:
    """Translate a stable error code without exposing upstream details."""
    payload = info or {}
    code = str(payload.get("error_code") or "unknown")
    message = translate_message(f"error.{code}")
    return message if message != f"share.error.{code}" else translate_message("error.unknown")


def build_creation_result(result: ShareCreationResult) -> ToolResult:
    payload = creation_payload(result)
    return ToolResult(content=creation_content(result), data=payload, extra_info=payload)


def build_deletion_result(result: ShareDeletionResult) -> ToolResult:
    payload: dict[str, object] = {
        "operation": "deleted",
        "resource_id": result.resource_id,
        "source_resource_deleted": False,
    }
    return ToolResult(content=deletion_content(result), data=payload, extra_info=payload)


def build_error_result(target: ShareTarget, info: ShareErrorInfo) -> ToolResult:
    payload: dict[str, object] = {
        "operation": "failed",
        "target": target,
        "error_code": info.code,
    }
    if info.path is not None:
        payload["path"] = info.path
    if info.resource_id is not None:
        payload["resource_id"] = info.resource_id
    if info.candidates:
        payload["candidates"] = [candidate_payload(item) for item in info.candidates]

    return ToolResult.error(
        info.message,
        data=payload,
        extra_info=payload,
        use_custom_remark=True,
    )


def build_confirmation_error(share_ref: str) -> ToolResult:
    payload: dict[str, object] = {
        "operation": "blocked",
        "error_code": "confirmation_required",
        "share_ref": safe_share_ref(share_ref),
    }
    return ToolResult.error(
        "Deletion was not executed. Ask the user to explicitly confirm that the share should be deleted or made unavailable, then call delete_share with confirmed=true.",
        data=payload,
        extra_info=payload,
        use_custom_remark=True,
    )


def creation_payload(result: ShareCreationResult) -> dict[str, object]:
    access_url = build_share_access_url(result.share_url, result.access_type, result.password)
    payload: dict[str, object] = {
        "operation": result.operation,
        "share_url": access_url,
        "resource_id": result.resource_id,
        "resource_type": result.resource_type,
        "resource_name": result.resource_name,
        "access": result.access_type,
        "expire_days": result.expire_days,
        "expire_at": result.expire_at,
        "target": result.target,
    }
    if result.password is not None:
        payload["password"] = result.password
    return payload


def creation_content(result: ShareCreationResult) -> str:
    access_url = build_share_access_url(result.share_url, result.access_type, result.password)
    lines = [
        "Share is ready.",
        f"Operation: {result.operation}.",
        f"Target: {result.target}.",
        f"Access: {result.access_type}.",
        f"URL: {access_url}",
        f"Resource ID: {result.resource_id}",
    ]
    if result.password is not None:
        lines.append(f"Password: {result.password}")
    lines.append(
        f"Validity: {result.expire_days} day(s)." if result.expire_days is not None else "Validity: permanent."
    )
    return "\n".join(lines)


def deletion_content(result: ShareDeletionResult) -> str:
    return "\n".join(
        [
            "The share is now unavailable.",
            f"Resource ID: {result.resource_id}",
            "The source topic, files, or project were not deleted.",
            "The delete operation is idempotent, so the link is unavailable whether an active record was deleted by this request or was already unavailable.",
        ]
    )


def build_creation_detail(result: ToolResult, arguments: Mapping[str, object] | None, file_name: str) -> ToolDetail:
    info = result.extra_info or {}
    target = str(info.get("target") or (arguments or {}).get("target") or "share")
    title_key = "detail.create_success_title" if result.ok else "detail.create_failed_title"
    lines = [f"# {translate_message(title_key)}", ""]
    lines.extend(
        [
            f"- {translate_message('detail.target')}: {translate_target(target)}",
            f"- {translate_message('detail.resource_id')}: `{format_value(info.get('resource_id'))}`",
        ]
    )
    if result.ok:
        lines.extend(
            [
                f"- {translate_message('detail.operation')}: {translate_operation(info.get('operation'))}",
                f"- {translate_message('detail.access')}: {translate_access(info.get('access'))}",
                f"- {translate_message('detail.validity')}: {format_validity(info.get('expire_days'))}",
                f"- {translate_message('detail.url')}: {format_value(info.get('share_url'))}",
            ]
        )
        if info.get("password") is not None:
            lines.append(f"- {translate_message('detail.password')}: `{format_value(info.get('password'))}`")
    else:
        lines.append(f"- {translate_message('detail.error')}: {translate_error(info)}")
        lines.extend(candidate_lines(info.get("candidates")))
    return _markdown_detail(file_name, lines)


def build_deletion_detail(result: ToolResult, arguments: Mapping[str, object] | None) -> ToolDetail:
    info = result.extra_info or {}
    lines = [
        f"# {translate_message('detail.delete_success_title' if result.ok else 'detail.delete_failed_title')}",
        "",
        f"- {translate_message('detail.resource_id')}: `{safe_share_ref(format_value(info.get('resource_id') or (arguments or {}).get('share_ref')))}`",
    ]
    if result.ok:
        lines.extend(
            [
                f"- {translate_message('detail.status')}: {translate_message('detail.unavailable')}",
                f"- {translate_message('detail.source_unchanged')}",
            ]
        )
    else:
        lines.append(f"- {translate_message('detail.error')}: {translate_error(info)}")
    return _markdown_detail("delete_share.md", lines)


def before_create(
    tool_name: str,
    tool_context: ToolContext,
    arguments: Mapping[str, object] | None,
    target: ShareTarget,
) -> dict[str, object]:
    args = arguments or {}
    subject = str(args.get("entry_file_path") or args.get("file_paths") or target)
    return {
        "tool_name": tool_name,
        "action": translate_action(tool_name),
        "remark": translate_message("create.before", target=translate_target(target), subject=subject),
    }


def after_create(
    tool_name: str,
    tool_context: ToolContext,
    result: ToolResult,
    execution_time: float,
    arguments: Mapping[str, object] | None,
    target: ShareTarget,
) -> dict[str, object]:
    info = result.extra_info or {}
    operation = translate_operation(info.get("operation") or "create")
    key = "create.after_success" if result.ok else "create.after_failed"
    kwargs: dict[str, object] = {"target": translate_target(target), "operation": operation}
    if not result.ok:
        kwargs["error"] = translate_error(info)
    return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": translate_message(key, **kwargs)}


def before_delete(
    tool_name: str,
    tool_context: ToolContext,
    arguments: Mapping[str, object] | None,
) -> dict[str, object]:
    share_ref = safe_share_ref(str((arguments or {}).get("share_ref") or ""))
    return {
        "tool_name": tool_name,
        "action": translate_action(tool_name),
        "remark": translate_message("delete.before", share_ref=share_ref),
    }


def after_delete(
    tool_name: str,
    tool_context: ToolContext,
    result: ToolResult,
    execution_time: float,
    arguments: Mapping[str, object] | None,
) -> dict[str, object]:
    info = result.extra_info or {}
    key = "delete.after_success" if result.ok else "delete.after_failed"
    share_ref = info.get("resource_id") or (arguments or {}).get("share_ref") or ""
    kwargs: dict[str, object] = {"share_ref": safe_share_ref(str(share_ref))}
    if not result.ok:
        kwargs["error"] = translate_error(info)
    return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": translate_message(key, **kwargs)}


def translate_target(value: object) -> str:
    key = str(value or "share")
    message = translate_message(f"target.{key}")
    return message if message != f"share.target.{key}" else key


def translate_access(value: object) -> str:
    key = str(value or "unknown")
    message = translate_message(f"access.{key}")
    return message if message != f"share.access.{key}" else key


def translate_operation(value: object) -> str:
    key = str(value or "unknown")
    message = translate_message(f"operation.{key}")
    return message if message != f"share.operation.{key}" else key


def format_validity(value: object) -> str:
    if value in (None, ""):
        return translate_message("detail.permanent")
    return translate_message("detail.days", count=value)


def format_value(value: object) -> str:
    if value in (None, ""):
        return "-"
    return str(value)


def candidate_payload(candidate: ShareCandidate) -> dict[str, object]:
    return {
        "resource_id": candidate.resource_id,
        "resource_name": candidate.resource_name,
        "access": candidate.access_type,
        "expire_days": candidate.expire_days,
        "expire_at": candidate.expire_at,
    }


def candidate_lines(value: object) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return []
    lines = [
        "",
        f"## {translate_message('detail.candidates')}",
        "",
        (
            f"| {translate_message('detail.candidate_id')} | {translate_message('detail.candidate_name')} | "
            f"{translate_message('detail.candidate_access')} | {translate_message('detail.candidate_expiry')} |"
        ),
        "| --- | --- | --- | --- |",
    ]
    for item in value:
        if not isinstance(item, Mapping):
            continue
        expire_at = item.get("expire_at")
        expiry = format_validity(item.get("expire_days"))
        if expire_at:
            expiry = format_tool_time(expire_at, "UTC")
        lines.append(
            f"| `{format_value(item.get('resource_id'))}` | {format_value(item.get('resource_name'))} | {translate_access(item.get('access'))} | {expiry} |"
        )
    return lines if len(lines) > 5 else []


def safe_share_ref(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return parsed._replace(query="", fragment="").geturl()
    return value.split("?", 1)[0].split("#", 1)[0]


def _markdown_detail(file_name: str, lines: list[str]) -> ToolDetail:
    return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=file_name, content="\n".join(lines)))


__all__ = [
    "after_create",
    "after_delete",
    "before_create",
    "before_delete",
    "build_confirmation_error",
    "build_creation_detail",
    "build_creation_result",
    "build_deletion_detail",
    "build_deletion_result",
    "build_error_result",
    "translate_action",
]
