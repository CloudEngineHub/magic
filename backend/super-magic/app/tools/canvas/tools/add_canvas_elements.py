"""新增 Canvas Element 工具。"""

from typing import Any

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.schemas import ElementInput, ProjectPathParams
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="add_canvas_elements", code_mode_only=True)
class AddCanvasElements(BaseTool[ProjectPathParams]):
    """<!--zh: 新增 Canvas Element。-->Add Canvas Elements."""

    name = "add_canvas_elements"
    feedback_action_key = "canvas.add_elements"

    class Params(ProjectPathParams):
        """批量新增 Element 参数。"""

        items: list[ElementInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成新增 Element 前的批量操作反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        sources = {
            str(item.get("content", {}).get("source"))
            for item in items
            if isinstance(item, dict) and isinstance(item.get("content"), dict)
        }
        action_key = "canvas.add_generated_content" if sources == {"generated"} else (
            "canvas.import_content" if sources == {"imported"} else self.feedback_action_key
        )
        project_path = args.get("project_path", "")
        remark = f"{project_path} · adding {len(items)} Canvas Element(s)" if project_path else f"adding {len(items)} Canvas Element(s)"
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
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
        """生成新增 Element 后的逐项结果反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            remark = f"Added {sum(1 for item in values if item.get('status') in {'added', 'completed', 'pending', 'processing'})} of {len(values)} Element(s)."
        args = arguments or {}
        sources = {
            str(item.get("content", {}).get("source"))
            for item in args.get("items", [])
            if isinstance(item, dict) and isinstance(item.get("content"), dict)
        }
        action_key = "canvas.add_generated_content" if sources == {"generated"} else (
            "canvas.import_content" if sources == {"imported"} else self.feedback_action_key
        )
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成新增 Element 自己的逐项详情。"""
        data = result.data or {}
        lines = [
            "Canvas Elements added",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"element_id={item.get('element_id', '-')} | type={item.get('element_type', '-')}"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建一批 Element，并按 item 返回真实标识。"""
        try:
            result = await _application(tool_context).add_elements(
                params.project_path,
                [item.to_command() for item in params.items],
                tool_context=tool_context,
            )
            return ToolResult(
                content=items_content(
                    "Canvas Elements added successfully.",
                    result,
                    "call query_canvas_element_details with the returned element_id values to verify the persisted Elements",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
