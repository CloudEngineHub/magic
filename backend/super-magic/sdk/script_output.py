"""Helpers for shell_exec script output consumed by Super Magic."""

from __future__ import annotations

import json
import argparse
from typing import Any


MARKER_NAME = "super-magic-tool-detail"


def print_json(output: dict[str, Any]) -> None:
    """Print model-facing JSON output."""

    print(json.dumps(output, ensure_ascii=False, indent=2))


def print_super_magic_tool_detail(detail: dict[str, Any]) -> None:
    """Print frontend-facing Super Magic display marker."""

    payload = json.dumps(detail, ensure_ascii=False, separators=(",", ":"))
    print(f"<{MARKER_NAME}>{payload}</{MARKER_NAME}>")


def build_markdown_tool_detail(action: str, remark: str, file_name: str, markdown: str) -> dict[str, Any]:
    """Build the compact Super Magic display payload."""

    return {
        "after": {
            "action": action,
            "remark": remark,
        },
        "tool_detail": {
            "file_name": file_name,
            "markdown": markdown,
        },
    }


def print_script_result(output: dict[str, Any], detail: dict[str, Any]) -> None:
    """Print normal stdout first, then the Super Magic marker."""

    print_json(output)
    print_super_magic_tool_detail(detail)


class SuperMagicArgumentParser(argparse.ArgumentParser):
    """ArgumentParser that emits Super Magic display output on CLI errors."""

    def __init__(
        self,
        *args: Any,
        display_action: str = "执行脚本",
        detail_file_name: str = "script_result.md",
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.display_action = display_action
        self.detail_file_name = detail_file_name

    def error(self, message: str) -> None:
        output = {"ok": False, "error": f"参数错误：{message}"}
        detail = build_markdown_tool_detail(
            self.display_action,
            output["error"],
            self.detail_file_name,
            "\n".join(["# 参数错误", "", f"- 原因：{message}", f"- 操作：{self.display_action}"]),
        )
        print_script_result(output, detail)
        self.exit(2)
