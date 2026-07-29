"""根据 Browser 工具真实结果生成人类可读详情。"""

from __future__ import annotations

from collections.abc import Mapping

from agentlang.tools.tool_result import ToolResult
from app.core.entity.factory.tool_detail_factory import ToolDetailFactory
from app.core.entity.message.server_message import BrowserContent, BrowserDetailStatus, ToolDetail
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
    @classmethod
    def presentation(cls, action: str, result: ToolResult) -> BrowserOperationPresentation:
        page = cls._page_data(result)
        target = cls._target_text(result)
        stats = cls._stats(result)
        status = BrowserDetailStatus.SUCCEEDED if result.ok else BrowserDetailStatus.FAILED
        return BrowserOperationPresentation(
            action=action,
            summary=cls._summary(action, result, stats, page=page, target=target),
            status=status,
            url=BrowserToolResultBuilder.safe_url(cls._string(page.get("url"))),
            page_title=cls._string(page.get("title")),
            target=target,
            stats=stats,
        )

    @staticmethod
    def detail(presentation: BrowserOperationPresentation, *, file_key: str | None = None) -> ToolDetail:
        return ToolDetailFactory.create_browser_detail(
            BrowserContent(
                url=presentation.url,
                title=presentation.page_title or presentation.action,
                file_key=file_key,
                action=presentation.action,
                summary=presentation.summary,
                page_title=presentation.page_title or None,
                target=presentation.target or None,
                status=presentation.status,
            )
        )

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
                if entry.get("error") or isinstance(status, int) and status >= 400:
                    failed += 1
                if status is None and not entry.get("error"):
                    pending += 1
            return BrowserNetworkStats(total=len(network_entries), failed=failed, pending=pending)
        return None

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
