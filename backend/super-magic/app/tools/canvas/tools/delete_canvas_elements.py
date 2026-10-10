"""显式范围、真人确认的画布删除入口。"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.tools.canvas.application.delete_elements_service import DeleteCanvasTarget, DeleteElementsService
from app.tools.canvas.presentation import error_result
from app.tools.canvas.tools.management_tool import CanvasManagementTool
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool


# 完整说明：agents/skills/canvas-manager/references/element-management.md。
@tool(name="delete_canvas_elements", code_mode_only=True)
class DeleteCanvasElements(CanvasManagementTool):
    """Prepare or remove exact Canvas targets and their selected versions."""

    name = "delete_canvas_elements"

    class Params(BaseToolParams):
        model_config = ConfigDict(extra="forbid")
        project_path: str = Field(min_length=1)
        targets: list[DeleteCanvasTarget] = Field(min_length=1)
        mode: Literal["remove", "remove_with_files"] = "remove"
        stage: Literal["prepare", "execute"] = "prepare"

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        try:
            result = await DeleteElementsService(_application(tool_context).repository, tool_context).run(
                params.project_path,
                params.targets,
                params.mode,
                params.stage,
            )
            lines = [f"Canvas deletion stage: {result['stage']}; mode={params.mode}."]
            if result["stage"] == "prepared":
                lines.append(f"Affected connections: {', '.join(result['connection_ids']) or 'none'}.")
            for item in result["items"]:
                lines.append(
                    f"- element_id={item['element_id']} | name={item['name']} | scope={item['scope']} | affected_elements={', '.join(item['descendant_ids'])} | affected_contents={', '.join(item['content_ids'])} | status={item.get('status', 'prepared')}"
                )
                if item.get("reason"):
                    lines.append(str(item["reason"]))
                if item.get("metadata_cleanup_complete") is False:
                    lines.append("The Canvas target was removed, but its user detail metadata could not be cleaned up.")
            for file in result.get("files", []):
                lines.append(
                    f"- file_id={file['file_id']} | file_name={file['file_name']} | shared={file['shared']} | status={file.get('status', 'prepared')}"
                )
                if file.get("error"):
                    lines.append(str(file["error"]))
            if result["stage"] == "prepared":
                lines.append(
                    "No changes were made. Ask the user to confirm this exact scope with ordinary ask_user questions XML; execute only after explicit agreement."
                )
            lines.append(
                "Removing a generating placeholder does not cancel provider generation or refund charges. Restoring a recycled file does not restore Canvas Elements or connections."
            )
            return ToolResult(content="\n".join(lines), ok=bool(result.get("complete", True)), data=result)
        except Exception as error:
            return error_result(error)
