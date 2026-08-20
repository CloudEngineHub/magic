"""Canvas Tool 共享运行时辅助。"""

from __future__ import annotations

from pathlib import Path

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.repository import CanvasRepository


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
