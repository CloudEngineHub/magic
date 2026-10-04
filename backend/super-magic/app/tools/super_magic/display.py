"""Model-readable results and conservative transport error mapping."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.infrastructure.sdk.base.exceptions import HttpRequestError
from app.infrastructure.sdk.magic_service.kernel.magic_service_exception import (
    MagicServiceApiError,
    MagicServiceUnauthorizedException,
)
from app.tools.core import BaseTool, BaseToolParams

from .context import ProductContext, ProductContextError, current_product_context

T = TypeVar("T", bound=BaseToolParams)


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
