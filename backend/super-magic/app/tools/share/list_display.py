"""分享查询工具的模型正文和用户详情。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.utils.time_display import format_tool_time

from .display import translate_error
from .models import ShareListItem, ShareListResult, ShareTarget
from .share_url import build_share_access_url


def _message(key: str, **kwargs: object) -> str:
    return i18n.translate(f"share.list.{key}", category="tool.messages", **kwargs)


def build_list_result(result: ShareListResult) -> ToolResult:
    items = [list_item_payload(item) for item in result.items]
    payload: dict[str, object] = {
        "target": result.target,
        "items": items,
        "total": result.total,
        "page": result.page,
        "page_size": result.page_size,
        "has_more": result.page * result.page_size < result.total,
        "exact": result.exact,
    }
    return ToolResult(
        content=list_content(result), data=payload, extra_info={"payload": payload, "md_content": list_detail(result)}
    )


def build_list_error(target: ShareTarget, message: str, error_code: str = "unknown") -> ToolResult:
    payload: dict[str, object] = {
        "operation": "failed",
        "target": target,
        "error_code": error_code,
    }
    return ToolResult.error(message, data=payload, extra_info=payload, use_custom_remark=True)


def list_before(tool_name: str, target: ShareTarget) -> dict[str, object]:
    return {
        "tool_name": tool_name,
        "action": i18n.translate(tool_name, category="tool.actions"),
        "remark": _message("before", target=_target_label(target)),
    }


def list_after(
    tool_name: str,
    target: ShareTarget,
    result: ToolResult,
    arguments: Mapping[str, object] | None = None,
) -> dict[str, object]:
    action = i18n.translate(tool_name, category="tool.actions")
    if not result.ok:
        return {
            "tool_name": tool_name,
            "action": action,
            "remark": _message("after_failed", target=_target_label(target)),
        }
    data = result.data if isinstance(result.data, dict) else {}
    count = data.get("total", 0)
    if count == 0:
        return {
            "tool_name": tool_name,
            "action": action,
            "remark": _message("after_empty", target=_target_label(target)),
        }
    return {
        "tool_name": tool_name,
        "action": action,
        "remark": _message("after_success", target=_target_label(target), count=count),
    }


def build_list_detail(result: ToolResult, target: ShareTarget) -> ToolDetail:
    if result.ok:
        extra = result.extra_info or {}
        content = extra.get("md_content")
        if not isinstance(content, str):
            content = _message("no_detail")
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=f"list_{target}_shares.md", content=content))

    extra = result.extra_info or {}
    content = "\n".join(
        [f"# {_message('detail_failed_title')}", "", f"- {_message('error')}: {translate_error(extra)}"]
    )
    return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=f"list_{target}_shares.md", content=content))


def list_item_payload(item: ShareListItem) -> dict[str, object]:
    access_url = build_share_access_url(item.share_url or "", item.access_type, item.password)
    payload: dict[str, object] = {
        "resource_id": item.resource_id,
        "resource_name": item.resource_name,
        "resource_type": item.resource_type,
        "share_url": access_url or None,
        "access": item.access_type,
        "status": item.status,
        "has_password": item.has_password,
        "expire_days": item.expire_days,
        "expire_at": item.expire_at,
        "project_id": item.project_id,
        "project_name": item.project_name,
        "default_open_file_id": item.default_open_file_id,
        "view_count": item.view_count,
        "share_project": item.share_project,
        "file_ids": list(item.file_ids),
    }
    if item.password is not None:
        payload["password"] = item.password
    return payload


def list_content(result: ShareListResult) -> str:
    if not result.items:
        return f"No {result.target} shares matched the query."
    lines = [
        f"Found {len(result.items)} {result.target} share(s) (total: {result.total}).",
        f"Page: {result.page}; page size: {result.page_size}.",
    ]
    for item in result.items:
        access_url = build_share_access_url(item.share_url or "", item.access_type, item.password)
        lines.extend(
            [
                f"- Resource ID: {item.resource_id}",
                f"  Name: {item.resource_name or 'unnamed share'}",
                f"  Status: {item.status}",
                f"  Access: {item.access_type}",
                f"  URL: {access_url or 'unavailable'}",
            ]
        )
        if item.password is not None:
            lines.append(f"  Password: {item.password}")
        if item.expire_at:
            lines.append(f"  Expires: {format_tool_time(item.expire_at, 'UTC')}")
    if result.page * result.page_size < result.total:
        lines.append(f"More results are available. Request page {result.page + 1}.")
    return "\n".join(lines)


def list_detail(result: ShareListResult) -> str:
    lines = [
        f"# {_message('detail_title')}",
        "",
        f"- {_message('target')}: {_target_label(result.target)}",
        f"- {_message('total')}: {result.total}",
        "",
    ]
    if not result.items:
        lines.append(_message("empty"))
        return "\n".join(lines)
    lines.extend(
        [
            f"| {_message('resource_id')} | {_message('name')} | {_message('status')} | {_message('url')} |",
            "| --- | --- | --- | --- |",
        ]
    )
    for item in result.items:
        access_url = build_share_access_url(item.share_url or "", item.access_type, item.password)
        lines.append(
            f"| `{item.resource_id}` | {_table_value(item.resource_name)} | "
            f"{_table_value(_status_label(item.status))} | {_table_value(access_url)} |"
        )
    return "\n".join(lines)


def _target_label(target: ShareTarget) -> str:
    return i18n.translate(f"share.target.{target}", category="tool.messages")


def _status_label(status: str) -> str:
    return _message(f"status.{status}")


def _table_value(value: object) -> str:
    text = str(value) if value not in (None, "") else "-"
    return text.replace("|", "\\|").replace("\n", " ")


__all__ = [
    "build_list_detail",
    "build_list_error",
    "build_list_result",
    "list_after",
    "list_before",
]
