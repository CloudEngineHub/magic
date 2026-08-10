"""管理会话后记忆提取的累计阈值与空闲触发。"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from agentlang.config.config import config
from agentlang.logger import get_logger

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)

ExtractionTrigger = Callable[[], Awaitable[None]]
SessionKey = tuple[str, str, str]


@dataclass(slots=True)
class _PendingExtraction:
    """保存一个主会话尚未消费的内存态触发数据。"""

    count: int
    trigger: ExtractionTrigger
    agent_context: "AgentContext"
    idle_task: asyncio.Task[None] | None = None


class MemoryExtractionTriggerService:
    """累计符合条件的任务，并在达到阈值或空闲超时后触发提取。"""

    _DEFAULT_TASK_THRESHOLD = 3
    _DEFAULT_IDLE_TIMEOUT_SECONDS = 10 * 60
    _ACTIVE_TASK_RECHECK_SECONDS = 60

    def __init__(
        self,
        task_threshold: int | None = None,
        idle_timeout_seconds: float | None = None,
    ) -> None:
        """初始化进程内会话状态和触发参数。"""
        self._task_threshold = self._normalize_positive_int(
            task_threshold,
            config_key="memory.after_run.extraction_task_threshold",
            default=self._DEFAULT_TASK_THRESHOLD,
        )
        self._idle_timeout_seconds = self._normalize_positive_float(
            idle_timeout_seconds,
            config_key="memory.after_run.extraction_idle_timeout_seconds",
            default=self._DEFAULT_IDLE_TIMEOUT_SECONDS,
        )
        self._pending: dict[SessionKey, _PendingExtraction] = {}
        self._lock = asyncio.Lock()

    async def record_finished_task(
        self,
        agent_context: "AgentContext",
        *,
        should_count: bool,
        trigger: ExtractionTrigger,
    ) -> None:
        """记录一次正常结束的主任务，并按阈值或空闲策略调度提取。"""
        session_key = self._build_session_key(agent_context)
        pending_count = 0

        async with self._lock:
            pending = self._pending.get(session_key)
            if pending is None:
                if not should_count:
                    return
                pending = _PendingExtraction(
                    count=0,
                    trigger=trigger,
                    agent_context=agent_context,
                )
                self._pending[session_key] = pending

            pending.trigger = trigger
            pending.agent_context = agent_context
            if should_count:
                pending.count += 1

            if pending.count >= self._task_threshold:
                pending_count = pending.count
                self._remove_pending_locked(session_key, pending)
            else:
                self._schedule_idle_trigger_locked(session_key, pending)

        if pending_count > 0:
            await self._execute_trigger(
                session_key=session_key,
                consumed_count=pending_count,
                trigger=trigger,
                agent_context=agent_context,
                reason="task_threshold",
            )

    def _schedule_idle_trigger_locked(
        self,
        session_key: SessionKey,
        pending: _PendingExtraction,
        *,
        delay_seconds: float | None = None,
    ) -> None:
        """取消旧定时器，并从指定时间重新计算空闲窗口。"""
        if pending.idle_task is not None:
            pending.idle_task.cancel()

        task = asyncio.create_task(
            self._wait_for_idle(
                session_key,
                delay_seconds=delay_seconds,
            ),
            name=f"memory-extraction-idle-{pending.agent_context.context_id}",
        )
        pending.idle_task = task
        task.add_done_callback(self._consume_task_result)

    async def _wait_for_idle(
        self,
        session_key: SessionKey,
        *,
        delay_seconds: float | None = None,
    ) -> None:
        """等待会话静默，消费仍未达到阈值的累计任务。"""
        try:
            await asyncio.sleep(delay_seconds or self._idle_timeout_seconds)
        except asyncio.CancelledError:
            return

        current_task = asyncio.current_task()
        async with self._lock:
            pending = self._pending.get(session_key)
            if pending is None or pending.idle_task is not current_task:
                return
            remaining_idle_seconds = self._remaining_idle_seconds(pending.agent_context)
            if self._is_agent_running(pending.agent_context.context_id):
                self._schedule_idle_trigger_locked(
                    session_key,
                    pending,
                    delay_seconds=self._ACTIVE_TASK_RECHECK_SECONDS,
                )
                return
            if remaining_idle_seconds > 0:
                self._schedule_idle_trigger_locked(
                    session_key,
                    pending,
                    delay_seconds=remaining_idle_seconds,
                )
                return
            consumed_count = pending.count
            trigger = pending.trigger
            self._remove_pending_locked(session_key, pending, cancel_idle_task=False)

        if consumed_count > 0:
            await self._execute_trigger(
                session_key=session_key,
                consumed_count=consumed_count,
                trigger=trigger,
                agent_context=pending.agent_context,
                reason="idle_timeout",
            )

    async def _execute_trigger(
        self,
        *,
        session_key: SessionKey,
        consumed_count: int,
        trigger: ExtractionTrigger,
        agent_context: "AgentContext",
        reason: str,
    ) -> None:
        """执行一次触发；提交失败时恢复计数并重新等待空闲窗口。"""
        try:
            await trigger()
            logger.debug(
                "会话后记忆提取触发条件已消费: "
                f"session={self._format_session_key(session_key)}, "
                f"reason={reason}, consumed_count={consumed_count}"
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "触发会话后记忆提取失败，恢复未消费计数: "
                f"session={self._format_session_key(session_key)}, "
                f"reason={reason}, consumed_count={consumed_count}",
                exc_info=True,
            )
            await self._restore_pending_count(
                session_key=session_key,
                count=consumed_count,
                trigger=trigger,
                agent_context=agent_context,
            )

    async def _restore_pending_count(
        self,
        *,
        session_key: SessionKey,
        count: int,
        trigger: ExtractionTrigger,
        agent_context: "AgentContext",
    ) -> None:
        """把提交失败的累计数量合并回当前会话状态。"""
        async with self._lock:
            pending = self._pending.get(session_key)
            if pending is None:
                pending = _PendingExtraction(
                    count=0,
                    trigger=trigger,
                    agent_context=agent_context,
                )
                self._pending[session_key] = pending
            pending.count += count
            self._schedule_idle_trigger_locked(session_key, pending)

    def _remove_pending_locked(
        self,
        session_key: SessionKey,
        pending: _PendingExtraction,
        *,
        cancel_idle_task: bool = True,
    ) -> None:
        """移除已消费状态，并按需取消关联的空闲定时器。"""
        self._pending.pop(session_key, None)
        if cancel_idle_task and pending.idle_task is not None:
            pending.idle_task.cancel()

    @staticmethod
    def _consume_task_result(task: asyncio.Task[None]) -> None:
        """消费后台定时器结果，避免未读取异常警告。"""
        if task.cancelled():
            return
        try:
            task.exception()
        except asyncio.CancelledError:
            return

    @staticmethod
    def _is_agent_running(context_id: str) -> bool:
        """检查主会话是否仍在执行，避免空闲任务截取半个回合。"""
        from app.service.agent_runtime import AgentRuntime

        return AgentRuntime.get_instance().is_context_running(context_id)

    def _remaining_idle_seconds(self, agent_context: "AgentContext") -> float:
        """根据沙箱统一活动时间计算距离静默触发还剩多少秒。"""
        idle_seconds = agent_context.shared_context.get_idle_duration_seconds()
        return max(self._idle_timeout_seconds - idle_seconds, 0.0)

    @staticmethod
    def _build_session_key(agent_context: "AgentContext") -> SessionKey:
        """构造跨 AgentContext 重建仍保持稳定的主会话键。"""
        target = agent_context.get_agent_target()
        agent_name = target.agent_name if target is not None else agent_context.get_agent_name()
        agent_id = agent_context.get_agent_id() or agent_context.context_id
        chat_history_dir = agent_context.get_chat_history_dir() or ""
        return str(chat_history_dir), agent_name, agent_id

    @staticmethod
    def _format_session_key(session_key: SessionKey) -> str:
        """把会话键格式化为不包含目录信息的日志标签。"""
        _, agent_name, agent_id = session_key
        return f"{agent_name}<{agent_id}>"

    @staticmethod
    def _normalize_positive_int(
        value: int | None,
        *,
        config_key: str,
        default: int,
    ) -> int:
        """读取正整数配置，非法值回退默认值。"""
        raw_value = value if value is not None else config.get(config_key, default)
        try:
            normalized = int(raw_value)
        except (TypeError, ValueError):
            return default
        return normalized if normalized > 0 else default

    @staticmethod
    def _normalize_positive_float(
        value: float | None,
        *,
        config_key: str,
        default: float,
    ) -> float:
        """读取正数秒配置，非法值回退默认值。"""
        raw_value = value if value is not None else config.get(config_key, default)
        try:
            normalized = float(raw_value)
        except (TypeError, ValueError):
            return default
        return normalized if normalized > 0 else default


__all__ = ["MemoryExtractionTriggerService"]
