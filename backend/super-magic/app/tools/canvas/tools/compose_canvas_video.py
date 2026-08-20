"""合成 Canvas 最终视频工具。"""

from typing import Any

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result
from app.tools.canvas.production.contracts import VideoCompositionCommand
from app.tools.canvas.schemas import ComposeVideoInput, ProjectPathParams
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="compose_canvas_video", code_mode_only=True)
class ComposeCanvasVideo(BaseTool[ProjectPathParams]):
    """按 Video Edit 的主 Content 同步合成最终 Video Content。"""

    name = "compose_canvas_video"
    feedback_action_key = "canvas.compose_video"

    class Params(ProjectPathParams, ComposeVideoInput):
        """视频合成参数。"""

        pass

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None) -> dict[str, str]:
        """生成视频合成前的用户反馈。"""
        args = arguments or {}
        return {"action": i18n.translate(self.feedback_action_key, category="tool.actions"), "remark": f"composing {args.get('result_name') or 'the final video'}", "tool_name": tool_name}

    async def get_after_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, result: ToolResult, execution_time: float, arguments: dict[str, Any] | None = None) -> dict[str, str]:
        """生成视频合成后的用户反馈。"""
        data = result.data or {}
        return {"action": i18n.translate(self.feedback_action_key, category="tool.actions"), "remark": f"composed {data.get('src') or 'video'}" if result.ok else i18n.translate("canvas.operation_failed", category="tool.messages")}

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None) -> ToolDetail | None:
        """生成视频合成详情卡片。"""
        data = result.data or {}
        lines = ["Canvas video composition", f"- Status: {'succeeded' if result.ok else 'failed'}", f"- Result Element ID: {data.get('result_element_id', '-')}", f"- Result Content ID: {data.get('result_content_id', '-')}", f"- Asset path: {data.get('src', '-')}"]
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)))

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行同步视频合成并返回结果标识。"""
        try:
            data = await _application(tool_context).compose_video(
                params.project_path,
                VideoCompositionCommand(
                    video_edit_element_id=params.video_edit_element_id,
                    result_name=params.result_name,
                    result_element_id=params.result_element_id,
                ),
                tool_context,
            )
            return ToolResult(content=f"Canvas video composition completed.\n- Result Element ID: {data['result_element_id']}\n- Result Content ID: {data['result_content_id']}\n- Status: completed\n- Asset path: {data['src']}\nNext: call query_canvas_element_details with the returned element_id to verify the persisted result.", data=data.to_dict())
        except Exception as error:
            return error_result(error)
