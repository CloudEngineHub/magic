"""从已有聊天记录提取近期耗时，只生成 Horizon 展示属性。"""
from __future__ import annotations

import html
import math
import re
from collections import Counter
from dataclasses import dataclass

from agentlang.chat_history.chat_history_models import (
    AssistantMessage,
    ChatMessage,
    ToolMessage,
    UserMessage,
)

_CURRENT_TIME_TAG = re.compile(r"<current_time(?:\s|>)")


@dataclass(frozen=True)
class ToolDuration:
    tool_name: str
    tool_call_id: str
    duration_ms: float | None


@dataclass(frozen=True)
class TimeAwareness:
    previous_response_duration_ms: float | None = None
    tools: tuple[ToolDuration, ...] = ()


def _valid_duration(duration_ms: float | None) -> float | None:
    # 既有零值可能来自未执行或未计时的结果，不能据此宣称工具瞬间完成。
    if duration_ms is None or not math.isfinite(duration_ms) or duration_ms <= 0:
        return None
    return duration_ms


def collect_time_awareness(messages: tuple[ChatMessage, ...]) -> TimeAwareness:
    """只提取最近时间提示之后的结果，不回放旧窗口或继承历史的耗时。"""
    boundary: int | None = None
    for index in range(len(messages) - 1, -1, -1):
        message = messages[index]
        if (
            isinstance(message, UserMessage)
            and message.source == "horizon"
            and _CURRENT_TIME_TAG.search(message.content)
        ):
            boundary = index
            break
    if boundary is None:
        return TimeAwareness()

    recent_messages = messages[boundary + 1:]
    previous_response = next(
        (message for message in reversed(recent_messages) if isinstance(message, AssistantMessage)),
        None,
    )
    tool_messages = tuple(message for message in recent_messages if isinstance(message, ToolMessage))
    pending_ids = {message.tool_call_id for message in tool_messages}
    tool_names: dict[str, str] = {}
    # 恢复执行时调用声明可能位于时间边界之前；只回查本批结果需要的实际 ID。
    for message in reversed(messages):
        if not pending_ids:
            break
        if not isinstance(message, AssistantMessage):
            continue
        for tool_call in message.tool_calls or ():
            if tool_call.id in pending_ids and tool_call.function is not None:
                tool_names[tool_call.id] = tool_call.function.name
                pending_ids.remove(tool_call.id)

    return TimeAwareness(
        previous_response_duration_ms=(
            _valid_duration(previous_response.duration_ms) if previous_response is not None else None
        ),
        tools=tuple(
            ToolDuration(
                tool_name=tool_names.get(message.tool_call_id, ""),
                tool_call_id=message.tool_call_id,
                duration_ms=_valid_duration(message.duration_ms),
            )
            for message in tool_messages
        ),
    )


def _format_duration(duration_ms: float) -> str:
    seconds = duration_ms / 1000
    if seconds < 0.1:
        return "<0.1s"
    hours, remainder = divmod(round(seconds, 1), 3600)
    minutes, seconds = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{int(hours)}h")
    if minutes:
        parts.append(f"{int(minutes)}m")
    parts.append(f"{seconds:.1f}s")
    return "".join(parts)


def render_current_time(
    time_text: str,
    *,
    elapsed_seconds: float | None,
    awareness: TimeAwareness,
) -> str:
    """保留明确字段和工具名称；缺失记录不伪造为零耗时。"""
    attributes: list[str] = []
    elapsed_ms = _valid_duration(elapsed_seconds * 1000 if elapsed_seconds is not None else None)
    if elapsed_ms is not None:
        attributes.append(f'elapsed="{html.escape(_format_duration(elapsed_ms), quote=True)}"')
    if awareness.previous_response_duration_ms is not None:
        duration = _format_duration(awareness.previous_response_duration_ms)
        attributes.append(f'previous_response_duration="{html.escape(duration, quote=True)}"')
    if awareness.tools:
        name_counts = Counter(tool.tool_name for tool in awareness.tools if tool.tool_name)
        tool_durations: list[str] = []
        for tool in awareness.tools:
            name = tool.tool_name or tool.tool_call_id
            if tool.tool_name and name_counts[tool.tool_name] > 1:
                name = f"{name} ({tool.tool_call_id})"
            duration = _format_duration(tool.duration_ms) if tool.duration_ms is not None else "unavailable"
            tool_durations.append(f"{name}:{duration}")
        attributes.append(f'tools="{html.escape("; ".join(tool_durations), quote=True)}"')
    attribute_text = f" {' '.join(attributes)}" if attributes else ""
    return f"<current_time{attribute_text}>{html.escape(time_text)}</current_time>"
