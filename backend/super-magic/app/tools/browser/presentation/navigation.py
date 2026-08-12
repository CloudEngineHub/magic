"""Browser 导航、等待与续期工具的定制详情。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.presentation.common import (
    display_time,
    escape_markdown,
    field,
    join_sections,
    message,
    page_data,
    page_section,
    section,
    string,
)


def navigate_detail(result: ToolResult) -> str:
    page = page_data(result)
    if not page:
        return ""
    sections = [
        section("browser.detail.heading.result", message("browser.detail.result.page_navigated")),
        page_section(page),
    ]
    redirect_chain = page.get("redirect_chain")
    if isinstance(redirect_chain, list) and len(redirect_chain) > 1:
        safe_chain = " → ".join(
            BrowserToolResultBuilder.safe_url(item)
            for item in redirect_chain
            if isinstance(item, str)
        )
        if safe_chain:
            sections.append(
                section(
                    "browser.detail.heading.changes",
                    message("browser.detail.redirect_chain", chain=safe_chain),
                )
            )
    return join_sections(sections)


def wait_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    condition = string(result.data.get("condition")) or string(arguments.get("condition"))
    condition_key = {
        "url": "browser.detail.condition_url",
        "text": "browser.detail.condition_text",
        "load_state": "browser.detail.condition_load_state",
        "ref": "browser.detail.condition_ref",
        "download": "browser.detail.condition_download",
        "time": "browser.detail.condition_time",
    }.get(condition, "browser.detail.condition_generic")
    condition_label = message(condition_key)
    if condition == "load_state":
        state = string(arguments.get("state"))
        state_key = {
            "commit": "browser.detail.state_commit",
            "domcontentloaded": "browser.detail.state_dom_content_loaded",
            "load": "browser.detail.state_load",
            "networkidle": "browser.detail.state_network_idle",
        }.get(state, "browser.detail.state_unknown")
        expected = message(state_key)
    elif condition == "time":
        duration_ms = arguments.get("duration_ms")
        expected = f"{duration_ms:g} ms" if isinstance(duration_ms, (int, float)) else message("browser.detail.wait_default")
    else:
        expected = string(arguments.get("value")) or string(arguments.get("state"))
        expected = expected or message("browser.detail.wait_default")
    if condition == "url":
        expected = BrowserToolResultBuilder.safe_url(expected)
    sections = [
        section(
            "browser.detail.heading.result",
            message(
                "browser.detail.wait_satisfied",
                condition=condition_label,
                expected=escape_markdown(expected),
            ),
        )
    ]
    page = page_data(result)
    if page:
        sections.append(page_section(page))
    return join_sections(sections)


def keep_alive_detail(result: ToolResult, arguments: Mapping[str, object]) -> str:
    page = page_data(result)
    lines = [message("browser.detail.result.page_lease_extended")]
    seconds = arguments.get("seconds")
    if isinstance(seconds, (int, float)):
        lines.append(field("browser.detail.label.duration", f"{seconds:g} s"))
    expires_at = display_time(string(page.get("expires_at"))) if page else ""
    if expires_at:
        lines.append(field("browser.detail.label.expires_at", expires_at))
    sections = [section("browser.detail.heading.result", "\n".join(lines))]
    if page:
        sections.append(page_section(page))
    return join_sections(sections)
