"""检查文件分享入口的本地静态依赖。

模型使用说明维护在 ``agents/skills/share/references/file-dependencies.md``。
"""

from __future__ import annotations

import asyncio
import os
import re
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import urlsplit

import tinycss2
from bs4 import BeautifulSoup

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseTool, BaseToolParams, tool
from app.tools.core.tool_keepalive import start_tool_keep_alive, stop_tool_keep_alive
from app.utils.async_file_utils import (
    async_is_file,
    async_is_symlink,
    async_read_text,
    async_stat,
    get_file_id_from_xattr,
)

from .models import ShareErrorInfo, ShareServiceError
from .service_common import raise_if_interrupted
from .workspace import get_workspace_root, normalize_workspace_path

logger = get_logger(__name__)

_MAX_DEPTH = 10
_MAX_FILES = 500
_MAX_TEXT_BYTES = 20 * 1024 * 1024
_TEXT_EXTENSIONS = {".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".svg"}
_HTML_ATTRS = ("src", "href", "poster", "data")
_JS_REFERENCE_PATTERNS = (
    re.compile(r"import\s*\(\s*['\"]([^'\"]+)['\"]"),
    re.compile(r"import\s+['\"]([^'\"]+)['\"]"),
    re.compile(r"import\s+[^;]*?\sfrom\s+['\"]([^'\"]+)['\"]"),
    re.compile(r"require\s*\(\s*['\"]([^'\"]+)['\"]"),
    re.compile(r"new\s+URL\s*\(\s*['\"]([^'\"]+)['\"]"),
)
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class _InspectionResult:
    """静态依赖检查结果，仅供本工具内部转换输出。"""

    entry_file_path: str
    dependency_paths: tuple[str, ...]
    review_file_paths: tuple[str, ...]
    missing_paths: tuple[str, ...]
    unsynced_paths: tuple[str, ...]
    dynamic_references: tuple[str, ...]
    external_reference_count: int
    total_file_count: int
    total_bytes: int
    scan_complete: bool


class InspectFileShareParams(BaseToolParams):
    """文件分享依赖检查参数。"""

    entry_file_path: str = Field(
        ...,
        min_length=1,
        description="Workspace-relative path of the file that should open as the shared page entry.",
    )


@tool(name="inspect_file_share", code_mode_only=True)
class InspectFileShare(BaseTool[InspectFileShareParams]):
    """Inspect local files required by a share entry without changing the share."""

    name = "inspect_file_share"

    async def execute(self, tool_context: ToolContext, params: InspectFileShareParams) -> ToolResult:
        try:
            result = await _inspect_dependencies(tool_context, params.entry_file_path)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return _error_result(exc.info)
        except Exception:
            logger.exception("检查文件分享依赖时发生未处理异常")
            return _error_result(
                ShareErrorInfo(code="unknown", message="The file share dependency inspection failed unexpectedly.")
            )

        data: dict[str, object] = {
            "entry_file_path": result.entry_file_path,
            "dependency_paths": list(result.dependency_paths),
            "review_file_paths": list(result.review_file_paths),
            "missing_paths": list(result.missing_paths),
            "unsynced_paths": list(result.unsynced_paths),
            "dynamic_references": list(result.dynamic_references),
            "external_reference_count": result.external_reference_count,
            "total_file_count": result.total_file_count,
            "total_bytes": result.total_bytes,
            "scan_complete": result.scan_complete,
        }
        return ToolResult(content=_content(data), data=data, extra_info=data)

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        info = result.extra_info if isinstance(result.extra_info, Mapping) else {}
        title = _message("detail.inspect_success_title" if result.ok else "detail.inspect_failed_title")
        lines = [f"# {title}", ""]
        if result.ok:
            lines.extend(
                [
                    f"- {_message('detail.entry_file')}: `{_value(info.get('entry_file_path'))}`",
                    f"- {_message('detail.file_count')}: {_value(info.get('total_file_count'))}",
                    f"- {_message('detail.total_bytes')}: {_value(info.get('total_bytes'))}",
                    f"- {_message('detail.scan_complete')}: {_boolean(info.get('scan_complete'))}",
                ]
            )
            for key in ("dependency_paths", "missing_paths", "unsynced_paths", "dynamic_references"):
                values = info.get(key)
                if isinstance(values, list) and values:
                    lines.append(f"- {_message(f'detail.{key}')}: {len(values)}")
        else:
            lines.append(f"- {_message('detail.error')}: {_message('error.unknown')}")
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name="inspect_file_share.md", content="\n".join(lines)))

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, object] | None = None
    ) -> dict[str, object]:
        entry = Path(str((arguments or {}).get("entry_file_path") or "file")).name
        return {
            "tool_name": tool_name,
            "action": i18n.translate(tool_name, category="tool.actions"),
            "remark": _message("inspect.before", file_name=entry),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        key = "inspect.after_success" if result.ok else "inspect.after_failed"
        return {
            "tool_name": tool_name,
            "action": i18n.translate(tool_name, category="tool.actions"),
            "remark": _message(key),
        }


async def _inspect_dependencies(tool_context: ToolContext, entry_file_path: str) -> _InspectionResult:
    workspace_root = get_workspace_root(tool_context)
    entry_path = normalize_workspace_path(workspace_root, entry_file_path)
    if not await async_is_file(entry_path):
        raise ShareServiceError(
            ShareErrorInfo(
                code="file_not_found",
                message="The entry file does not exist in the workspace.",
                path=entry_file_path,
            )
        )

    keep_alive = start_tool_keep_alive(tool_context)
    try:
        return await _scan_dependencies(tool_context, workspace_root, entry_path)
    finally:
        stop_tool_keep_alive(keep_alive)


async def _scan_dependencies(
    tool_context: ToolContext,
    workspace_root: Path,
    entry_path: Path,
) -> _InspectionResult:
    queue: deque[tuple[Path, int]] = deque([(entry_path, 0)])
    visited: set[Path] = set()
    dependencies: list[str] = []
    review_paths: list[str] = []
    missing: list[str] = []
    unsynced: list[str] = []
    dynamic: list[str] = []
    total_bytes = 0
    text_bytes = 0
    external_count = 0
    scan_complete = True

    while queue:
        await raise_if_interrupted(tool_context)
        path, depth = queue.popleft()
        path = Path(os.path.abspath(os.path.normpath(str(path))))
        if await _contains_symlink(workspace_root, path):
            raise ShareServiceError(
                ShareErrorInfo(
                    code="path_symlink_not_allowed",
                    message="Share dependencies must not use symbolic links.",
                    path=path.relative_to(workspace_root).as_posix(),
                )
            )
        if path in visited:
            continue
        if depth > _MAX_DEPTH or len(visited) >= _MAX_FILES:
            scan_complete = False
            break

        visited.add(path)
        relative = path.relative_to(workspace_root).as_posix()
        total_bytes += int((await async_stat(path)).st_size)
        if path != entry_path:
            dependencies.append(relative)
        if _needs_review(path):
            review_paths.append(relative)
        if not (await get_file_id_from_xattr(path) or "").strip():
            unsynced.append(relative)

        if path.suffix.lower() not in _TEXT_EXTENSIONS:
            continue
        if text_bytes >= _MAX_TEXT_BYTES:
            scan_complete = False
            break
        try:
            content = await async_read_text(path, errors="replace")
        except (OSError, UnicodeError):
            scan_complete = False
            continue
        text_bytes += len(content.encode("utf-8", errors="ignore"))
        if text_bytes > _MAX_TEXT_BYTES:
            scan_complete = False
            break

        references, external, dynamic_refs = _extract_references(path, content)
        external_count += external
        dynamic.extend(f"{relative}: {item}" for item in dynamic_refs)
        for reference in references:
            target = _resolve_local_reference(path, workspace_root, reference)
            if target is None:
                if not _is_external(reference):
                    missing.append(f"{relative}: {reference}")
                continue
            if target in visited or any(target == queued_path for queued_path, _ in queue):
                continue
            if not await async_is_file(target):
                missing.append(f"{relative}: {reference}")
                continue
            queue.append((target, depth + 1))

    entry_relative = entry_path.relative_to(workspace_root).as_posix()
    return _InspectionResult(
        entry_file_path=entry_relative,
        dependency_paths=tuple(dependencies),
        review_file_paths=tuple(dict.fromkeys([entry_relative, *review_paths])),
        missing_paths=tuple(dict.fromkeys(missing)),
        unsynced_paths=tuple(dict.fromkeys(unsynced)),
        dynamic_references=tuple(dict.fromkeys(dynamic)),
        external_reference_count=external_count,
        total_file_count=len(visited),
        total_bytes=total_bytes,
        scan_complete=scan_complete,
    )


def _extract_references(path: Path, content: str) -> tuple[list[str], int, list[str]]:
    suffix = path.suffix.lower()
    if suffix in {".html", ".htm", ".svg"}:
        soup = BeautifulSoup(content, "html5lib")
        references: list[str] = []
        for element in soup.find_all(True):
            for attr in _HTML_ATTRS:
                value = element.get(attr)
                if isinstance(value, str):
                    references.append(value)
            srcset = element.get("srcset")
            if isinstance(srcset, str):
                references.extend(item.strip().split()[0] for item in srcset.split(",") if item.strip())
            style = element.get("style")
            if isinstance(style, str):
                references.extend(_css_references(style))
        for style in soup.find_all("style"):
            references.extend(_css_references(style.get_text()))
        return _classify_references(references)
    if suffix == ".css":
        return _classify_references(_css_references(content))
    if suffix in {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}:
        references = [
            match.group(1)
            for pattern in _JS_REFERENCE_PATTERNS
            for match in pattern.finditer(content)
        ]
        dynamic_refs = (
            ["runtime-computed resource reference"]
            if re.search(r"(?:fetch|axios|XMLHttpRequest)\s*\(", content)
            else []
        )
        local, external, _ = _classify_references(references)
        return local, external, dynamic_refs
    return [], 0, []


def _classify_references(references: list[str]) -> tuple[list[str], int, list[str]]:
    local: list[str] = []
    external = 0
    dynamic: list[str] = []
    for reference in references:
        value = reference.strip()
        if not value or value.startswith(("#", "data:", "blob:", "javascript:")):
            continue
        if _is_external(value):
            external += 1
        elif "${" in value or "*" in value:
            dynamic.append(value)
        else:
            local.append(value)
    return local, external, dynamic


def _css_references(content: str) -> list[str]:
    references = [match.group(2).strip() for match in _CSS_URL.finditer(content)]
    for rule in tinycss2.parse_stylesheet(content, skip_whitespace=True, skip_comments=True):
        if getattr(rule, "at_keyword", "").lower() == "import":
            prelude = tinycss2.serialize(rule.prelude).strip().strip("'\"")
            if prelude:
                references.append(prelude.split()[0].strip("'\""))
    return references


def _resolve_local_reference(source: Path, workspace_root: Path, reference: str) -> Path | None:
    if _is_external(reference):
        return None
    path_text = urlsplit(reference).path
    if not path_text:
        return None
    candidate = Path(path_text)
    if path_text.startswith("/"):
        candidate = workspace_root / path_text.lstrip("/")
    elif not candidate.is_absolute():
        candidate = source.parent / candidate
    normalized = Path(os.path.abspath(os.path.normpath(str(candidate))))
    try:
        normalized.relative_to(workspace_root)
    except ValueError:
        return None
    return normalized


async def _contains_symlink(workspace_root: Path, path: Path) -> bool:
    relative = path.relative_to(workspace_root)
    current = workspace_root
    for part in relative.parts:
        current /= part
        if await async_is_symlink(current):
            return True
    return False


def _is_external(reference: str) -> bool:
    parsed = urlsplit(reference)
    return bool(parsed.scheme or parsed.netloc) or reference.startswith("//")


def _needs_review(path: Path) -> bool:
    return path.suffix.lower() in {
        ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json",
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".webm", ".mov",
    }


def _content(data: Mapping[str, object]) -> str:
    lines = [
        "Static share-entry inspection completed. This is an assisting check, not a complete dependency manifest.",
        f"Entry file: {data['entry_file_path']}",
        f"Files available for sharing: {data['total_file_count']}",
        f"Total size: {data['total_bytes']} bytes",
        f"Scan complete within the configured static limits: {data['scan_complete']}",
        "Review the entry and relevant files before choosing the final share file set. Non-standard references, runtime-computed paths, conditional loading, and external resources may be missed.",
    ]
    for key, label in (
        ("dependency_paths", "Local dependencies"),
        ("missing_paths", "Missing references"),
        ("unsynced_paths", "Files not synchronized with MagicFS"),
        ("dynamic_references", "Dynamic or uncertain references"),
    ):
        values = data.get(key)
        if isinstance(values, list) and values:
            lines.append(f"{label}: {len(values)}")
            lines.extend(f"- {item}" for item in values[:20])
    external_count = data.get("external_reference_count", 0)
    if external_count:
        lines.append(f"External references excluded from local candidates: {external_count}")
    lines.append("A true scan_complete value only means the static scan finished within its limits; it does not prove that no other runtime dependencies exist.")
    return "\n".join(lines)


def _error_result(info: ShareErrorInfo) -> ToolResult:
    data = {"operation": "failed", "error_code": info.code}
    if info.path:
        data["path"] = info.path
    return ToolResult.error(info.message, data=data, extra_info=data, use_custom_remark=True)


def _message(key: str, **kwargs: object) -> str:
    return i18n.translate(f"share.inspect.{key}", category="tool.messages", **kwargs)


def _value(value: object) -> str:
    return str(value) if value not in (None, "") else "-"


def _boolean(value: object) -> str:
    return _message("detail.yes" if value is True else "detail.no")


__all__ = ["InspectFileShare", "InspectFileShareParams"]
