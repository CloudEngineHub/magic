"""根据 Browser 工具真实结果生成人类可读详情。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.core.entity.factory.tool_detail_factory import ToolDetailFactory
from app.core.entity.message.server_message import (
    BrowserContent,
    BrowserDetailStatus,
    DisplayType,
    FileContent,
    ToolDetail,
)
from app.i18n import i18n
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.presentation.models import (
    BrowserConsoleStats,
    BrowserNetworkStats,
    BrowserOperationPresentation,
    BrowserPageListStats,
    BrowserSnapshotStats,
)


class BrowserDetailBuilder:
    _MAX_MARKDOWN_PREVIEW_CHARS = 3_000
    _MAX_SNAPSHOT_PREVIEW_ITEMS = 12
    _MAX_DIAGNOSTIC_PREVIEW_ITEMS = 5
    _MAX_DIAGNOSTIC_ENTRY_CHARS = 300

    @classmethod
    def presentation(
        cls,
        action: str,
        result: ToolResult,
        *,
        tool_name: str | None = None,
        arguments: Mapping[str, object] | None = None,
    ) -> BrowserOperationPresentation:
        page = cls._page_data(result)
        target = cls._target_text(result) or cls._argument_target(tool_name, arguments or {}, result)
        stats = cls._stats(result)
        status = BrowserDetailStatus.SUCCEEDED if result.ok else BrowserDetailStatus.FAILED
        return BrowserOperationPresentation(
            action=action,
            summary=cls._summary(action, result, stats, page=page, target=target),
            status=status,
            url=BrowserToolResultBuilder.safe_url(cls._string(page.get("url"))),
            page_title=cls._string(page.get("title")),
            target=target,
            body=cls._detail_body(tool_name, arguments or {}, result),
            stats=stats,
        )

    @staticmethod
    def detail(presentation: BrowserOperationPresentation, *, file_key: str | None = None) -> ToolDetail:
        if file_key is None:
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(
                    file_name="browser-operation.md",
                    content=BrowserDetailBuilder._text_content(presentation),
                ),
            )
        return ToolDetailFactory.create_browser_detail(
            BrowserContent(
                url=presentation.url,
                title=presentation.page_title or presentation.action,
                file_key=file_key,
                action=presentation.action,
                summary=BrowserDetailBuilder._browser_summary(presentation),
                page_title=presentation.page_title or None,
                target=presentation.target or None,
                status=presentation.status,
            )
        )

    @staticmethod
    def _browser_summary(presentation: BrowserOperationPresentation) -> str:
        if not presentation.body or len(presentation.body) > 500:
            return presentation.summary
        return f"{presentation.summary}\n{presentation.body}"

    @classmethod
    def _text_content(cls, presentation: BrowserOperationPresentation) -> str:
        lines = [presentation.summary]
        if presentation.page_title:
            lines.append(cls._message("browser.detail.page_title", title=presentation.page_title))
        if presentation.url:
            lines.append(cls._message("browser.detail.url", url=presentation.url))
        if presentation.target:
            lines.append(cls._message("browser.detail.target", target=presentation.target))
        if presentation.body:
            lines.append(presentation.body)
        return "\n\n".join(lines)

    @classmethod
    def _summary(
        cls,
        action: str,
        result: ToolResult,
        stats: BrowserPageListStats | BrowserSnapshotStats | BrowserConsoleStats | BrowserNetworkStats | None,
        *,
        page: Mapping[str, object],
        target: str,
    ) -> str:
        if not result.ok:
            if target:
                return cls._message(
                    "browser.detail.failed_target",
                    action=action,
                    target=target,
                    error=cls._user_error(result),
                )
            return cls._message("browser.detail.failed", action=action, error=cls._user_error(result))
        if cls._string(page.get("readiness")) == "loading":
            return cls._message("browser.detail.succeeded_loading", action=action)
        if isinstance(stats, BrowserPageListStats):
            return cls._message("browser.detail.pages", count=stats.total)
        if isinstance(stats, BrowserSnapshotStats):
            return cls._message(
                "browser.detail.snapshot",
                count=stats.interactive_elements,
                suffix=cls._message("browser.detail.truncated") if stats.truncated else "",
            )
        if isinstance(stats, BrowserConsoleStats):
            return cls._message(
                "browser.detail.console",
                count=stats.total,
                errors=stats.errors,
                warnings=stats.warnings,
            )
        if isinstance(stats, BrowserNetworkStats):
            return cls._message(
                "browser.detail.network",
                count=stats.total,
                failed=stats.failed,
                pending=stats.pending,
            )
        if target:
            return cls._message("browser.detail.succeeded_target", action=action, target=target)
        page_title = cls._string(page.get("title")).strip()
        if page_title:
            return cls._message("browser.detail.succeeded_page", action=action, page=page_title)
        return cls._message("browser.detail.succeeded", action=action)

    @classmethod
    def _stats(
        cls,
        result: ToolResult,
    ) -> BrowserPageListStats | BrowserSnapshotStats | BrowserConsoleStats | BrowserNetworkStats | None:
        pages = result.data.get("pages")
        if isinstance(pages, list):
            active = sum(1 for page in pages if isinstance(page, Mapping) and page.get("active") is True)
            return BrowserPageListStats(total=len(pages), active=active)

        snapshot = result.data.get("snapshot")
        if isinstance(snapshot, Mapping):
            root_nodes = snapshot.get("root_nodes")
            node_count, ref_count = cls._snapshot_counts(root_nodes)
            diff = snapshot.get("diff")
            return BrowserSnapshotStats(
                nodes=node_count,
                interactive_elements=ref_count,
                truncated=snapshot.get("truncated") is True,
                added=cls._list_size(diff, "added"),
                removed=cls._list_size(diff, "removed"),
                changed=cls._list_size(diff, "changed"),
            )

        console_entries = result.data.get("console_entries")
        if isinstance(console_entries, list):
            levels = [cls._string(entry.get("level")).lower() for entry in console_entries if isinstance(entry, Mapping)]
            return BrowserConsoleStats(
                total=len(console_entries),
                errors=sum(level in {"error", "fatal"} for level in levels),
                warnings=sum(level in {"warning", "warn"} for level in levels),
            )

        network_entries = result.data.get("network_entries")
        if isinstance(network_entries, list):
            failed = 0
            pending = 0
            for entry in network_entries:
                if not isinstance(entry, Mapping):
                    continue
                status = entry.get("status")
                if entry.get("error") or (isinstance(status, int) and status >= 400):
                    failed += 1
                if status is None and not entry.get("error"):
                    pending += 1
            return BrowserNetworkStats(total=len(network_entries), failed=failed, pending=pending)
        return None

    @classmethod
    def _detail_body(
        cls,
        tool_name: str | None,
        arguments: Mapping[str, object],
        result: ToolResult,
    ) -> str:
        if tool_name == "browser_read_page":
            return cls._read_page_body(result)
        if tool_name == "browser_snapshot":
            return cls._snapshot_body(result)
        if tool_name == "browser_wait":
            return cls._wait_body(arguments)
        if tool_name == "browser_read_console":
            return cls._console_body(result)
        if tool_name == "browser_read_network":
            return cls._network_body(result)
        if tool_name in {
            "browser_fill",
            "browser_press",
            "browser_select",
            "browser_check",
            "browser_upload_file",
        }:
            return cls._interaction_body(tool_name, arguments, result)
        readiness = cls._string(cls._page_data(result).get("readiness"))
        if readiness == "stable":
            return cls._message("browser.detail.readiness_stable")
        if readiness == "loading":
            return cls._message("browser.detail.readiness_loading")
        return ""

    @classmethod
    def _read_page_body(cls, result: ToolResult) -> str:
        markdown = cls._string(result.data.get("markdown")).strip()
        scope = cls._string(result.data.get("scope"))
        lines = [cls._message("browser.detail.read_scope", scope=scope or "viewport")]
        if not markdown:
            lines.append(cls._message("browser.detail.no_readable_content"))
            return "\n\n".join(lines)
        truncated = len(markdown) > cls._MAX_MARKDOWN_PREVIEW_CHARS
        preview = markdown[: cls._MAX_MARKDOWN_PREVIEW_CHARS].rstrip()
        lines.append(preview)
        if truncated:
            lines.append(
                cls._message(
                    "browser.detail.content_truncated",
                    limit=f"{cls._MAX_MARKDOWN_PREVIEW_CHARS:,}",
                )
            )
        return "\n\n".join(lines)

    @classmethod
    def _snapshot_body(cls, result: ToolResult) -> str:
        snapshot = result.data.get("snapshot")
        if not isinstance(snapshot, Mapping):
            return ""
        items: list[str] = []
        pending = list(snapshot.get("root_nodes", [])) if isinstance(snapshot.get("root_nodes"), list) else []
        while pending and len(items) < cls._MAX_SNAPSHOT_PREVIEW_ITEMS:
            node = pending.pop(0)
            if not isinstance(node, Mapping):
                continue
            name = next(
                (
                    cls._string(node.get(key)).strip()
                    for key in ("name", "text", "role")
                    if cls._string(node.get(key)).strip()
                ),
                "",
            )
            if cls._string(node.get("ref")) and name:
                items.append(name)
            children = node.get("children")
            if isinstance(children, list):
                pending.extend(children)
        if not items:
            return cls._message("browser.detail.no_interactive_preview")
        return cls._message("browser.detail.interactive_preview", items="\n".join(f"- {item}" for item in items))

    @classmethod
    def _wait_body(cls, arguments: Mapping[str, object]) -> str:
        condition = cls._string(arguments.get("condition"))
        expected = next(
            (
                str(arguments[key])
                for key in ("value", "state", "duration_ms")
                if arguments.get(key) is not None
            ),
            "",
        )
        return cls._message(
            "browser.detail.wait_condition",
            condition=condition or "condition",
            expected=expected or cls._message("browser.detail.wait_default"),
        )

    @classmethod
    def _console_body(cls, result: ToolResult) -> str:
        entries = result.data.get("console_entries")
        if not isinstance(entries, list):
            return ""
        errors = [
            entry
            for entry in entries
            if isinstance(entry, Mapping)
            and cls._string(entry.get("level")).lower() in {"error", "fatal", "assert"}
        ][-cls._MAX_DIAGNOSTIC_PREVIEW_ITEMS :]
        if not errors:
            return cls._message("browser.detail.no_console_errors")
        items = "\n".join(
            f"- {cls._bounded_text(cls._string(entry.get('text')), cls._MAX_DIAGNOSTIC_ENTRY_CHARS)}"
            for entry in errors
        )
        return cls._message("browser.detail.console_error_preview", items=items)

    @classmethod
    def _network_body(cls, result: ToolResult) -> str:
        entries = result.data.get("network_entries")
        if not isinstance(entries, list):
            return ""
        failed = [
            entry
            for entry in entries
            if isinstance(entry, Mapping)
            and (
                entry.get("error")
                or cls._string(entry.get("phase")) == "failed"
                or isinstance(entry.get("status"), int)
                and entry["status"] >= 400
            )
        ][-cls._MAX_DIAGNOSTIC_PREVIEW_ITEMS :]
        if not failed:
            return cls._message("browser.detail.no_network_errors")
        lines = []
        for entry in failed:
            method = cls._string(entry.get("method")) or "GET"
            url = BrowserToolResultBuilder.safe_url(cls._string(entry.get("url")))
            status = entry.get("status")
            status_text = str(status) if isinstance(status, int) else cls._message("browser.detail.network_failed")
            lines.append(f"- {method} {url} — {status_text}")
        return cls._message("browser.detail.network_error_preview", items="\n".join(lines))

    @classmethod
    def _interaction_body(
        cls,
        tool_name: str,
        arguments: Mapping[str, object],
        result: ToolResult,
    ) -> str:
        if tool_name == "browser_fill":
            value = (
                cls._message("browser.detail.sensitive_value")
                if cls._is_sensitive_target(result)
                else cls._string(arguments.get("value"))
            )
            return cls._message("browser.detail.input_value", value=value)
        if tool_name == "browser_press":
            return cls._message("browser.detail.pressed_key", key=cls._string(arguments.get("key")))
        if tool_name == "browser_select":
            return cls._message("browser.detail.selected_value", value=cls._string(arguments.get("value")))
        if tool_name == "browser_check":
            checked = arguments.get("checked") is True
            return cls._message(
                "browser.detail.checked_state",
                state=cls._message("browser.detail.checked") if checked else cls._message("browser.detail.unchecked"),
            )
        file_paths = arguments.get("file_paths")
        count = len(file_paths) if isinstance(file_paths, list) else 0
        return cls._message("browser.detail.uploaded_files", count=count)

    @staticmethod
    def _bounded_text(value: str, limit: int) -> str:
        normalized = " ".join(value.split())
        return normalized if len(normalized) <= limit else normalized[:limit].rstrip() + "…"

    @classmethod
    def _snapshot_counts(cls, nodes: object) -> tuple[int, int]:
        if not isinstance(nodes, list):
            return 0, 0
        total = 0
        refs = 0
        pending = list(nodes)
        while pending:
            node = pending.pop()
            if not isinstance(node, Mapping):
                continue
            total += 1
            if cls._string(node.get("ref")):
                refs += 1
            children = node.get("children")
            if isinstance(children, list):
                pending.extend(children)
        return total, refs

    @staticmethod
    def _list_size(value: object, key: str) -> int:
        if not isinstance(value, Mapping):
            return 0
        items = value.get(key)
        return len(items) if isinstance(items, list) else 0

    @classmethod
    def _target_text(cls, result: ToolResult) -> str:
        direct_target = result.data.get("target")
        if isinstance(direct_target, str) and direct_target.strip():
            return direct_target.strip()
        action = result.data.get("action")
        if not isinstance(action, Mapping):
            return ""
        target = action.get("target")
        if not isinstance(target, Mapping):
            return ""
        return next(
            (
                value.strip()
                for value in (
                    cls._string(target.get("name")),
                    cls._string(target.get("text")),
                    cls._string(target.get("role")),
                )
                if value.strip()
            ),
            "",
        )

    @classmethod
    def _argument_target(
        cls,
        tool_name: str | None,
        arguments: Mapping[str, object],
        result: ToolResult,
    ) -> str:
        key_by_tool = {
            "browser_fill": "value",
            "browser_press": "key",
            "browser_select": "value",
            "browser_screenshot": "output_path",
            "browser_visual_query": "query",
            "browser_find_visual": "target",
        }
        argument_key = key_by_tool.get(tool_name or "")
        return cls._string(arguments.get(argument_key)).strip() if argument_key else ""

    @staticmethod
    def _is_sensitive_target(result: ToolResult) -> bool:
        action = result.data.get("action")
        if not isinstance(action, Mapping):
            return False
        target = action.get("target")
        return isinstance(target, Mapping) and target.get("is_sensitive") is True

    @staticmethod
    def _page_data(result: ToolResult) -> Mapping[str, object]:
        page = result.data.get("page")
        if isinstance(page, Mapping):
            return page
        action = result.data.get("action")
        if isinstance(action, Mapping):
            navigation = action.get("navigation")
            if isinstance(navigation, Mapping):
                navigation_page = navigation.get("page")
                if isinstance(navigation_page, Mapping):
                    return navigation_page
        return {}

    @staticmethod
    def _string(value: object) -> str:
        return value if isinstance(value, str) else ""

    @staticmethod
    def _user_error(result: ToolResult) -> str:
        value = result.extra_info.get("user_error")
        if isinstance(value, str) and value.strip():
            return value
        return i18n.translate("tool.call_failed_remark", category="tool.messages")

    @staticmethod
    def _message(key: str, **kwargs: object) -> str:
        return i18n.translate(key, category="tool.messages", **kwargs)
