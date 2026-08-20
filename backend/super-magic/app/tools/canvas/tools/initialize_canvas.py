"""初始化 Canvas 工具。"""

from typing import Any

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n

from app.tools.canvas.schemas import ProjectPathParams
from app.tools.canvas.presentation import error_result
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool

@tool(name="initialize_canvas", code_mode_only=True)
class InitializeCanvas(BaseTool[ProjectPathParams]):
    """<!--zh: 初始化 Canvas 项目。-->Initialize a Canvas project."""

    name = "initialize_canvas"
    feedback_action_key = "canvas.initialize"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成初始化前的项目级反馈。"""
        project_path = (arguments or {}).get("project_path", "")
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": f"{project_path} · initializing Canvas project" if project_path else "initializing Canvas project",
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
        """生成初始化后的创建状态反馈。"""
        project_path = (arguments or {}).get("project_path", "")
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            state = "created" if (result.data or {}).get("created") else "already existed"
            remark = f"{project_path} · Canvas project {state}" if project_path else f"Canvas project {state}"
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成初始化工具自己的详情卡片。"""
        data = result.data or {}
        project_path = data.get("project_path") or (arguments or {}).get("project_path") or "-"
        state = "created" if data.get("created") else "already existed"
        content = "\n".join([
            "Canvas initialization",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {project_path}",
            f"- State: {state}",
        ])
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content=content),
        )

    async def execute(self, tool_context: ToolContext, params: ProjectPathParams) -> ToolResult:
        """初始化项目并返回工作区相对路径。"""
        try:
            result = await _application(tool_context).initialize(params.project_path)
            state = "created" if result["created"] else "already existed"
            return ToolResult(
                content=f"Canvas project {state}.\n- Project path: {params.project_path}",
                data=result,
            )
        except Exception as error:
            return error_result(error)
