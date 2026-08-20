"""查询 Canvas 概览工具。"""

from typing import Any

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result, overview_content
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool


@tool(name="query_canvas_overview", code_mode_only=True)
class QueryCanvasOverview(BaseTool[BaseToolParams]):
    """<!--zh: 查询 Canvas 轻量概览。-->Query a lightweight Canvas overview."""

    name = "query_canvas_overview"
    feedback_action_key = "canvas.query_overview"

    class Params(BaseToolParams):
        """概览分页参数。"""

        model_config = ConfigDict(extra="forbid")

        project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
        page: int = Field(1, ge=1, description="One-based page number.")
        limit: int = Field(50, ge=1, le=100, description="Maximum Elements returned on this page.")

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成概览分页查询前的反馈。"""
        args = arguments or {}
        project_path = args.get("project_path", "")
        remark = i18n.translate(
            "canvas.page",
            category="tool.messages",
            page=args.get("page", 1),
            limit=args.get("limit", 50),
        )
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": f"{project_path} · {remark}" if project_path else remark,
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
        """生成概览查询完成后的分页结果反馈。"""
        args = arguments or {}
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            data = result.data or {}
            remark = (
                f"{data.get('project_path', args.get('project_path', ''))} · "
                f"{data.get('total_elements', 0)} Elements, {data.get('total_connections', 0)} Connections"
            )
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成概览查询自己的详情卡片。"""
        data = result.data or {}
        lines = [
            "Canvas overview",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
            f"- Elements: {data.get('total_elements', 0)}",
            f"- Connections: {data.get('total_connections', 0)}",
            f"- Page: {data.get('page', (arguments or {}).get('page', 1))}",
        ]
        for element in data.get("elements", []):
            lines.append(
                f"- {element.get('element_id', '-')} | type={element.get('element_type', '-')} | "
                f"parent={element.get('parent_element_id') or '-'} | depth={element.get('depth', 0)} | "
                f"children={element.get('child_count', 0)}"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """读取当前分页概览。"""
        try:
            result = await _application(tool_context).overview(params.project_path, params.page, params.limit)
            return ToolResult(content=overview_content(result.to_dict()), data=result.to_dict())
        except Exception as error:
            return error_result(error)
