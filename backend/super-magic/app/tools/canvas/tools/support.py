"""Canvas Tool 共享运行时辅助。"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.presentation import CanvasToolFeedbackMixin, elements_content, error_result, items_content, overview_content
from app.tools.canvas.repository import CanvasRepository
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


def _workspace(tool_context: ToolContext | None) -> Path:
    """解析当前 Agent 的运行时工作区。"""
    if tool_context is not None:
        agent_context = tool_context.get_extension("agent_context")
        if agent_context is not None and agent_context.get_workspace_dir():
            return Path(agent_context.get_workspace_dir())
        if tool_context.base_dir:
            return Path(tool_context.base_dir)
    return Path.cwd()


def _application(tool_context: ToolContext | None) -> CanvasApplication:
    """创建当前调用使用的 Canvas Application。"""
    return CanvasApplication(CanvasRepository(_workspace(tool_context)))


_error_result = error_result
_overview_content = overview_content
_elements_content = elements_content
_items_content = items_content
