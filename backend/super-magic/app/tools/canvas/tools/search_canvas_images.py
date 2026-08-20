"""搜索并导入 Canvas 图片工具。"""

from typing import Any

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result
from app.tools.canvas.production.contracts import ImageSearchTask
from app.tools.canvas.schemas import ProjectPathParams, SearchImagesInput
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="search_canvas_images", code_mode_only=True)
class SearchCanvasImages(BaseTool[ProjectPathParams]):
    """搜索、下载并物化 imported Image Content。"""

    name = "search_canvas_images"
    feedback_action_key = "canvas.search_images"

    class Params(ProjectPathParams, SearchImagesInput):
        """图片搜索参数。"""

        pass

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None) -> dict[str, str]:
        """生成图片搜索前的用户反馈。"""
        args = arguments or {}
        return {"action": i18n.translate(self.feedback_action_key, category="tool.actions"), "remark": f"searching images for {args.get('topic_id') or 'the canvas'}", "tool_name": tool_name}

    async def get_after_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, result: ToolResult, execution_time: float, arguments: dict[str, Any] | None = None) -> dict[str, str]:
        """生成图片搜索后的用户反馈。"""
        data = result.data or {}
        imported = sum(int(item.get("imported_count") or 0) for item in data.get("items", []))
        return {"action": i18n.translate(self.feedback_action_key, category="tool.actions"), "remark": f"imported {imported} image candidate(s)" if result.ok else i18n.translate("canvas.operation_failed", category="tool.messages")}

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None) -> ToolDetail | None:
        """生成图片搜索详情卡片。"""
        data = result.data or {}
        lines = ["Canvas image search", f"- Status: {'succeeded' if result.ok else 'failed'}", f"- Topic: {data.get('topic_id') or (arguments or {}).get('topic_id') or '-'}"]
        for item in data.get("items", []):
            lines.append(f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | imported={item.get('imported_count', 0)} | failed={item.get('failed_count', 0)}")
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)))

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行图片搜索和逐项物化。"""
        try:
            data = await _application(tool_context).search_images(
                params.project_path,
                params.topic_id,
                [
                    ImageSearchTask(
                        item_ref=item.item_ref,
                        name=item.name,
                        query=item.query,
                        requirement_explanation=item.requirement_explanation,
                        expected_aspect_ratio=item.expected_aspect_ratio,
                        count=item.count,
                    )
                    for item in params.tasks
                ],
                tool_context,
            )
            imported = sum(int(item.get("imported_count") or 0) for item in data.get("items", []))
            summary = "Canvas image search completed." if imported else "Canvas image search failed."
            if any(item.get("status") == "partial" for item in data.get("items", [])):
                summary = "Canvas image search partially completed."
            lines = [summary, f"- Topic: {params.topic_id}"]
            created_ids: list[str] = []
            for item in data.get("items", []):
                lines.append(
                    f"- item_ref={item.get('item_ref')} | status={item.get('status')} | "
                    f"imported={item.get('imported_count', 0)} | failed={item.get('failed_count', 0)}"
                )
                created_ids.extend(
                    str(value.get("element_id"))
                    for value in item.get("items", [])
                    if value.get("element_id")
                )
                if item.get("error"):
                    lines.append(f"  Reason: {item.get('error')}")
            if created_ids:
                lines.append(f"- Created Element IDs: {', '.join(created_ids)}")
            lines.append("Next: review the imported candidates with query_canvas_element_details. Retry only a failed search item if the user requests it.")
            return ToolResult(content="\n".join(lines), data=data.to_dict())
        except Exception as error:
            return error_result(error)
