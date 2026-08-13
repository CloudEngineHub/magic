"""Browser 页面交互工具的定制详情。"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from agentlang.tools.tool_result import ToolResult
from app.tools.browser.presentation.common import (
    action_change_lines,
    action_label,
    escape_markdown,
    field,
    is_sensitive_target,
    join_sections,
    message,
    page_data,
    page_section,
    section,
    string,
    target_text,
)


def click_detail(result: ToolResult) -> str:
    return _action_detail(result, "browser.click")


def fill_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    extra = []
    if is_sensitive_target(result):
        extra.append(field("browser.detail.label.value", message("browser.detail.sensitive_value")))
    elif isinstance(arguments.get("value"), str):
        extra.append(field("browser.detail.label.value", message("browser.detail.value_entered")))
    return _action_detail(result, "browser.input_text", extra)


def press_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    key = string(arguments.get("key"))
    extra = [field("browser.detail.label.key", escape_markdown(key))] if key else []
    return _action_detail(result, "browser.press", extra)


def hover_detail(result: ToolResult) -> str:
    return _action_detail(result, "browser.hover")


def scroll_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    extra: list[str] = []
    delta_x = arguments.get("delta_x")
    delta_y = arguments.get("delta_y")
    if isinstance(delta_x, (int, float)) and delta_x:
        extra.append(field("browser.detail.label.horizontal", f"{delta_x:g} px"))
    if isinstance(delta_y, (int, float)) and delta_y:
        extra.append(field("browser.detail.label.vertical", f"{delta_y:g} px"))
    ref = string(arguments.get("ref"))
    if ref:
        extra.append(field("browser.detail.label.ref", escape_markdown(ref)))
    return _action_detail(result, "browser.scroll_to", extra)


def select_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    value = string(arguments.get("value"))
    extra = [field("browser.detail.label.value", escape_markdown(value))] if value else []
    return _action_detail(result, "browser.select", extra)


def check_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    checked = arguments.get("checked") is True
    extra = [field("browser.detail.label.state", message("browser.detail.checked" if checked else "browser.detail.unchecked"))]
    return _action_detail(result, "browser.check", extra)


def upload_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    file_paths = arguments.get("file_paths")
    safe_names = [
        Path(path).name
        for path in file_paths
        if isinstance(path, str) and Path(path).name
    ] if isinstance(file_paths, list) else []
    extra = [
        message(
            "browser.detail.result.files_uploaded",
            count=len(safe_names),
            files=", ".join(escape_markdown(item) for item in safe_names),
        )
    ]
    return _action_detail(result, "browser.upload_file", extra)


def _action_detail(result: ToolResult, action: str, extra: list[str] | None = None) -> str:
    action_data = result.data.get("action")
    target = target_text(result)
    result_lines: list[str] = []
    if target:
        result_lines.append(field("browser.detail.label.target", escape_markdown(target)))
    if extra:
        result_lines.extend(extra)
    if isinstance(action_data, Mapping):
        result_lines.insert(0, field("browser.detail.label.action", action_label(string(action_data.get("action")) or action)))
        change_lines = action_change_lines(action_data, result)
    else:
        change_lines = []
    if not result_lines:
        result_lines.append(message("browser.detail.interaction_completed"))
    sections = [
        section("browser.detail.heading.result", "\n".join(result_lines)),
        page_section(page_data(result)),
    ]
    if change_lines:
        sections.append(section("browser.detail.heading.changes", "\n".join(change_lines)))
    else:
        sections.append(section("browser.detail.heading.limits", message("browser.detail.no_observable_change")))
    return join_sections(sections)
