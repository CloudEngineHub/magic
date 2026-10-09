"""Separate model results, localized user details, and transport error mapping."""

from __future__ import annotations

import asyncio
import html
import re
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.infrastructure.sdk.base.exceptions import HttpRequestError
from app.infrastructure.sdk.magic_service.kernel.magic_service_exception import (
    MagicServiceApiError,
    MagicServiceUnauthorizedException,
)
from app.i18n import i18n
from app.tools.core import BaseTool, BaseToolParams
from app.tools.utils.time_display import format_tool_time

from .context import ProductContext, ProductContextError, current_product_context

T = TypeVar("T", bound=BaseToolParams)


def _label(key: str, **kwargs: object) -> str:
    return i18n.translate(key, category="tool.product", **kwargs)


def _visible_text(value: object, limit: int = 2000) -> str:
    """Render resource text literally, without interpreting HTML or Markdown."""
    text = str(value) if isinstance(value, (str, int, float)) else ""
    text = text[:limit] + ("…" if len(text) > limit else "")
    return re.sub(r"([\\`*_{}\[\]()#+.!|>\-])", r"\\\1", html.escape(text))


def _state(data: dict[str, Any]) -> str:
    state = data.get("task_status", data.get("status"))
    if state is None and "success" in data:
        state = "success" if data["success"] is True else "failed" if data["success"] is False else None
    if state is None:
        return ""
    key = f"status.{state}"
    label = _label(key)
    return label if label != key else _label("status.unknown")


def _time(value: object) -> str:
    try:
        return format_tool_time(value)
    except (ValueError, OverflowError, OSError):
        return "-"


def _resource_lines(data: dict[str, Any]) -> list[str]:
    lines = []
    for key in ("name", "project_name", "topic_name", "file_name", "project_description", "relative_file_path",
                "project_count", "file_size", "version", "count", "current", "total"):
        if data.get(key) is not None:
            value = _visible_text(data[key]).replace("\n", " ")
            if value:
                lines.append(f"- {_label(f'field.{key}')}: {value}")
    state = _state(data)
    if state:
        lines.append(f"- {_label('field.status')}: {state}")
    for key in ("archived", "is_archived", "is_directory"):
        if isinstance(data.get(key), (bool, int)):
            lines.append(f"- {_label(f'field.{key}')}: {_label('yes' if data[key] else 'no')}")
    for key in ("created_at", "updated_at", "expires_at"):
        if data.get(key) is not None:
            lines.append(f"- {_label(f'field.{key}')}: {_time(data[key])}")
    return lines


def product_detail(tool_name: str, result: ToolResult) -> ToolDetail:
    """Build bounded user-facing summaries from public fields, never raw payloads."""
    data = result.data if isinstance(result.data, dict) else {}
    lines = [f"# {i18n.translate(tool_name, category='tool.actions')}", ""]
    if not result.ok:
        code = data.get("code")
        key = f"error.{code}"
        message = _label(key) if isinstance(code, str) else key
        lines.extend([message if message != key else _label("error.default"), ""])
    lines.extend(_resource_lines(data))
    state = data.get("task_status", data.get("status"))
    if state in {"accepted", "queued", "waiting", "processing", "cancel_requested", "delete_requested"}:
        lines.extend(["", _label("pending")])

    for collection in ("items", "files"):
        records = data.get(collection)
        if not isinstance(records, list):
            continue
        lines.extend(["", _label("records", count=len(records)), ""])
        if not records:
            lines.append(_label("empty"))
        else:
            lines.extend([f"| {_label('field.name')} | {_label('field.status')} |", "| --- | --- |"])
            for index, item in enumerate(records[:100], 1):
                if not isinstance(item, dict):
                    continue
                name = next((item[key] for key in ("name", "project_name", "topic_name", "file_name") if item.get(key)), None)
                name = _visible_text(name, 200).replace("\n", " ") if name else _label("record", number=index)
                lines.append(f"| {name} | {_state(item) or '-'} |")
            if len(records) > 100:
                lines.extend(["", _label("truncated")])

    messages = data.get("messages")
    if isinstance(messages, list):
        lines.extend(["", _label("messages", count=len(messages)), ""])
        if not messages:
            lines.append(_label("empty_messages"))
        remaining = 12000
        for message in messages:
            if not isinstance(message, dict):
                continue
            if remaining <= 0:
                lines.append(_label("truncated"))
                break
            body = message.get("text", "")
            limit = min(remaining, 2000)
            text = _visible_text(body, limit)
            remaining -= min(len(body), limit) if isinstance(body, str) else 0
            role = message.get("role")
            role_key = role if role in {"user", "assistant"} else "unknown"
            lines.extend([f"### {_label(f'role.{role_key}')}", "", _time(message.get("timestamp")), "", text, ""])
            if message.get("truncated") or (isinstance(body, str) and len(body) > limit):
                lines.extend([_label("truncated"), ""])
        if data.get("omitted_count"):
            lines.append(_label("omitted", count=data["omitted_count"]))

    task_result = data.get("result")
    if state == "finished" and isinstance(task_result, dict) and isinstance(task_result.get("content"), str):
        lines.extend(["", f"## {_label('task_result')}", "", _visible_text(task_result["content"], 6000)])
        if task_result.get("truncated") or len(task_result["content"]) > 6000:
            lines.extend(["", _label("truncated")])
    if data.get("partial_success"):
        lines.extend(["", _label("partial_success")])
    if data.get("page") is not None:
        lines.extend(["", _label("page", page=data["page"])])
    if data.get("has_more") is True:
        lines.extend(["", _label("more")])
    elif data.get("has_more") is False:
        lines.extend(["", _label("no_more")])
    if len(lines) == 2:
        lines.append(_label("completed"))
    return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=f"{tool_name}.md", content="\n".join(lines)))


def success(action: str, data: dict[str, Any]) -> ToolResult:
    state = data.get("status")
    if data.get("success") is False or state in {"failed", "not_found"}:
        return ToolResult.error(f"{action} failed or was not found.", data=data)
    if state in {"processing", "waiting", "queued"}:
        key = data.get("batch_key", data.get("queue_id", data.get("task_id")))
        reference = f" Reference: {key}." if key else ""
        return ToolResult(content=f"{action} is {state}.{reference} Check its status before reporting completion.", data=data)
    if "items" in data:
        items = data["items"]
        page = data.get("page")
        more = data.get("has_more")
        suffix = f" Page {page}." if page is not None else ""
        if more is not None:
            suffix += " More records are available." if more else " No further records are reported."
        lines = [f"{action}: {len(items)} item(s).{suffix}"]
        for item in items:
            name = next((item[key] for key in ("name", "project_name", "topic_name", "file_name") if item.get(key)), "Unnamed")
            identifier = item.get("id", item.get("file_id", item.get("queue_id", "unknown")))
            state_text = f", status: {item['status']}" if item.get("status") is not None else ""
            lines.append(f"- {name} (id: {identifier}{state_text})")
        return ToolResult(content="\n".join(lines), data=data)
    name = next((data[key] for key in ("name", "project_name", "topic_name", "file_name") if data.get(key)), None)
    identifier = data.get("id", data.get("project_id", data.get("topic_id")))
    details = f" {name}" if name else ""
    details += f" (id: {identifier})" if identifier else ""
    return ToolResult(content=f"{action} completed.{details}", data=data)


class ProductTool(BaseTool[T]):
    """Run a product operation with the current chat identity."""

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None,
    ) -> ToolDetail:
        return product_detail(self.name, result)

    async def run_product(
        self,
        tool_context: ToolContext,
        action: str,
        operation: Callable[[ProductContext], Awaitable[dict[str, Any]]],
        *,
        write: bool = False,
        format_result: Callable[[dict[str, Any]], ToolResult] | None = None,
    ) -> ToolResult:
        try:
            context = current_product_context(tool_context)
            if context.agent.is_interruption_requested():
                raise asyncio.CancelledError
            data = await operation(context)
            return format_result(data) if format_result else success(action, data)
        except asyncio.CancelledError:
            raise
        except ProductContextError as exc:
            return ToolResult.error(str(exc), data={"code": "authorization_required"})
        except MagicServiceUnauthorizedException:
            return ToolResult.error("The current user is not authorized for this resource.", data={"code": "authorization_failed"})
        except MagicServiceApiError as exc:
            return ToolResult.error("The service rejected this resource operation.", data={"code": "service_rejected", "api_code": exc.api_code})
        except (HttpRequestError, TimeoutError):
            code = "outcome_unknown" if write else "network_error"
            message = "The write may have been accepted; check the resource before retrying." if write else "The service request failed."
            return ToolResult.error(message, data={"code": code})
        except ValueError as exc:
            return ToolResult.error(str(exc), data={"code": "invalid_input_or_response"})
        except Exception:
            return ToolResult.error("The product operation failed unexpectedly.", data={"code": "unexpected_error"})
