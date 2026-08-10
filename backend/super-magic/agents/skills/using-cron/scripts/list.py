#!/usr/bin/env python3
"""
List scheduled message tasks.

Only tasks under the current project are returned. project_id is read from the
current session automatically.

Arguments:
    --page          Page number. Default: 1.
    --page-size     Items per page. Default: 50.
    --task-name     Fuzzy search by task name. Optional.
    --enabled       Enabled filter: 1=enabled, 0=disabled. Optional.
    --completed     Completed filter: 1=completed, 0=incomplete. Optional.

Output format: JSON
"""
import json
import sys
import argparse

import _context  # initialize project root path
from _context import get_project_id
from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk_with_defaults
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    QueryMessageSchedulesParameter,
)

parser = argparse.ArgumentParser(description="List scheduled message tasks")
parser.add_argument("--page", type=int, default=1, help="Page number. Default: 1")
parser.add_argument("--page-size", type=int, default=50, help="Items per page. Default: 50")
parser.add_argument("--task-name", default=None, help="Fuzzy search by task name")
parser.add_argument("--enabled", type=int, choices=[0, 1], default=None, help="Enabled filter: 1=enabled, 0=disabled")
parser.add_argument("--completed", type=int, choices=[0, 1], default=None, help="Completed filter: 1=completed, 0=incomplete")
args = parser.parse_args()

try:
    project_id = get_project_id()
    if not project_id:
        print(json.dumps({"error": "Failed to read project_id from the current session"}, ensure_ascii=False))
        sys.exit(1)

    sdk = create_magic_service_sdk_with_defaults()

    parameter = QueryMessageSchedulesParameter(
        page=args.page,
        page_size=args.page_size,
        project_id=project_id,
        task_name=args.task_name,
        enabled=args.enabled,
        completed=args.completed,
    )

    result = sdk.message_schedule.query_message_schedules(parameter)
    raw = result.get_raw_data()
    # Keep only fields that are useful to the agent.
    item_whitelist = ("id", "task_name", "task_describe", "status", "enabled", "time_config", "deadline")
    output = {
        "total": raw.get("total", 0),
        "schedules": [
            {k: item[k] for k in item_whitelist if k in item}
            for item in raw.get("list", [])
        ],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))

except Exception as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False))
