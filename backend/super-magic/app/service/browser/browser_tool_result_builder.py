"""把 magic_use 强类型结果转换成模型内容和结构化数据。"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import fields, is_dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import TypeAlias
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from agentlang.tools.tool_result import ToolResult
from app.service.browser.browser_artifact_service import BrowserEncodedScreenshot, BrowserScreenshotArtifact
from app.service.browser.browser_file_adapter import BrowserSavedScreenshot
from magic_use.errors import BrowserSDKError
from magic_use.models import (
    ActionResult,
    BrowserEvent,
    BrowserPage,
    BrowserSession,
    ConsoleEntry,
    DiagnosticBatch,
    NetworkEntry,
    PageElements,
    ScreenshotResult,
    ElementDiff,
    ElementNode,
    FindResult,
)

StructuredValue: TypeAlias = str | int | float | bool | None | list["StructuredValue"] | dict[str, "StructuredValue"]
_MAX_VALUE_PREVIEW_CHARS = 2000
_MAX_VISUAL_EVIDENCE_CHARS = 1000
_MAX_DIAGNOSTIC_CONTENT_ENTRIES = 20


class BrowserToolResultBuilder:
    @classmethod
    def sessions(cls, sessions: tuple[BrowserSession, ...]) -> ToolResult:
        if not sessions:
            return ToolResult(content="No Browser sessions are available.", data={"sessions": []})
        lines = ["Available Browser sessions:"]
        for session in sessions:
            expires = cls._format_time(session.expires_at) if session.expires_at else "not set"
            lines.append(
                f"- {session.id}: backend={session.backend.value}, state={session.state.value}, "
                f"pages={len(session.page_ids)}, expires={expires}"
            )
        return ToolResult(content="\n".join(lines), data={"sessions": cls._structured(sessions)})

    @classmethod
    def pages(cls, pages: tuple[BrowserPage, ...], session_id: str) -> ToolResult:
        if not pages:
            return ToolResult(
                content=f"Browser session {session_id} has no open pages.",
                data={"session_id": session_id, "pages": []},
            )
        lines = [f"Open pages in Browser session {session_id}:"]
        for page in pages:
            active = " active" if page.active else ""
            expires = cls._format_time(page.expires_at) if page.expires_at is not None else "not set"
            lines.append(
                f"- {page.id}{active}: {page.title or '(untitled)'} — {cls.safe_url(page.url)}; expires={expires}"
            )
            if page.resource_warning:
                lines.append(f"  Warning: {page.resource_warning}")
        return ToolResult(
            content="\n".join(lines),
            data={"session_id": session_id, "pages": cls._structured(pages)},
        )

    @classmethod
    def page(cls, page: BrowserPage, message: str) -> ToolResult:
        expires = cls._format_time(page.expires_at) if page.expires_at is not None else "not set"
        warning = f"\n- Warning: {page.resource_warning}" if page.resource_warning else ""
        redirect = ""
        if len(page.redirect_chain) > 1:
            redirect = f"\n- Page was redirected: {' -> '.join(cls.safe_url(url) for url in page.redirect_chain)}"
        return ToolResult(
            content=(
                f"{message}\n"
                f"- Page ID: {page.id}\n"
                f"- Title: {page.title or '(untitled)'}\n"
                f"- URL: {cls.safe_url(page.url)}\n"
                f"- Document generation: {page.document_generation}\n"
                f"- Expires: {expires}\n"
                f"- Status: open and available for further Browser calls{warning}"
                f"{redirect}"
            ),
            data={"page_id": page.id, "session_id": page.session_id, "page": cls._structured(page)},
        )

    @classmethod
    def markdown(cls, page: BrowserPage, scope: str, markdown: str) -> ToolResult:
        content = (
            f"Page content from {page.title or cls.safe_url(page.url)}\n"
            f"Page ID: {page.id}\n"
            f"URL: {cls.safe_url(page.url)}\n"
            f"Scope: {scope}\n\n"
            f"{markdown}"
        )
        return ToolResult(
            content=content,
            data={
                "page_id": page.id,
                "session_id": page.session_id,
                "page": cls._structured(page),
                "scope": scope,
                "markdown": markdown,
            },
        )

    @classmethod
    def html_outline(
        cls,
        page: BrowserPage,
        *,
        ref: str | None,
        detail: str,
        html: str,
        truncated: bool,
        max_chars: int,
    ) -> ToolResult:
        lines = [
            f"HTML structure from {page.title or cls.safe_url(page.url)}",
            f"Page ID: {page.id}",
            f"URL: {cls.safe_url(page.url)}",
            f"Detail: {detail}",
        ]
        if ref is not None:
            lines.append(f"Root ref: {ref}")
        lines.extend(("", html))
        if truncated:
            lines.extend(
                (
                    "",
                    f"[Truncated at {max_chars} characters. Narrow the range with a ref from "
                    "browser_find, or keep detail set to outline.]",
                )
            )
        return ToolResult(
            content="\n".join(lines),
            data={
                "page_id": page.id,
                "session_id": page.session_id,
                "page": cls._structured(page),
                "ref": ref,
                "detail": detail,
                "html": html,
                "truncated": truncated,
            },
        )

    @classmethod
    def snapshot(cls, snapshot: PageElements) -> ToolResult:
        lines = [
            f"Page snapshot for {snapshot.title or cls.safe_url(snapshot.url)}",
            f"Page ID: {snapshot.page_id}",
            f"URL: {cls.safe_url(snapshot.url)}",
            f"Snapshot ID: {snapshot.id}",
            f"Scope: {snapshot.scope.value}",
        ]
        if snapshot.truncated:
            lines.append("The snapshot was truncated. Narrow the scope, scroll, or inspect a subtree.")
        if snapshot.diff is not None:
            lines.extend(cls._diff_lines(snapshot.diff))
        else:
            for node in snapshot.root_nodes:
                cls._append_node(lines, node, depth=0)
        return ToolResult(
            content="\n".join(lines),
            data={
                "page_id": snapshot.page_id,
                "snapshot_id": snapshot.id,
                "snapshot": cls._structured(snapshot),
            },
        )

    @classmethod
    def find(cls, result: FindResult) -> ToolResult:
        lines = [f"Found {len(result.matches)} matching element(s) on page {result.page_id}."]
        for match in result.matches:
            location = "in viewport" if match.in_viewport else "outside viewport"
            target = match.name or match.text or "(unnamed)"
            actions = ", ".join(sorted(match.actions)) or "no direct actions"
            lines.append(f"- {match.ref} {match.role} {target!r} ({location}; actions: {actions})")
        if not result.matches:
            lines.append("No exact match was found.")
        if result.suggestions:
            lines.append("Available names for this role: " + ", ".join(f'"{name}"' for name in result.suggestions))
        return ToolResult(
            content="\n".join(lines),
            data={
                "page_id": result.page_id,
                "matches": cls._structured(result.matches),
                "truncated": result.truncated,
                "suggestions": list(result.suggestions),
            },
        )

    @classmethod
    def action(cls, result: ActionResult) -> ToolResult:
        lines = [
            "Browser action dispatched.",
            f"Page ID: {result.page_id}",
            f"Action: {result.action.value}",
            f"Outcome: {result.outcome.value}",
        ]
        if result.target is not None:
            target_name = result.target.name or result.target.text or "(unnamed)"
            lines.append(f"Target: {result.target.role} — {target_name}")
        if result.ref is not None:
            lines.append(f"Ref: {result.ref}")
        if result.post_action_state is not None:
            if result.post_action_state.value is not None:
                lines.append(f"Selected value: {result.post_action_state.value}")
            if result.post_action_state.label is not None:
                lines.append(f"Selected label: {result.post_action_state.label}")
        lines.append("Verification: the input event was dispatched; verify the resulting page state before assuming the task succeeded.")
        if result.message:
            lines.append(result.message)
        if result.navigation is not None:
            lines.append(f"Navigation: {cls.safe_url(result.navigation.page.url)}")
        if result.opened_pages:
            lines.append("Opened pages: " + ", ".join(page.id for page in result.opened_pages))
        if result.downloads:
            lines.append("Downloads: " + ", ".join(result.downloads))
        if result.dialogs:
            lines.append("Dialogs: " + ", ".join(result.dialogs))
        if result.snapshot_diff is not None:
            lines.extend(cls._diff_lines(result.snapshot_diff))
        tool_result = ToolResult(
            content="\n".join(lines),
            data={"page_id": result.page_id, "action": cls._structured(result)},
        )
        if result.ok:
            return tool_result
        action_data = cls._structured(result)
        return ToolResult.error(
            tool_result.content,
            data={"page_id": result.page_id, "action": action_data},
            extra_info={"action": action_data},
        )

    @classmethod
    def screenshot(
        cls,
        page: BrowserPage,
        result: ScreenshotResult,
        artifact: BrowserScreenshotArtifact | BrowserEncodedScreenshot,
        saved: BrowserSavedScreenshot | None = None,
    ) -> ToolResult:
        label_to_ref = dict(result.labels)
        lines = [
            "Browser screenshot captured.",
            f"- Page ID: {result.page_id}",
            f"- Title: {page.title or '(untitled)'}",
            f"- URL: {cls.safe_url(page.url)}",
            f"- Full page: {'yes' if result.full_page else 'no'}",
            "- To answer a visual question about this page, use browser_visual_query with the page ID.",
        ]
        if label_to_ref:
            lines.append("Labels: " + ", ".join(f"{label}={ref}" for label, ref in label_to_ref.items()))
        if saved is not None:
            lines.append(f"Saved file: {saved.workspace_path}")
            lines.append(f"Saved format: {saved.format}")
            lines.append(f"Saved resolution: {saved.width}x{saved.height}")
            profile = " (Tool Detail artifact default)" if saved.uses_artifact_defaults else ""
            lines.append(f"Saved scale: {saved.scale:g}{profile}")
            if saved.quality is not None:
                lines.append(f"Saved quality: {saved.quality}")
            lines.append(f"Saved size: {saved.file_size} bytes")
        screenshot_data: dict[str, StructuredValue] = {
            "page_id": result.page_id,
            "full_page": result.full_page,
            "width": artifact.width,
            "height": artifact.height,
        }
        if saved is not None:
            screenshot_data.update(
                {
                    "output_path": saved.workspace_path,
                    "format": saved.format,
                    "scale": saved.scale,
                    "saved_width": saved.width,
                    "saved_height": saved.height,
                    "quality": saved.quality,
                    "file_size": saved.file_size,
                    "uses_artifact_defaults": saved.uses_artifact_defaults,
                }
            )
        return ToolResult(
            content="\n".join(lines),
            data={
                "page_id": result.page_id,
                "session_id": page.session_id,
                "screenshot": screenshot_data,
                "page": cls._structured(page),
                "label_to_ref": label_to_ref,
                **({"output_path": saved.workspace_path} if saved is not None else {}),
            },
            extra_info=(
                {
                    "browser_screenshot_file_key": artifact.file_key,
                    "browser_screenshot_file_size": artifact.file_size,
                    "browser_screenshot_content_hash": artifact.content_hash,
                    **({"browser_screenshot_file_url": artifact.file_url} if artifact.file_url is not None else {}),
                }
                if isinstance(artifact, BrowserScreenshotArtifact)
                else {}
            ),
        )

    @classmethod
    def attach_screenshot(
        cls,
        tool_result: ToolResult,
        page: BrowserPage,
        result: ScreenshotResult,
        artifact: BrowserScreenshotArtifact,
    ) -> ToolResult:
        screenshot_result = cls.screenshot(page, result, artifact)
        tool_result.data["screenshot"] = screenshot_result.data["screenshot"]
        tool_result.data["label_to_ref"] = screenshot_result.data["label_to_ref"]
        tool_result.extra_info.update(screenshot_result.extra_info)
        return tool_result

    @classmethod
    def visual(
        cls,
        page: BrowserPage,
        result: ScreenshotResult,
        artifact: BrowserScreenshotArtifact,
        analysis: str,
    ) -> ToolResult:
        screenshot_result = cls.screenshot(page, result, artifact)
        return ToolResult(
            content=f"Visual analysis of {page.title or cls.safe_url(page.url)}\n\n{analysis}",
            data={
                **screenshot_result.data,
                "analysis": analysis,
            },
            extra_info=screenshot_result.extra_info,
        )

    @staticmethod
    def visual_match(
        visual_result: ToolResult,
        *,
        page_id: str,
        document_generation: int,
        target: str,
        label: str,
        ref: str,
        evidence: str,
    ) -> ToolResult:
        evidence = BrowserToolResultBuilder._bounded_text(evidence, _MAX_VISUAL_EVIDENCE_CHARS)
        return ToolResult(
            content=(
                "Visual target matched.\n"
                f"Page ID: {page_id}\n"
                f"Document generation: {document_generation}\n"
                f"Target: {target}\n"
                f"Label: {label}\n"
                f"Ref: {ref}\n"
                f"Evidence: {evidence}"
            ),
            data={
                **visual_result.data,
                "document_generation": document_generation,
                "target": target,
                "label": label,
                "ref": ref,
                "evidence": evidence,
            },
            extra_info=visual_result.extra_info,
        )

    @staticmethod
    def visual_match_error(visual_result: ToolResult, message: str) -> ToolResult:
        return ToolResult.error(
            message,
            data=visual_result.data,
            extra_info=visual_result.extra_info,
        )

    @classmethod
    def console(cls, batch: DiagnosticBatch[ConsoleEntry], page_id: str) -> ToolResult:
        entries = batch.entries
        error_count = sum(entry.level.lower() in {"error", "assert"} for entry in entries)
        data = {
            "page_id": page_id,
            "console_entries": cls._structured(entries),
            "total_count": batch.total_count,
            "returned_count": len(entries),
            "error_count": error_count,
        }
        if not entries:
            return ToolResult(
                content=f"Console entries for page {page_id}: total={batch.total_count}, returned=0, errors=0.",
                data=data,
            )
        lines = [
            f"Console entries for page {page_id}: total={batch.total_count}, "
            f"returned={len(entries)}, errors={error_count}."
        ]
        preview_entries = entries[-_MAX_DIAGNOSTIC_CONTENT_ENTRIES:]
        if len(preview_entries) < len(entries):
            lines.append(f"Showing the newest {len(preview_entries)} returned entries in content.")
        lines.extend(
            f"- {cls._format_time(entry.occurred_at)} [{entry.level}] {entry.text}"
            for entry in preview_entries
        )
        return ToolResult(
            content="\n".join(lines),
            data=data,
        )

    @classmethod
    def network(cls, batch: DiagnosticBatch[NetworkEntry], page_id: str) -> ToolResult:
        entries = batch.entries
        error_count = sum(entry.error is not None or entry.phase == "failed" for entry in entries)
        data = {
            "page_id": page_id,
            "network_entries": cls._structured(entries),
            "total_count": batch.total_count,
            "returned_count": len(entries),
            "error_count": error_count,
            "pending_count": batch.pending_count,
        }
        if not entries:
            return ToolResult(
                content=(
                    f"Network entries for page {page_id}: total={batch.total_count}, "
                    f"returned=0, errors=0, pending={batch.pending_count}."
                ),
                data=data,
            )
        lines = [
            f"Network entries for page {page_id}: total={batch.total_count}, returned={len(entries)}, "
            f"errors={error_count}, pending={batch.pending_count}."
        ]
        preview_entries = entries[-_MAX_DIAGNOSTIC_CONTENT_ENTRIES:]
        if len(preview_entries) < len(entries):
            lines.append(f"Showing the newest {len(preview_entries)} returned entries in content.")
        for entry in preview_entries:
            status = str(entry.status) if entry.status is not None else "-"
            detail = f"; error={entry.error}" if entry.error else ""
            lines.append(
                f"- {cls._format_time(entry.occurred_at)} [{entry.phase}] "
                f"{entry.method} {cls.safe_url(entry.url)}; status={status}{detail}"
            )
        return ToolResult(
            content="\n".join(lines),
            data=data,
        )

    @classmethod
    def events(cls, events: tuple[BrowserEvent, ...]) -> ToolResult:
        if not events:
            return ToolResult(content="No pending Browser events are available.", data={"events": []})
        lines = ["Pending Browser events:"]
        lines.extend(
            f"- {cls._format_time(event.occurred_at)} {event.type.value}"
            f" page={event.page_id or '-'}"
            for event in events
        )
        return ToolResult(content="\n".join(lines), data={"events": cls._structured(events)})

    @classmethod
    def value(cls, value: StructuredValue, message: str) -> ToolResult:
        preview = cls._value_preview(value)
        return ToolResult(
            content=f"{message}\nValue: {preview}",
            data={"value": value},
        )

    @staticmethod
    def error(error: BrowserSDKError, *, user_error: str) -> ToolResult:
        return ToolResult.error(
            f"Browser operation failed [{error.code.value}]: {error}",
            data={"error_code": error.code.value},
            extra_info={"error_code": error.code.value, "user_error": user_error},
        )

    @classmethod
    def _append_node(cls, lines: list[str], node: ElementNode, *, depth: int) -> None:
        indent = "  " * depth
        attributes = [node.role or "node"]
        if node.ref:
            attributes.append(f"ref={node.ref}")
        if node.states:
            attributes.extend(sorted(node.states))
        if node.actions:
            attributes.append("actions=" + ",".join(sorted(node.actions)))
        label = node.name or node.text or node.value or node.description
        line = f"{indent}[{' '.join(attributes)}]"
        if label:
            line += f" {label}"
        lines.append(line)
        for child in node.children:
            cls._append_node(lines, child, depth=depth + 1)

    @staticmethod
    def _diff_lines(diff: ElementDiff) -> list[str]:
        lines = ["Changes:"]
        if not diff.has_changes:
            return ["Changes: none observed"]
        lines.extend(f"- Added: {item}" for item in diff.added)
        lines.extend(f"- Removed: {item}" for item in diff.removed)
        lines.extend(f"- Changed: {item}" for item in diff.changed)
        return lines

    @classmethod
    def _structured(cls, value: object) -> StructuredValue:
        if isinstance(value, Enum):
            return cls._structured(value.value)
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, BrowserPage):
            result = {
                field.name: cls._structured(getattr(value, field.name))
                for field in fields(value)
            }
            result["page_id"] = result.pop("id")
            result["url"] = cls.safe_url(value.url)
            return result
        if is_dataclass(value) and not isinstance(value, type):
            result: dict[str, StructuredValue] = {}
            for field in fields(value):
                field_value = getattr(value, field.name)
                result[field.name] = (
                    cls.safe_url(field_value)
                    if field.name == "url" and isinstance(field_value, str)
                    else cls._structured(field_value)
                )
            return result
        if isinstance(value, Mapping):
            return {
                str(key): cls.safe_url(item)
                if str(key).lower() == "url" and isinstance(item, str)
                else cls._structured(item)
                for key, item in value.items()
            }
        if isinstance(value, (list, tuple, set, frozenset)):
            return [cls._structured(item) for item in value]
        raise TypeError(f"Unsupported Browser result type: {type(value).__name__}")

    @staticmethod
    def _format_time(value: datetime) -> str:
        normalized = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return normalized.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")

    @staticmethod
    def _value_preview(value: StructuredValue) -> str:
        if isinstance(value, str):
            rendered = value
        elif value is None or isinstance(value, (int, float, bool)):
            rendered = json.dumps(value, ensure_ascii=False)
        else:
            rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if len(rendered) <= _MAX_VALUE_PREVIEW_CHARS:
            return rendered
        return (
            rendered[:_MAX_VALUE_PREVIEW_CHARS]
            + '… [truncated; the complete value is available in data["value"]]'
        )

    @staticmethod
    def _bounded_text(value: str, max_chars: int) -> str:
        normalized = " ".join(value.split())
        if len(normalized) <= max_chars:
            return normalized
        return normalized[:max_chars] + "… [truncated]"

    @staticmethod
    def safe_url(value: str) -> str:
        if not value:
            return value
        try:
            parts = urlsplit(value)
            query = BrowserToolResultBuilder._redact_url_parameters(parts.query)
            fragment = (
                BrowserToolResultBuilder._redact_url_parameters(parts.fragment)
                if "=" in parts.fragment
                else parts.fragment
            )
            hostname = parts.hostname or ""
            if ":" in hostname and not hostname.startswith("["):
                hostname = f"[{hostname}]"
            port = f":{parts.port}" if parts.port is not None else ""
            credentials = "[redacted]@" if parts.username is not None or parts.password is not None else ""
            netloc = f"{credentials}{hostname}{port}"
            return urlunsplit((parts.scheme, netloc, parts.path, query, fragment))
        except ValueError:
            return value

    @staticmethod
    def _redact_url_parameters(value: str) -> str:
        parameters = []
        for name, item in parse_qsl(value, keep_blank_values=True):
            normalized = name.lower()
            sensitive = (
                normalized in {"auth", "authorization", "code", "key", "password", "secret", "session", "token"}
                or normalized.endswith("_token")
                or "api_key" in normalized
            )
            parameters.append((name, "[redacted]" if sensitive else item))
        return urlencode(parameters)
