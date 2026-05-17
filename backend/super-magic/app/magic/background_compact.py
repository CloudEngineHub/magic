# -*- coding: utf-8 -*-
"""
后台上下文压缩：在上下文接近阈值时，fork 一个同类型子 Agent 执行压缩，
主 Agent 继续工作，压缩完成后无感应用。
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

from agentlang.logger import get_logger

if TYPE_CHECKING:
    from agentlang.chat_history.chat_history import ChatHistory
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)

# 后台压缩等待超时（秒），超时后回退到前台阻塞压缩
BACKGROUND_COMPACT_WAIT_TIMEOUT = 300


@dataclass
class BackgroundCompactState:
    """后台压缩状态机

    生命周期: idle → running → completed/failed → applied → idle
    forked subagent 的 final_response 就是压缩摘要。
    """
    # 后台任务引用（asyncio.Task 包装了 run_isolated_agent 调用）
    _task: Optional[asyncio.Task] = field(default=None, repr=False)

    # 快照时的消息数量（用于确定哪些是压缩后新增的消息）
    snapshot_message_count: int = 0

    # 任务启动时间
    started_at: float = 0.0

    @property
    def is_idle(self) -> bool:
        return self._task is None

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    @property
    def is_completed(self) -> bool:
        return self._task is not None and self._task.done()

    @property
    def elapsed_seconds(self) -> float:
        if self.started_at <= 0:
            return 0.0
        return time.time() - self.started_at

    def get_summary(self) -> Optional[str]:
        """获取压缩结果（仅在 is_completed 时有效）

        返回 forked subagent 的 final_response（即压缩摘要文本），
        失败或取消时返回 None。
        """
        if not self.is_completed:
            return None
        try:
            result = self._task.result()
            if not result or len(result.strip()) < 100:
                logger.warning(f"后台压缩结果过短: {len(result or '')} chars")
                return None
            return result
        except (asyncio.CancelledError, Exception) as e:
            logger.warning(f"后台压缩任务异常: {e}")
            return None

    def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("后台压缩任务已取消")

    def reset(self) -> None:
        self.cancel()
        self._task = None
        self.snapshot_message_count = 0
        self.started_at = 0.0


async def start_background_compact(
    state: BackgroundCompactState,
    agent_name: str,
    agent_context: "AgentContext",
    chat_history: "ChatHistory",
    compact_instruction: str,
    model_id: Optional[str] = None,
) -> None:
    """通过 fork 子 Agent 启动后台压缩。

    fork 出一个同类型子 Agent（继承完整对话历史），
    让它生成上下文摘要作为 final_response 返回。
    """
    if state.is_running:
        logger.warning("后台压缩任务已在运行中，跳过重复启动")
        return

    state.reset()
    state.snapshot_message_count = len(chat_history.messages)
    state.started_at = time.time()

    compact_prompt = (
        "The conversation context is too long and must be compacted now.\n"
        "Generate a comprehensive summary following the guidelines below.\n"
        "Return the summary directly as your final response text.\n"
        "Do NOT call any tools. Do NOT ask clarifying questions.\n\n"
        f"{compact_instruction}"
    )

    from datetime import datetime

    agent_id = f"bg-compact-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    from app.service.agent_runner import run_isolated_agent

    state._task = asyncio.create_task(
        run_isolated_agent(
            agent_name=agent_name,
            agent_id=agent_id,
            prompt=compact_prompt,
            parent_context=agent_context,
            model_id=model_id,
            fork_source_chat_history=chat_history,
            disable_compaction=True,
        )
    )

    logger.info(
        f"后台压缩 fork 子 Agent 已启动: "
        f"agent_name={agent_name}, agent_id={agent_id}, "
        f"snapshot_messages={state.snapshot_message_count}"
    )
