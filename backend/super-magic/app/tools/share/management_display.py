"""分享详情与更新工具的模型结果和用户详情。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.utils.time_display import format_tool_time

from .display import (
    format_validity,
    safe_share_ref,
    translate_access,
    translate_action,
    translate_error,
    translate_operation,
    translate_target,
)
from .models import ShareDetail, ShareErrorInfo, ShareTarget
from .share_url import build_share_access_url


def build_management_result(detail: ShareDetail, operation: str) -> ToolResult:
    payload = detail_payload(detail, operation)
    return ToolResult(content=detail_content(detail, operation), data=payload, extra_info=payload)


def build_management_error(operation: str, target: ShareTarget, info: ShareErrorInfo) -> ToolResult:
    payload: dict[str, object] = {
        "operation": "failed",
        "requested_operation": operation,
        "target": target,
        "error_code": info.code,
        "error_message": info.message,
    }
    if info.resource_id is not None:
        payload["resource_id"] = info.resource_id
    if info.path is not None:
        payload["path"] = info.path
    return ToolResult.error(
        info.message,
        data=payload,
        extra_info=payload,
        use_custom_remark=True,
    )


def detail_payload(detail: ShareDetail, operation: str) -> dict[str, object]:
    access_url = build_share_access_url(detail.share_url, detail.access_type, detail.password)
    payload: dict[str, object] = {
        "operation": operation,
        "target": detail.target,
        "status": detail.status,
        "resource_id": detail.resource_id,
        "resource_type": detail.resource_type,
        "share_url": access_url,
        "share_name": detail.share_name,
        "access": detail.access_type,
        "password": detail.password,
        "expire_days": detail.expire_days,
        "expire_at": detail.expire_at,
        "show_original_info": detail.show_original_info,
        "allow_download": detail.allow_download,
    }
    if detail.access_type == "team":
        payload["team_scope"] = detail.team_scope
        payload["team_user_ids"] = list(detail.team_user_ids)
        payload["team_department_ids"] = list(detail.team_department_ids)
    if detail.target in {"files", "project"}:
        payload["project_id"] = detail.project_id
        payload["default_open_file_id"] = detail.default_open_file_id
        payload["main_file_name"] = detail.main_file_name
        payload["allow_copy"] = detail.allow_copy
        payload["hide_super_magic_watermark"] = detail.hide_super_magic_watermark
        payload["immersive"] = detail.immersive
    if detail.target == "files":
        payload["file_ids"] = list(detail.file_ids)
    if detail.target in {"files", "topic"}:
        payload["show_file_list"] = detail.show_file_list
    return payload


def detail_content(detail: ShareDetail, operation: str) -> str:
    access_url = build_share_access_url(detail.share_url, detail.access_type, detail.password)
    heading = "Share updated." if operation == "updated" else "Active share details."
    lines = [
        heading,
        f"Target: {detail.target}.",
        f"Status: {detail.status}.",
        f"Resource ID: {detail.resource_id}",
        f"Name: {detail.share_name or 'unnamed share'}",
        f"Access: {detail.access_type}.",
        f"URL: {access_url}",
    ]
    if detail.password is not None:
        lines.append(f"Password: {detail.password}")
    if detail.access_type == "team":
        lines.append(f"Team scope: {detail.team_scope or 'all'}.")
        lines.append(
            f"Designated recipients: {len(detail.team_user_ids)} user(s), "
            f"{len(detail.team_department_ids)} department(s)."
        )
    if detail.expire_at:
        lines.append(f"Expires: {format_tool_time(detail.expire_at, 'UTC')}")
    else:
        lines.append("Validity: permanent.")
    if detail.target in {"files", "project"}:
        lines.append(f"Default open file ID: {detail.default_open_file_id or 'not set'}")
        lines.append(f"Allow copy: {detail.allow_copy}.")
        lines.append(f"Hide Super Magic watermark: {detail.hide_super_magic_watermark}.")
        lines.append(f"Immersive mode: {detail.immersive}.")
    if detail.target == "files":
        lines.append(f"Shared file count: {len(detail.file_ids)}")
    if detail.target in {"files", "topic"}:
        lines.append(f"Show file list: {detail.show_file_list}.")
    lines.append(f"Show original author information: {detail.show_original_info}.")
    lines.append(f"Allow download or export: {detail.allow_download}.")
    return "\n".join(lines)


def build_management_detail(result: ToolResult, file_name: str) -> ToolDetail:
    info = result.extra_info if isinstance(result.extra_info, Mapping) else {}
    requested_operation = str(info.get("requested_operation") or info.get("operation") or "read")
    title_key = _detail_title_key(requested_operation, result.ok)
    if result.ok:
        lines = [
            f"# {_message(title_key)}",
            "",
            f"- {_message('detail.operation')}: {_operation_label(info.get('operation'))}",
            f"- {_message('detail.target')}: {translate_target(info.get('target'))}",
            f"- {_message('detail.status')}: {_status_label(info.get('status'))}",
            f"- {_message('detail.resource_id')}: `{_value(info.get('resource_id'))}`",
            f"- {_message('detail.name')}: {_value(info.get('share_name'))}",
            f"- {_message('detail.access')}: {translate_access(info.get('access'))}",
            f"- {_message('detail.validity')}: {_validity(info)}",
            f"- {_message('detail.url')}: {_value(info.get('share_url'))}",
        ]
        if info.get("password") is not None:
            lines.append(f"- {_message('detail.password')}: `{_value(info.get('password'))}`")
        if info.get("target") in {"files", "project"}:
            lines.extend(
                [
                    f"- {_message('detail.entry_file')}: `{_value(info.get('default_open_file_id'))}`",
                    f"- {_message('detail.allow_copy')}: {_boolean(info.get('allow_copy'))}",
                    f"- {_message('detail.hide_watermark')}: {_boolean(info.get('hide_super_magic_watermark'))}",
                    f"- {_message('detail.immersive')}: {_boolean(info.get('immersive'))}",
                ]
            )
        if info.get("target") == "files":
            lines.append(f"- {_message('detail.file_count')}: {len(_list_value(info.get('file_ids')))}")
        if info.get("target") in {"files", "topic"}:
            lines.append(f"- {_message('detail.show_file_list')}: {_boolean(info.get('show_file_list'))}")
        lines.extend(
            [
                f"- {_message('detail.show_original_info')}: {_boolean(info.get('show_original_info'))}",
                f"- {_message('detail.allow_download')}: {_boolean(info.get('allow_download'))}",
            ]
        )
    else:
        lines = [
            f"# {_message(title_key)}",
            "",
            f"- {_message('detail.error')}: {translate_error(info)}",
        ]
    return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=file_name, content="\n".join(lines)))


def before_get(
    tool_name: str,
    tool_context: ToolContext,
    arguments: Mapping[str, object] | None,
) -> dict[str, object]:
    share_ref = safe_share_ref(str((arguments or {}).get("share_ref") or ""))
    return {
        "tool_name": tool_name,
        "action": translate_action(tool_name),
        "remark": _message("get.before", share_ref=share_ref),
    }


def after_get(
    tool_name: str,
    tool_context: ToolContext,
    result: ToolResult,
    execution_time: float,
    arguments: Mapping[str, object] | None,
) -> dict[str, object]:
    info = result.extra_info if isinstance(result.extra_info, Mapping) else {}
    share_ref = safe_share_ref(str(info.get("resource_id") or (arguments or {}).get("share_ref") or ""))
    key = "get.after_success" if result.ok else "get.after_failed"
    kwargs: dict[str, object] = {"share_ref": share_ref}
    if not result.ok:
        kwargs["error"] = translate_error(info)
    return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": _message(key, **kwargs)}


def before_update(
    tool_name: str,
    tool_context: ToolContext,
    arguments: Mapping[str, object] | None,
    target: ShareTarget,
) -> dict[str, object]:
    share_ref = safe_share_ref(str((arguments or {}).get("share_ref") or ""))
    return {
        "tool_name": tool_name,
        "action": translate_action(tool_name),
        "remark": _message("update.before", target=translate_target(target), share_ref=share_ref),
    }


def after_update(
    tool_name: str,
    tool_context: ToolContext,
    result: ToolResult,
    execution_time: float,
    arguments: Mapping[str, object] | None,
    target: ShareTarget,
) -> dict[str, object]:
    info = result.extra_info if isinstance(result.extra_info, Mapping) else {}
    share_ref = safe_share_ref(str(info.get("resource_id") or (arguments or {}).get("share_ref") or ""))
    key = "update.after_success" if result.ok else "update.after_failed"
    kwargs: dict[str, object] = {"target": translate_target(target), "share_ref": share_ref}
    if not result.ok:
        kwargs["error"] = translate_error(info)
    return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": _message(key, **kwargs)}


def _value(value: object) -> str:
    return str(value) if value not in (None, "") else "-"


def _message(key: str, **kwargs: object) -> str:
    return i18n.translate(f"share.{key}", category="tool.messages", **kwargs)


def _detail_title_key(operation: str, ok: bool) -> str:
    prefix = "update" if operation in {"update", "updated"} else "get"
    suffix = "success_title" if ok else "failed_title"
    return f"detail.{prefix}_{suffix}"


def _operation_label(value: object) -> str:
    if value == "read":
        return translate_action("get_share")
    return translate_operation(value)


def _status_label(value: object) -> str:
    key = str(value or "unknown")
    return _message(f"list.status.{key}")


def _validity(info: Mapping[str, object]) -> str:
    expire_at = info.get("expire_at")
    if expire_at:
        return format_tool_time(expire_at, "UTC")
    return format_validity(info.get("expire_days"))


def _boolean(value: object) -> str:
    return _message("detail.yes" if value is True else "detail.no")


def _list_value(value: object) -> list[object]:
    return value if isinstance(value, list) else []


__all__ = [
    "after_get",
    "after_update",
    "before_get",
    "before_update",
    "build_management_detail",
    "build_management_error",
    "build_management_result",
    "detail_payload",
]
