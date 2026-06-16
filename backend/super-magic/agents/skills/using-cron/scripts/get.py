#!/usr/bin/env python3
"""
Get scheduled message task details.

Arguments:
    --id    Scheduled task ID. Required.

Output format: JSON
"""
import json
import argparse

import _context  # initialize project root path
from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk_with_defaults
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    GetMessageScheduleDetailParameter,
)

parser = argparse.ArgumentParser(description="Get scheduled message task details")
parser.add_argument("--id", required=True, help="Scheduled task ID")
args = parser.parse_args()

try:
    sdk = create_magic_service_sdk_with_defaults()

    parameter = GetMessageScheduleDetailParameter(schedule_id=args.id)
    result = sdk.message_schedule.get_message_schedule_detail(parameter)
    raw = result.get_raw_data()
    # Keep only fields that are useful to the agent.
    whitelist = ("id", "task_name", "task_describe", "message_content", "time_config", "status", "enabled", "deadline")
    output = {k: raw[k] for k in whitelist if k in raw}
    print(json.dumps(output, ensure_ascii=False, indent=2))

except Exception as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False))
