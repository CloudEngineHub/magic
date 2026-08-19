"""Canvas 工具错误映射和面向用户的动态反馈。"""

from __future__ import annotations

from typing import Any

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.domain.errors import CanvasBatchError, CanvasDomainError, CanvasProtocolError


def error_result(error: Exception) -> ToolResult:
    """把内部异常转换为稳定且可继续处理的模型结果。"""
    if isinstance(error, CanvasBatchError):
        lines = [
            "Canvas batch was not applied.",
            "- Error code: BATCH_VALIDATION_FAILED",
        ]
        for item in error.items:
            line = f"- item_ref={item['item_ref']} | status={item['status']}"
            if item.get("error_code"):
                line += f" | error_code={item['error_code']}"
            if item.get("reason"):
                line += f" | reason={item['reason']}"
            lines.append(line)
        lines.append("Action: correct only the failed items, then submit the intended batch again.")
        return ToolResult.error("\n".join(lines), data={"items": error.items, "applied": False})
    if isinstance(error, (CanvasDomainError, CanvasProtocolError)):
        code = "CANVAS_PROJECT_NOT_SUPPORTED" if error.code == "UNSUPPORTED_CANVAS_VERSION" else error.code
        action = _model_action_for_error(code)
        return ToolResult.error(
            f"Canvas operation failed.\n"
            f"- Error code: {code}\n"
            f"- Reason: {error.message}\n"
            f"- Action: {action}"
        )
    if isinstance(error, FileNotFoundError) and str(error) == "PROJECT_NOT_FOUND":
        return ToolResult.error(
            "Canvas operation failed.\n"
            "- Error code: PROJECT_NOT_FOUND\n"
            "- Action: Call initialize_canvas with the same project_path."
        )
    if isinstance(error, ValueError) and str(error) in {
        "INVALID_ELEMENT_DETAILS",
        "UNSUPPORTED_ELEMENT_DETAILS_STRUCTURE",
    }:
        return ToolResult.error(
            "Canvas operation failed.\n"
            "- Error code: INVALID_ELEMENT_DETAILS\n"
            "- Reason: Canvas metadata is unavailable or has an unsupported structure.\n"
            "- Action: Query the Canvas first and ask the user to repair the project metadata."
        )
    if isinstance(error, ValueError) and str(error) == "PROJECT_PATH_INVALID":
        return ToolResult.error(
            "Canvas operation failed.\n"
            "- Error code: PROJECT_PATH_INVALID\n"
            "- Reason: project_path must be a workspace-relative directory."
        )
    return ToolResult.error(
        "Canvas operation failed.\n"
        "- Error code: INTERNAL_ERROR\n"
        "- Reason: An unexpected internal error occurred.\n"
        "- Action: Keep the returned IDs and retry the smallest failed operation."
    )


def _model_action_for_error(code: str) -> str:
    """根据稳定错误码生成大模型可执行的下一步建议。"""
    if code in {"CONTENT_RETRY_LIMIT_REACHED", "CONTENT_RETRY_NOT_ALLOWED"}:
        return "Do not retry this Content automatically; ask the user whether to create a new Content version."
    if code == "FRAME_GENERATION_NOT_APPLICABLE":
        return "Do not wait for a Frame; use query or layout tools for the Frame."
    if code in {"CONNECTION_NOT_FOUND", "CONNECTION_ID_REQUIRED"}:
        return "Query the affected Elements to obtain the exact Connection ID, then retry only after explicit user intent."
    if code == "CANVAS_PROJECT_NOT_SUPPORTED":
        return "Ask the user to open a supported Canvas project; do not inspect or migrate the project file."
    if code in {"ELEMENT_NOT_FOUND", "CONTENT_NOT_FOUND"}:
        return "Use the latest Canvas query result to obtain the exact target ID, then retry only the failed item."
    return "Correct the failed item using the exact IDs from the latest Canvas query, then retry only that operation."


class CanvasToolFeedbackMixin:
    """生成 Canvas 工具面向用户的 action、remark 和 detail。"""

    feedback_action_key = "canvas"

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """根据工具参数生成调用前的用户反馈。"""
        action_key = self._feedback_action_key(arguments or {})
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": self._feedback_remark(arguments or {}, None),
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """根据结果状态生成调用后的用户反馈。"""
        normalized = arguments or {}
        action_key = self._feedback_action_key_after(normalized, result)
        remark = self._feedback_remark(normalized, result)
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    def _feedback_action_key_after(self, arguments: dict[str, Any], result: ToolResult) -> str:
        """根据工具结果细分等待状态等用户界面动作。"""
        action_key = self._feedback_action_key(arguments)
        if self.feedback_action_key != "canvas.wait_generation" or not result.data:
            return action_key
        items = result.data.get("items", [])
        if any(item.get("timed_out") for item in items):
            return "canvas.wait_generation_timeout"
        statuses = {item.get("status") for item in items}
        if statuses and statuses <= {"completed"}:
            return "canvas.wait_generation_completed"
        if statuses and statuses <= {"failed", "not_found", "not_applicable"}:
            return "canvas.wait_generation_failed"
        return "canvas.wait_generation_partial"

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, Any] | None = None,
    ) -> ToolDetail | None:
        """把结果整理成用户可读摘要，不直接展示原始结构或内部请求字段。"""
        data = result.data or {}
        lines = ["Canvas operation details", f"- Status: {'succeeded' if result.ok else 'failed'}"]
        if data.get("project_path"):
            lines.append(f"- Project path: {data['project_path']}")
        if "total_elements" in data:
            lines.append(
                f"- Elements: {data.get('total_elements', 0)} | "
                f"Connections: {data.get('total_connections', 0)} | "
                f"Page: {data.get('page', 1)}"
            )
        elements = data.get("elements")
        if isinstance(elements, list):
            lines.append("- Element summaries:")
            for element in elements:
                lines.append(
                    f"  - {element.get('element_id', '-')} | type={element.get('element_type', '-')} | "
                    f"parent={element.get('parent_element_id') or '-'} | depth={element.get('depth', 0)} | "
                    f"contents={len(element.get('contents') or [])}"
                )
        items = data.get("items")
        if isinstance(items, list):
            lines.append("- Item results:")
            for item in items:
                identity = item.get("element_id") or item.get("frame_element_id") or item.get("generation_task_id") or "-"
                line = f"  - {item.get('item_ref', '-')} | status={item.get('status', '-')} | target={identity}"
                if item.get("error_code"):
                    line += f" | error_code={item['error_code']}"
                elif item.get("error"):
                    line += " | error=reported in operation result"
                lines.append(line)
        for warning in data.get("warnings", []) if isinstance(data.get("warnings"), list) else []:
            lines.append(f"- Warning: {warning}")
        if not result.ok:
            lines.append("- Action: review the model-readable result and correct only the affected operation.")
        content = "\n".join(lines)
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(
                file_name=f"{getattr(self, 'name', 'canvas')}.md",
                content=content,
            ),
        )

    def _feedback_action_key(self, arguments: dict[str, Any]) -> str:
        """根据工具参数选择动作翻译键。"""
        if self.feedback_action_key in {"canvas.add_elements", "add_canvas_contents"}:
            sources = {
                str(item.get("content", {}).get("source"))
                for item in arguments.get("items", [])
                if isinstance(item, dict) and isinstance(item.get("content"), dict)
            }
            if sources == {"generated"}:
                return "canvas.add_generated_content"
            if sources == {"imported"}:
                return "canvas.import_content"
        if self.feedback_action_key == "add_canvas_connections":
            items = arguments.get("items", [])
            if any(item.get("replace_existing_connections") for item in items if isinstance(item, dict)):
                return "canvas.replace_connections"
            if items and all(
                item.get("remove_connection_ids") and not item.get("source_element_id")
                for item in items
                if isinstance(item, dict)
            ):
                return "canvas.remove_connections"
        return self.feedback_action_key

    def _feedback_remark(self, arguments: dict[str, Any], result: ToolResult | None) -> str:
        """生成包含参数规模和结果状态的短摘要。"""
        project_path = arguments.get("project_path") or ""
        items = arguments.get("items")
        prefix = f"{project_path} · " if project_path else ""
        if self.feedback_action_key == "canvas.wait_generation":
            if result is None:
                return prefix + i18n.translate(
                    "canvas.wait_limit",
                    category="tool.messages",
                    seconds=arguments.get("max_wait_seconds", 60),
                )
            values = result.data.get("items", []) if result.data else []
            completed = sum(1 for item in values if item.get("status") == "completed")
            failed = sum(1 for item in values if item.get("status") in {"failed", "not_found"})
            timed_out = sum(1 for item in values if item.get("timed_out"))
            if completed == len(values) and values:
                key = "canvas.wait_completed"
            elif failed == len(values) and values:
                key = "canvas.wait_failed"
            elif timed_out:
                key = "canvas.wait_timeout"
            else:
                key = "canvas.wait_partial"
            return prefix + i18n.translate(
                key,
                category="tool.messages",
                completed=completed,
                failed=failed,
                total=len(values),
            )
        if isinstance(items, list):
            if result is None:
                return prefix + i18n.translate(
                    "canvas.items_pending",
                    category="tool.messages",
                    total=len(items),
                )
            values = result.data.get("items", []) if result.data else []
            success = sum(
                1
                for item in values
                if not item.get("query_error")
                and not item.get("persistence_error")
                and item.get("status")
                in {
                    "completed",
                    "added",
                    "removed",
                    "replaced",
                    "already_removed",
                    "already_replaced",
                    "pending",
                    "processing",
                }
            )
            return prefix + i18n.translate(
                "canvas.items_result",
                category="tool.messages",
                succeeded=success,
                total=len(items),
            )
        element_ids = arguments.get("element_ids")
        if isinstance(element_ids, list) and element_ids:
            return prefix + "Elements: " + ", ".join(str(element_id) for element_id in element_ids)
        if "page" in arguments:
            return prefix + i18n.translate(
                "canvas.page",
                category="tool.messages",
                page=arguments.get("page"),
                limit=arguments.get("limit", "-"),
            )
        if "max_wait_seconds" in arguments:
            return prefix + i18n.translate(
                "canvas.wait_limit",
                category="tool.messages",
                seconds=arguments.get("max_wait_seconds"),
            )
        return prefix.rstrip(" ·")
