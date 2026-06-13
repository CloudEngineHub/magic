"""Parse shell_exec user-display markers from terminal output."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail

DISPLAY_OVERRIDE_KEY = "shell_exec_display_override"

_MARKER_PATTERN = re.compile(
    r"<super-magic-tool-detail>(.*?)</super-magic-tool-detail>",
    re.DOTALL,
)


@dataclass
class ShellExecDisplayOverride:
    """Frontend display override declared by a script through terminal output."""

    after: Optional[Dict[str, str]] = None
    tool_detail: Optional[ToolDetail] = None

    def to_extra_info(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        if self.after:
            payload["after"] = self.after
        if self.tool_detail:
            payload["tool_detail"] = self.tool_detail.model_dump(mode="json")
        return payload

    @classmethod
    def from_extra_info(cls, extra_info: Dict[str, Any]) -> Optional["ShellExecDisplayOverride"]:
        payload = extra_info.get(DISPLAY_OVERRIDE_KEY) if extra_info else None
        if not isinstance(payload, dict):
            return None

        after = payload.get("after")
        if not isinstance(after, dict):
            after = None

        tool_detail = _parse_tool_detail(payload.get("tool_detail"))
        return cls(after=_normalize_after(after), tool_detail=tool_detail)


def apply_tool_detail_markers(result: ToolResult) -> None:
    """Remove valid display markers from shell_exec output and store overrides."""

    extra_info = result.extra_info or {}
    cleaned_content, payloads = _extract_payloads(result.content or "")
    result.content = cleaned_content

    for key in ("stdout", "stderr"):
        value = extra_info.get(key)
        if not isinstance(value, str) or not value:
            continue
        cleaned_value, output_payloads = _extract_payloads(value)
        extra_info[key] = cleaned_value
        payloads.extend(output_payloads)

    override = _build_last_override(payloads)
    if override and override.to_extra_info():
        extra_info[DISPLAY_OVERRIDE_KEY] = override.to_extra_info()

    result.extra_info = extra_info


def get_after_override(result: ToolResult) -> Optional[Dict[str, str]]:
    override = ShellExecDisplayOverride.from_extra_info(result.extra_info)
    return override.after if override else None


def get_tool_detail_override(result: ToolResult) -> Optional[ToolDetail]:
    override = ShellExecDisplayOverride.from_extra_info(result.extra_info)
    return override.tool_detail if override else None


def _extract_payloads(text: str) -> Tuple[str, List[Dict[str, Any]]]:
    payloads: List[Dict[str, Any]] = []

    def replace_match(match: re.Match[str]) -> str:
        raw_payload = match.group(1).strip()
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError:
            return match.group(0)
        if not isinstance(payload, dict):
            return match.group(0)
        payloads.append(payload)
        return ""

    cleaned = _MARKER_PATTERN.sub(replace_match, text)
    return cleaned, payloads


def _build_last_override(payloads: List[Dict[str, Any]]) -> Optional[ShellExecDisplayOverride]:
    override: Optional[ShellExecDisplayOverride] = None
    for payload in payloads:
        current = _parse_override(payload)
        if current and current.to_extra_info():
            override = current
    return override


def _parse_override(payload: Dict[str, Any]) -> Optional[ShellExecDisplayOverride]:
    after_payload = payload.get("after")
    if not isinstance(after_payload, dict):
        after_payload = {
            key: payload[key]
            for key in ("action", "remark", "tool_name")
            if key in payload
        }

    detail_payload = payload.get("tool_detail")
    if detail_payload is None:
        detail_payload = payload.get("detail")
    if detail_payload is None and "type" in payload and "data" in payload:
        detail_payload = payload

    override = ShellExecDisplayOverride(
        after=_normalize_after(after_payload),
        tool_detail=_parse_tool_detail(detail_payload),
    )
    return override if override.to_extra_info() else None


def _normalize_after(value: Any) -> Optional[Dict[str, str]]:
    if not isinstance(value, dict):
        return None

    allowed_keys = ("action", "remark", "tool_name")
    after: Dict[str, str] = {}
    for key in allowed_keys:
        item = value.get(key)
        if isinstance(item, str) and item.strip():
            after[key] = item.strip()
    return after or None


def _parse_tool_detail(value: Any) -> Optional[ToolDetail]:
    if value is None:
        return None

    if isinstance(value, str):
        return _markdown_detail(value)

    if not isinstance(value, dict):
        return None

    if "type" in value and "data" in value:
        try:
            return ToolDetail.model_validate(value)
        except Exception:
            return None

    content = value.get("markdown") or value.get("md") or value.get("content")
    if isinstance(content, str):
        file_name = value.get("file_name")
        return _markdown_detail(content, file_name=file_name if isinstance(file_name, str) else None)

    return None


def _markdown_detail(content: str, file_name: Optional[str] = None) -> ToolDetail:
    return ToolDetail(
        type=DisplayType.MD,
        data=FileContent(
            file_name=file_name or "shell_exec_result.md",
            content=content,
        ),
    )
