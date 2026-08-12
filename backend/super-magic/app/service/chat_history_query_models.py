"""聊天记录查询共用类型和时间范围解析。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from enum import StrEnum
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from agentlang.logger import get_logger

logger = get_logger(__name__)


class HistoryType(StrEnum):
    CURRENT = "current"
    COMPACTED = "compacted"
    SUBAGENT = "subagent"


class MessageType(StrEnum):
    USER_INPUT = "user_input"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    SYSTEM = "system"


@dataclass(frozen=True, slots=True)
class TimeRange:
    start: datetime | None
    end: datetime | None

    def contains(self, value: datetime | None) -> bool:
        if value is None:
            return self.start is None and self.end is None
        if self.start is not None and value < self.start:
            return False
        if self.end is not None and value > self.end:
            return False
        return True

    def describe(self) -> str:
        start = format_history_time(self.start) if self.start is not None else "beginning"
        end = format_history_time(self.end) if self.end is not None else "now"
        return f"{start} to {end}"


@dataclass(frozen=True, slots=True)
class ChatHistoryFile:
    history_file: str
    path: Path
    history_type: HistoryType
    agent_name: str
    agent_id: str
    modified_at: float
    size_bytes: int


@dataclass(frozen=True, slots=True)
class HistoryMessage:
    history_file: str
    message_index: int
    message_type: MessageType
    role: str
    content: str
    timestamp: datetime | None


def format_history_time(value: datetime | None, timezone_name: str | None = None) -> str:
    """格式化模型可读时间，始终带 UTC 偏移。"""
    if value is None:
        return "time unavailable"
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if timezone_name is not None:
        aware = aware.astimezone(_parse_timezone(timezone_name))
    offset = aware.utcoffset() or timedelta(0)
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    absolute_minutes = abs(total_minutes)
    offset_text = f"UTC{sign}{absolute_minutes // 60:02d}:{absolute_minutes % 60:02d}"
    return aware.strftime("%Y-%m-%d %H:%M:%S") + f" {offset_text}"


def parse_time_range(value: str | None, timezone_name: str) -> TimeRange | None:
    """解析模型友好的单字符串时间范围，不接受自由自然语言。"""
    if value is None or not value.strip():
        return None

    user_timezone = _parse_timezone(timezone_name)
    text = value.strip()
    alias = " ".join(text.lower().replace("_", " ").split())
    now = datetime.now(user_timezone)
    today_start = datetime.combine(now.date(), time.min, tzinfo=user_timezone)

    if alias == "today":
        return TimeRange(today_start, _end_of_day(now))
    if alias == "yesterday":
        yesterday = today_start - timedelta(days=1)
        return TimeRange(yesterday, _end_of_day(yesterday))
    if alias in {"this week", "thisweek", "this-week"}:
        week_start = today_start - timedelta(days=today_start.weekday())
        return TimeRange(week_start, _end_of_day(now))

    relative_match = re.fullmatch(
        r"last[ _-]+(\d+)[ _-]+(minute|minutes|hour|hours|day|days|week|weeks)",
        text,
        re.IGNORECASE,
    )
    if relative_match:
        amount = int(relative_match.group(1))
        unit = relative_match.group(2).lower()
        if amount <= 0:
            raise ValueError("time_range relative amount must be greater than zero")
        if unit.startswith("minute"):
            return TimeRange(now - timedelta(minutes=amount), now)
        if unit.startswith("hour"):
            return TimeRange(now - timedelta(hours=amount), now)
        days = amount * (7 if unit.startswith("week") else 1)
        start = today_start - timedelta(days=days - 1)
        return TimeRange(start, _end_of_day(now))

    since_match = re.fullmatch(r"since\s+(.+)", text, re.IGNORECASE)
    if since_match:
        return TimeRange(_parse_datetime(since_match.group(1), user_timezone), None)

    until_match = re.fullmatch(r"until\s+(.+)", text, re.IGNORECASE)
    if until_match:
        return TimeRange(None, _parse_datetime(until_match.group(1), user_timezone, end_of_day=True))

    range_parts = re.split(r"\s+to\s+", text, maxsplit=1, flags=re.IGNORECASE)
    if len(range_parts) == 2:
        return TimeRange(
            _parse_datetime(range_parts[0], user_timezone),
            _parse_datetime(range_parts[1], user_timezone, end_of_day=True),
        )

    raise ValueError(
        "Unsupported time_range. Use today, yesterday, last 7 days, last 2 hours, "
        "since <date>, until <date>, or <start> to <end>."
    )


def _parse_timezone(timezone_name: str) -> timezone | ZoneInfo:
    try:
        return ZoneInfo(timezone_name or "UTC")
    except ZoneInfoNotFoundError:
        logger.warning("Unknown user timezone %s; using UTC", timezone_name)
        return timezone.utc


def _end_of_day(value: datetime) -> datetime:
    return datetime.combine(value.date(), time.max, tzinfo=value.tzinfo)


def _parse_datetime(value: str, default_timezone: timezone | ZoneInfo, *, end_of_day: bool = False) -> datetime:
    text = value.strip()
    if not text:
        raise ValueError("time_range contains an empty date")

    normalized = re.sub(r"\s+UTC(?=$|\s)", " +00:00", text, flags=re.IGNORECASE)
    normalized = re.sub(r"UTC([+-]\d{2}:?\d{2})$", r"\1", normalized, flags=re.IGNORECASE)
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(
            "time_range dates must use YYYY-MM-DD [HH:MM[:SS]] with an optional timezone"
        ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=default_timezone)
    if end_of_day and len(text) == 10:
        parsed = _end_of_day(parsed)
    return parsed


__all__ = [
    "ChatHistoryFile",
    "HistoryMessage",
    "HistoryType",
    "MessageType",
    "TimeRange",
    "format_history_time",
    "parse_time_range",
]
