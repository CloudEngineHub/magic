#!/usr/bin/env python3
"""
Delete a scheduled message task.

Arguments:
    --id    Scheduled task ID. Required.

Output format: JSON
"""
import json
import argparse

import _context  # initialize project root path
from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk_with_defaults
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    DeleteMessageScheduleParameter,
)

parser = argparse.ArgumentParser(description="Delete a scheduled message task")
parser.add_argument("--id", required=True, help="Scheduled task ID")
args = parser.parse_args()

try:
    sdk = create_magic_service_sdk_with_defaults()

    parameter = DeleteMessageScheduleParameter(schedule_id=args.id)
    result = sdk.message_schedule.delete_message_schedule(parameter)
    print(json.dumps({"id": args.id}, ensure_ascii=False))

except Exception as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False))
