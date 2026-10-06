"""已有元素结构管理；本轮仅取消画框。"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.tools.canvas.application.unframe_elements_service import UnframeElementsService
from app.tools.canvas.presentation import error_result
from app.tools.canvas.tools.management_tool import CanvasManagementTool
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool


# 完整说明：agents/skills/canvas-manager/references/element-management.md。
@tool(name="manage_canvas_elements", code_mode_only=True)
class ManageCanvasElements(CanvasManagementTool):
    """Release Frame children without deleting their media."""

    name = "manage_canvas_elements"

    class Params(BaseToolParams):
        model_config = ConfigDict(extra="forbid")
        project_path: str = Field(min_length=1)
        element_ids: list[str] = Field(min_length=1)
        action: Literal["unframe"] = "unframe"

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        try:
            result = await UnframeElementsService(_application(tool_context).repository).unframe(
                params.project_path, params.element_ids
            )
            lines = ["Frames removed; child Elements retain their positions, Contents and files."]
            for item in result["items"]:
                lines.append(f"- frame={item['element_id']} | released_children={', '.join(item['child_element_ids'])}")
            if result.get("warning"):
                lines.append(str(result["warning"]))
            return ToolResult(content="\n".join(lines), ok=bool(result["complete"]), data=result)
        except Exception as error:
            return error_result(error)
