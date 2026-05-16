"""工具级沙盒保活

长时间阻塞的工具（如 shell_await 无限等待、wait_for_subagents 长轮询、音频转录轮询等）
在等待期间需要定期续期 agent_context.update_activity_time()，否则沙盒会因闲置超时被杀。

用法：
    keep_alive_task = start_tool_keep_alive(tool_context)
    try:
        await some_long_blocking_operation()
    finally:
        stop_tool_keep_alive(keep_alive_task)
"""

import asyncio
from typing import Optional

from agentlang.context.tool_context import ToolContext

# 默认续期间隔：30 秒
DEFAULT_KEEP_ALIVE_INTERVAL = 30.0


def start_tool_keep_alive(
    tool_context: ToolContext,
    interval: float = DEFAULT_KEEP_ALIVE_INTERVAL,
) -> Optional[asyncio.Task]:
    """启动后台续期任务，每 interval 秒调用一次 update_activity_time()。

    返回 asyncio.Task 或 None（agent_context 不可用时）。
    调用方必须在工具执行结束后调用 stop_tool_keep_alive() 取消任务。
    """
    agent_context = tool_context.get_extension("agent_context") if tool_context else None
    if agent_context is None:
        return None

    async def _keep_alive() -> None:
        while True:
            await asyncio.sleep(interval)
            agent_context.update_activity_time()

    return asyncio.create_task(_keep_alive())


def stop_tool_keep_alive(task: Optional[asyncio.Task]) -> None:
    """取消续期任务。传入 None 时为 no-op。"""
    if task is not None:
        task.cancel()
