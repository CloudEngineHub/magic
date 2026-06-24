"""OAuth2 持久化和展示使用的时间辅助函数。"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    """返回当前 UTC 时间。"""
    return datetime.now(timezone.utc)


def utc_timestamp() -> int:
    """返回当前 UTC 秒级时间戳。"""
    return int(utc_now().timestamp())


def format_utc(dt: datetime | None = None) -> str:
    """将时间格式化为模型可读的人类友好 UTC 文本。"""
    value = dt or utc_now()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def format_timezone(dt: datetime | None = None, timezone_name: str = "UTC") -> str:
    """将时间格式化为指定时区的人类友好文本。"""
    value = dt or utc_now()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    tz_name = timezone_name or "UTC"
    try:
        local_time = value.astimezone(ZoneInfo(tz_name))
    except Exception:
        tz_name = "UTC"
        local_time = value.astimezone(timezone.utc)
    return f"{local_time.strftime('%Y-%m-%d %H:%M:%S')} {tz_name} ({_utc_offset(local_time)})"


def format_timestamp(ts: int | float | None, timezone_name: str = "UTC") -> str:
    """将 Unix 时间戳格式化为指定时区的人类友好文本。"""
    if not ts:
        return ""
    return format_timezone(datetime.fromtimestamp(float(ts), tz=timezone.utc), timezone_name)


def _utc_offset(value: datetime) -> str:
    """返回 UTC 偏移文本。"""
    offset = value.utcoffset()
    if offset is None:
        return "UTC+00:00"
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    total_minutes = abs(total_minutes)
    hours, minutes = divmod(total_minutes, 60)
    return f"UTC{sign}{hours:02d}:{minutes:02d}"
