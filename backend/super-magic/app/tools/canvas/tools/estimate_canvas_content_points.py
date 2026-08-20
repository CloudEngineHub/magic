"""预估 Canvas 内容产出积分工具。"""

from typing import Any

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result
from app.tools.canvas.production.contracts import VideoPointEstimateItem
from app.tools.canvas.schemas import ProjectPathParams, VideoPointEstimateItemInput
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="estimate_canvas_content_points", code_mode_only=True)
class EstimateCanvasContentPoints(BaseTool[ProjectPathParams]):
    """对支持计费的内容产出规则执行无副作用积分预估。"""

    name = "estimate_canvas_content_points"
    feedback_action_key = "canvas.estimate_content_points"

    class Params(ProjectPathParams):
        """批量积分预估参数。"""

        production_rule: str = Field("video_generation", min_length=1)
        items: list[VideoPointEstimateItemInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None) -> dict[str, str]:
        """生成积分预估前的用户反馈。"""
        args = arguments or {}
        return {"action": i18n.translate(self.feedback_action_key, category="tool.actions"), "remark": f"estimating content points for {len(args.get('items') or [])} item(s)", "tool_name": tool_name}

    async def get_after_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, result: ToolResult, execution_time: float, arguments: dict[str, Any] | None = None) -> dict[str, str]:
        """生成积分预估后的用户反馈。"""
        data = result.data or {}
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        elif data.get("can_continue"):
            remark = f"estimated {data.get('total_points')} point(s)"
        else:
            remark = "content point estimate is unavailable"
        return {"action": i18n.translate(self.feedback_action_key, category="tool.actions"), "remark": remark}

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None) -> ToolDetail | None:
        """生成积分预估详情卡片。"""
        data = result.data or {}
        lines = ["Canvas content point estimate", f"- Status: {'succeeded' if result.ok else 'failed'}", f"- Rule: {data.get('production_rule') or (arguments or {}).get('production_rule') or '-'}"]
        for item in data.get("items", []):
            lines.append(f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | points={item.get('points', '-')}")
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)))

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行积分预估并返回估算凭证。"""
        try:
            result = await _application(tool_context).estimate_content_points(
                params.project_path,
                params.production_rule,
                [VideoPointEstimateItem(item.item_ref, item.to_parameters()) for item in params.items],
                tool_context,
            )
            if result.get("can_continue"):
                lines = ["Content point estimate completed.", f"- Rule: {params.production_rule}"]
                for item in result["items"]:
                    lines.append(f"- item_ref={item['item_ref']}: {item.get('points', 0)} points")
                lines.extend([f"- Total: {result.get('total_points')} points", f"- Estimate ID: {result.get('estimate_id')}", "Next: ask the user to confirm the parameters and estimated points. After confirmation, submit video generation with the same request and estimate_id."])
            else:
                lines = ["Content point estimate is unavailable.", f"- Rule: {params.production_rule}"]
                for item in result["items"]:
                    lines.append(f"- item_ref={item['item_ref']} | status={item['status']} | reason={item.get('reason') or '-'}")
                lines.append("Next: ask the user whether to revise or cancel. Do not submit generation automatically.")
            return ToolResult(content="\n".join(lines), data=result.to_dict())
        except Exception as error:
            return error_result(error)
