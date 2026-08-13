"""Browser 操作的 Agent 中断与 keepalive 适配。"""

from __future__ import annotations

from collections.abc import Awaitable
from typing import TypeVar

from agentlang.context.tool_context import ToolContext
from app.core.context.agent_context import AgentContext
from app.core.context.run_interruption import await_with_interruption

T = TypeVar("T")


def require_agent_context(tool_context: ToolContext) -> AgentContext:
    agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
    if agent_context is None:
        raise RuntimeError("Browser tools require an active Agent context")
    return agent_context


async def await_browser_operation(
    tool_context: ToolContext,
    operation: Awaitable[T],
    *,
    keep_alive: bool = False,
) -> T:
    # 延迟导入，避免 BrowserService 初始化时经 app.tools.__init__ 反向导入 Browser 工具。
    from app.tools.core.tool_keepalive import start_tool_keep_alive, stop_tool_keep_alive

    agent_context = require_agent_context(tool_context)
    keep_alive_task = start_tool_keep_alive(tool_context) if keep_alive else None
    try:
        return await await_with_interruption(
            operation,
            agent_context.get_interruption_event(),
        )
    finally:
        stop_tool_keep_alive(keep_alive_task)
