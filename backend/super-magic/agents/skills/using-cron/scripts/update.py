#!/usr/bin/env python3
"""
Update a scheduled message task. Supports partial updates; pass only fields to change.

Arguments:
    --id            Scheduled task ID. Required.
    --task-name     Task name. Optional.
    --message-content   Message content. Optional.
    --message-content-file Read message content from a file. Use for long text or content with special characters. Optional.
    --type          Schedule type: no_repeat | daily_repeat | weekly_repeat | monthly_repeat. Optional; use with --time.
    --time          Execution time in HH:MM format. Optional; use with --type.
    --day           Date, weekday, or day-of-month; meaning depends on --type. Optional.
    --deadline      End date in YYYY-MM-DD HH:MM:SS format. Date-only or partial time values are normalized. Optional.
    --enabled       Enable/disable the task: 1=enabled, 0=disabled. Optional.

Output format: JSON
"""
import json
import re
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

import _context  # initialize project root path
from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk_with_defaults
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    UpdateMessageScheduleParameter,
    TimeConfig,
)


def text_to_json_content(text: str) -> dict:
    """Convert plain text to Tiptap JSONContent format for rich_text messages."""
    paragraphs = []
    for line in text.split("\n"):
        if line:
            paragraphs.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": line}],
            })
        else:
            paragraphs.append({"type": "paragraph"})
    return {"type": "doc", "content": paragraphs}


def parse_message_content(raw: str):
    """
    Parse message content.

    - Use valid JSONContent dicts directly when they contain a type field.
    - Treat all other input as plain text and convert it to JSONContent.
    Return (content, message_type).
    """
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and parsed.get("type"):
            return parsed, "rich_text"
    except (json.JSONDecodeError, TypeError):
        pass
    return text_to_json_content(raw), "rich_text"

parser = argparse.ArgumentParser(description="Update a scheduled message task")
parser.add_argument("--id", required=True, help="Scheduled task ID")
parser.add_argument("--task-name", default=None, help="Task name")
message_group = parser.add_mutually_exclusive_group()
message_group.add_argument(
    "--message-content",
    dest="message_content",
    default=None,
    help="Message content; maps to detail fields message_content/task_describe",
)
message_group.add_argument(
    "--message-content-file",
    dest="message_content_file",
    default=None,
    help="Read message content from a file; useful for long text or special characters",
)
parser.add_argument(
    "--type",
    default=None,
    choices=["no_repeat", "daily_repeat", "weekly_repeat", "monthly_repeat"],
    help="Schedule type",
)
parser.add_argument("--time", default=None, help="Execution time in HH:MM format")
parser.add_argument("--day", default=None, help="Date, weekday, or day-of-month; meaning depends on --type")
parser.add_argument(
    "--deadline",
    default=None,
    help="End date in YYYY-MM-DD HH:MM:SS format; date-only or partial time values are normalized",
)
parser.add_argument("--enabled", type=int, choices=[0, 1], default=None, help="Enable or disable: 1=enabled, 0=disabled")
args = parser.parse_args()


def normalize_deadline(value: Optional[str]) -> Optional[str]:
    """
    Normalize a user-provided deadline to YYYY-MM-DD HH:MM:SS.
    Date-only values become 00:00:00; date+minute values get :00 seconds;
    full datetime values are returned as-is.
    """
    if not value or not value.strip():
        return None
    s = value.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", s):
        return s
    m = re.match(r"^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$", s)
    if m:
        return f"{m.group(1)} {m.group(2)}:00"
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if fmt == "%Y-%m-%d %H:%M:%S":
                return s
            return dt.strftime("%Y-%m-%d 00:00:00")
        except ValueError:
            continue
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        y, mon, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
        return f"{y}-{mon}-{d} 00:00:00"
    return None


def resolve_message_content(
    message_content: Optional[str],
    message_content_file: Optional[str],
) -> Optional[str]:
    """读取最终任务指令内容。未传消息内容时返回 None，表示不更新该字段。"""
    if message_content is not None:
        return message_content
    if message_content_file:
        return Path(message_content_file).read_text(encoding="utf-8").strip()
    return None


try:
    # Build time_config only when both --type and --time are provided.
    time_config = None
    if args.type and args.time:
        time_config = TimeConfig(
            schedule_type=args.type,
            time=args.time,
            day=args.day,
        )

    normalized_deadline = normalize_deadline(args.deadline)

    # Convert message_content to rich_text format when provided.
    message_content = None
    message_type = None
    raw_content = resolve_message_content(args.message_content, args.message_content_file)
    if raw_content is not None:
        message_content, message_type = parse_message_content(raw_content)

    sdk = create_magic_service_sdk_with_defaults()

    parameter = UpdateMessageScheduleParameter(
        schedule_id=args.id,
        task_name=args.task_name,
        message_content=message_content,
        time_config=time_config,
        deadline=normalized_deadline,
        enabled=args.enabled,
        message_type=message_type,
    )

    result = sdk.message_schedule.update_message_schedule(parameter)
    print(json.dumps({"id": result.get_schedule_id()}, ensure_ascii=False))

except Exception as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False))
