"""选择 Canvas 主 Content 工具。"""

from typing import Any

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.application.commands import SelectMainContentCommand
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool


class MainContentInput(BaseToolParams):
    """单个主 Content 选择参数。"""

    model_config = ConfigDict(extra="forbid")

    item_ref: str = Field(..., min_length=1)
    element_id: str = Field(..., min_length=1)
    content_id: str = Field(..., min_length=1)

    def to_command(self) -> SelectMainContentCommand:
        """转换为应用层主 Content 选择命令。"""
        return SelectMainContentCommand(self.item_ref, self.element_id, self.content_id)


@tool(name="select_canvas_main_content", code_mode_only=True)
class SelectCanvasMainContent(BaseTool[BaseToolParams]):
    """<!--zh: 显式选择 Element 的主 Content。-->Select the main Content for Elements."""

    name = "select_canvas_main_content"
    feedback_action_key = "canvas.select_main"

    class Params(BaseToolParams):
        """批量选择主 Content 参数。"""

        model_config = ConfigDict(extra="forbid")

        project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
        items: list[MainContentInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成主 Content 切换前的明确目标反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        project_path = args.get("project_path", "")
        remark = f"{project_path} · selecting main Content for {len(items)} Element(s)" if project_path else f"selecting main Content for {len(items)} Element(s)"
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
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
        """生成主 Content 切换后的结果反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            remark = f"Selected main Content for {len(values)} Element(s)."
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成主 Content 选择自己的指针变更详情。"""
        data = result.data or {}
        lines = [
            "Canvas main Content selection",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"element_id={item.get('element_id', '-')} | main_content_id={item.get('main_content_id', '-')}"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """只修改明确选择的 main Content 指针。"""
        try:
            result = await _application(tool_context).select_main(
                params.project_path,
                [item.to_command() for item in params.items],
            )
            return ToolResult(
                content=items_content(
                    "Canvas main Content selected successfully.",
                    result.to_dict(),
                    "call query_canvas_element_details with the returned element_id values to verify the main Content selection",
                ),
                data=result.to_dict(),
            )
        except Exception as error:
            return error_result(error)
