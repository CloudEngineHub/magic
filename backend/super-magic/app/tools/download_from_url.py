import asyncio
import hashlib
import json
import os
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NamedTuple
from urllib.parse import urlparse

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.file import generate_safe_filename
from app.core.entity.attachment import AttachmentStorageType
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.abstract_file_tool import AbstractFileTool
from app.tools.core import BaseToolParams, tool
from app.tools.download_utils import get_download_driver
from app.tools.download_utils.drivers.base import (
    DownloadError,
    DownloadProgress,
    DownloadRequest,
    DownloadTimeouts,
    ProgressCallback,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import (
    async_close_fd,
    async_copy2,
    async_exists,
    async_mkdir,
    async_mkstemp,
    async_replace,
    async_stat,
    async_try_read_json,
    async_unlink,
    async_write_json,
)

logger = get_logger(__name__)

DEFAULT_CONNECT_TIMEOUT_SECONDS = 30.0
DEFAULT_READ_IDLE_TIMEOUT_SECONDS = 120.0


class DownloadFromUrlParams(BaseToolParams):
    url: str = Field(
        ...,
        description="""<!--zh: 要下载的文件 URL，支持 HTTP 和 HTTPS。-->
File URL to download. Supports HTTP and HTTPS.""",
    )
    file_path: str = Field(
        ...,
        description="""<!--zh: 工作区内的保存路径，包含文件名；目录不存在时自动创建。-->
Workspace-relative save path including the file name. Missing directories are created automatically.""",
    )


class DownloadResult(NamedTuple):
    """单文件下载结果。"""

    file_size: int
    content_type: str
    file_exists: bool
    file_path: str
    url: str
    from_cache: bool
    resumed: bool
    retry_count: int
    request_strategy: str


@dataclass(frozen=True)
class CacheMetadata:
    """完整缓存文件元数据。"""

    content_type: str
    url: str
    file_size: int


class DownloadCacheManager:
    """管理操作系统临时目录中的完整缓存和续传状态。"""

    def __init__(self) -> None:
        self.cache_dir = Path(tempfile.gettempdir()) / "super-magic-downloads"

    def get_cache_path(
        self,
        url: str,
        *,
        target_identity: str,
        headers: Mapping[str, str] | None = None,
    ) -> Path:
        normalized_headers = sorted(
            (key.lower(), value) for key, value in (headers or {}).items()
        )
        payload = json.dumps(
            {
                "url": url,
                "target": target_identity,
                "headers": normalized_headers,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        cache_key = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        return self.cache_dir / cache_key

    async def ensure_cache_dir(self) -> None:
        await async_mkdir(self.cache_dir, parents=True, exist_ok=True)

    async def save_metadata(
        self,
        cache_path: Path,
        *,
        content_type: str,
        url: str,
        file_size: int,
    ) -> None:
        await async_write_json(
            self._metadata_path(cache_path),
            {
                "content_type": content_type,
                "url": url,
                "file_size": file_size,
            },
            ensure_ascii=False,
        )

    async def load_metadata(self, cache_path: Path) -> CacheMetadata | None:
        data = await async_try_read_json(self._metadata_path(cache_path))
        if not data:
            return None
        try:
            return CacheMetadata(
                content_type=str(data["content_type"]),
                url=str(data["url"]),
                file_size=int(data["file_size"]),
            )
        except (KeyError, TypeError, ValueError):
            logger.warning("下载缓存元数据无效: %s", self._metadata_path(cache_path))
            return None

    def is_cache_file(self, file_path: str) -> bool:
        path = Path(file_path)
        return path.parent == self.cache_dir or self.cache_dir in path.parents

    async def try_to_get_metadata_for_file(self, file_path: str) -> CacheMetadata | None:
        if not self.is_cache_file(file_path):
            return None
        return await self.load_metadata(Path(file_path))

    @staticmethod
    def _metadata_path(cache_path: Path) -> Path:
        return cache_path.parent / f"{cache_path.name}.meta"


# 单文件下载底座与 ReadFile 一样保留为标准 Tool，供批量下载和其它工具内部复用。
# 不在 Agent 的 tools 中挂载；模型下载统一通过 download Skill 调用 download_from_urls。
@tool()
class DownloadFromUrl(AbstractFileTool[DownloadFromUrlParams], WorkspaceTool[DownloadFromUrlParams]):
    """<!--zh
    下载单个 HTTP 或 HTTPS 文件到工作区。
    -->
    Download one HTTP or HTTPS file into the workspace.
    """

    def __init__(self, **data: object) -> None:
        super().__init__(**data)
        self.cache_manager = DownloadCacheManager()
        self._download_locks: dict[str, asyncio.Lock] = {}
        self._driver = get_download_driver()

    async def try_to_get_metadata_for_file(self, file_path: str) -> CacheMetadata | None:
        return await self.cache_manager.try_to_get_metadata_for_file(file_path)

    async def execute(self, tool_context: ToolContext, params: DownloadFromUrlParams) -> ToolResult:
        return await self.execute_purely(params, tool_context=tool_context)

    async def execute_purely(
        self,
        params: DownloadFromUrlParams,
        cache_only: bool = False,
        tool_context: ToolContext | None = None,
        timeout_seconds: int | None = None,
        *,
        headers: Mapping[str, str] | None = None,
        overwrite: bool = True,
        progress_callback: ProgressCallback | None = None,
        interruption_event: asyncio.Event | None = None,
    ) -> ToolResult:
        try:
            self._validate_url(params.url)
            resolved_headers = dict(headers or {})
            resolved_interruption_event = interruption_event or self._interruption_event(tool_context)

            if cache_only and not params.file_path.strip():
                download_result = await self._download_file(
                    url=params.url,
                    file_path=Path(),
                    cache_only=True,
                    timeout_seconds=timeout_seconds,
                    headers=resolved_headers,
                    overwrite=True,
                    progress_callback=progress_callback,
                    interruption_event=resolved_interruption_event,
                )
                extension = self._determine_extension_from_content_type(
                    download_result.content_type,
                    params.url,
                )
                return ToolResult(
                    content=(
                        f"Downloaded the file to the internal cache: {download_result.file_path}. "
                        f"Size: {self._format_size(download_result.file_size)}."
                    ),
                    extra_info={
                        "file_path": download_result.file_path,
                        "file_exists": False,
                        "file_size": download_result.file_size,
                        "content_type": download_result.content_type,
                        "url": download_result.url,
                        "from_cache": download_result.from_cache,
                        "file_extension": extension,
                        "cache_only": True,
                        "resumed": download_result.resumed,
                        "retry_count": download_result.retry_count,
                        "request_strategy": download_result.request_strategy,
                        "status": "completed",
                    },
                )

            file_path = self.resolve_download_path(params.file_path, params.url)
            await async_mkdir(file_path.parent, parents=True, exist_ok=True)
            file_exists = await async_exists(file_path)

            if file_exists and not overwrite:
                return ToolResult(
                    content=f"Skipped the download because the target file already exists: {file_path}",
                    extra_info={
                        "file_path": str(file_path),
                        "file_exists": True,
                        "file_size": (await async_stat(file_path)).st_size,
                        "content_type": "application/octet-stream",
                        "url": params.url,
                        "from_cache": False,
                        "resumed": False,
                        "retry_count": 0,
                        "request_strategy": "not_requested",
                        "status": "skipped",
                    },
                )

            if tool_context is not None:
                async with self._file_versioning_context(
                    tool_context,
                    file_path,
                    track_in_horizon=False,
                ):
                    download_result = await self._download_file(
                        url=params.url,
                        file_path=file_path,
                        cache_only=False,
                        timeout_seconds=timeout_seconds,
                        headers=resolved_headers,
                        overwrite=overwrite,
                        progress_callback=progress_callback,
                        interruption_event=resolved_interruption_event,
                    )
            else:
                download_result = await self._download_file(
                    url=params.url,
                    file_path=file_path,
                    cache_only=False,
                    timeout_seconds=timeout_seconds,
                    headers=resolved_headers,
                    overwrite=overwrite,
                    progress_callback=progress_callback,
                    interruption_event=resolved_interruption_event,
                )

            return ToolResult(
                content=(
                    f"Downloaded the file to {file_path}. "
                    f"Size: {self._format_size(download_result.file_size)}. "
                    f"Request strategy: {download_result.request_strategy}."
                ),
                extra_info={
                    "file_path": str(file_path),
                    "file_exists": file_exists,
                    "file_size": download_result.file_size,
                    "content_type": download_result.content_type,
                    "url": download_result.url,
                    "from_cache": download_result.from_cache,
                    "file_extension": file_path.suffix.lower(),
                    "resumed": download_result.resumed,
                    "retry_count": download_result.retry_count,
                    "request_strategy": download_result.request_strategy,
                    "status": "completed",
                },
            )
        except asyncio.CancelledError:
            raise
        except DownloadError as exc:
            logger.warning("下载失败: %s, 原因: %s", params.url, exc)
            next_action = "retry_same_request" if exc.resume_available or exc.retryable else "review_request"
            return ToolResult.error(
                self._download_error_content(exc, next_action),
                extra_info={
                    "status": "failed",
                    "retryable": exc.retryable,
                    "resume_available": exc.resume_available,
                    "downloaded_bytes": exc.downloaded_bytes,
                    "total_bytes": exc.total_bytes,
                    "request_strategy": exc.request_strategy,
                    "next_action": next_action,
                },
            )
        except Exception as exc:
            error_detail = f"{type(exc).__name__}: {exc!s}".rstrip(": ")
            logger.error("下载文件失败: %s", error_detail, exc_info=True)
            return ToolResult.error(
                f"Failed to download the file: {error_detail}",
                extra_info={
                    "status": "failed",
                    "retryable": False,
                    "resume_available": False,
                    "next_action": "review_request",
                },
            )

    def resolve_download_path(self, file_path: str, url: str) -> Path:
        """解析并清理用户指定的目标路径。"""
        full_path = self.resolve_path(file_path)
        base_name, extension = os.path.splitext(full_path.name)
        safe_base_name = generate_safe_filename(base_name)

        if not safe_base_name:
            url_filename = os.path.basename(urlparse(url).path)
            url_base_name, url_extension = os.path.splitext(url_filename)
            safe_base_name = generate_safe_filename(url_base_name) if url_base_name else "downloaded_file"
            if url_extension and not extension:
                extension = url_extension

        if extension and not extension.startswith("."):
            extension = f".{extension}"
        return full_path.parent / f"{safe_base_name}{extension}"

    async def download_file(
        self,
        url: str,
        file_path: Path,
        cache_only: bool = False,
    ) -> DownloadResult:
        return await self._download_file(url=url, file_path=file_path, cache_only=cache_only)

    async def _download_file(
        self,
        url: str,
        file_path: Path,
        cache_only: bool = False,
        timeout_seconds: int | None = None,
        headers: Mapping[str, str] | None = None,
        overwrite: bool = True,
        progress_callback: ProgressCallback | None = None,
        interruption_event: asyncio.Event | None = None,
    ) -> DownloadResult:
        target_identity = "__cache_only__" if cache_only else str(file_path)
        cache_path = self.cache_manager.get_cache_path(
            url,
            target_identity=target_identity,
            headers=headers,
        )
        lock = self._download_locks.setdefault(str(cache_path), asyncio.Lock())
        async with lock:
            return await self._download_file_with_lock(
                url=url,
                file_path=file_path,
                cache_path=cache_path,
                cache_only=cache_only,
                timeout_seconds=timeout_seconds,
                headers=headers,
                overwrite=overwrite,
                progress_callback=progress_callback,
                interruption_event=interruption_event,
            )

    async def _download_file_with_lock(
        self,
        *,
        url: str,
        file_path: Path,
        cache_path: Path,
        cache_only: bool,
        timeout_seconds: int | None,
        headers: Mapping[str, str] | None,
        overwrite: bool,
        progress_callback: ProgressCallback | None,
        interruption_event: asyncio.Event | None,
    ) -> DownloadResult:
        file_exists = await async_exists(file_path) if not cache_only else False
        await self.cache_manager.ensure_cache_dir()

        if await async_exists(cache_path):
            metadata = await self.cache_manager.load_metadata(cache_path)
            file_size = (await async_stat(cache_path)).st_size
            target_path = str(cache_path)
            if not cache_only:
                if file_exists and not overwrite:
                    return DownloadResult(
                        file_size=(await async_stat(file_path)).st_size,
                        content_type=metadata.content_type if metadata else "application/octet-stream",
                        file_exists=True,
                        file_path=str(file_path),
                        url=metadata.url if metadata else url,
                        from_cache=True,
                        resumed=False,
                        retry_count=0,
                        request_strategy="cache_hit",
                    )
                await self._copy_cache_to_target(cache_path, file_path)
                target_path = str(file_path)

            return DownloadResult(
                file_size=file_size,
                content_type=metadata.content_type if metadata else "application/octet-stream",
                file_exists=file_exists,
                file_path=target_path,
                url=metadata.url if metadata else url,
                from_cache=True,
                resumed=False,
                retry_count=0,
                request_strategy="cache_hit",
            )

        explicit_total_timeout = float(timeout_seconds) if timeout_seconds is not None else None
        request = DownloadRequest(
            url=url,
            destination=cache_path,
            headers=dict(headers or {}),
            timeouts=DownloadTimeouts(
                connect_seconds=(
                    min(DEFAULT_CONNECT_TIMEOUT_SECONDS, explicit_total_timeout)
                    if explicit_total_timeout is not None
                    else DEFAULT_CONNECT_TIMEOUT_SECONDS
                ),
                read_idle_seconds=(
                    explicit_total_timeout
                    if explicit_total_timeout is not None
                    else DEFAULT_READ_IDLE_TIMEOUT_SECONDS
                ),
                total_seconds=explicit_total_timeout,
            ),
        )
        driver_result = await self._driver.download(
            request,
            progress_callback=progress_callback,
            interruption_event=interruption_event,
        )
        await self.cache_manager.save_metadata(
            cache_path,
            content_type=driver_result.content_type,
            url=driver_result.final_url,
            file_size=driver_result.file_size,
        )

        target_path = str(cache_path)
        if not cache_only:
            await self._copy_cache_to_target(cache_path, file_path)
            target_path = str(file_path)

        return DownloadResult(
            file_size=driver_result.file_size,
            content_type=driver_result.content_type,
            file_exists=file_exists,
            file_path=target_path,
            url=driver_result.final_url,
            from_cache=False,
            resumed=driver_result.resumed,
            retry_count=driver_result.retry_count,
            request_strategy=driver_result.request_strategy,
        )

    async def _copy_cache_to_target(self, source_path: Path, target_path: Path) -> None:
        file_descriptor, temporary_name = await async_mkstemp(
            prefix=f".{target_path.name}.",
            suffix=".download",
            dir=target_path.parent,
        )
        temporary_path = Path(temporary_name)
        await async_close_fd(file_descriptor)
        try:
            await async_copy2(source_path, temporary_path)
            await async_replace(temporary_path, target_path)
        finally:
            await async_unlink(temporary_path)

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, Any] | None = None,
    ) -> ToolDetail | None:
        if not result.ok:
            return ToolDetail(
                type=DisplayType.TEXT,
                data={"message": self._truncate(result.content, 300)},
            )

        file_path = str((result.extra_info or {}).get("file_path") or "")
        if not file_path or not await async_exists(file_path):
            return None

        resolved_file_path = Path(file_path)
        try:
            relative_file_path = resolved_file_path.relative_to(self.base_dir).as_posix()
        except ValueError:
            logger.error(f"下载文件不在当前工作区内: {resolved_file_path}")
            return None

        return ToolDetail(
            type=self.get_display_type_by_extension(file_path),
            data=FileContent(
                file_name=resolved_file_path.name,
                content="",
                relative_file_path=relative_file_path,
                storage_type=AttachmentStorageType.WORKSPACE,
            ),
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        if not result.ok:
            return {
                "action": i18n.translate("download_from_url", category="tool.actions"),
                "remark": i18n.translate(
                    "download_from_url.error",
                    category="tool.messages",
                    error=result.content,
                ),
            }
        url = str((arguments or {}).get("url") or "")
        return {
            "action": i18n.translate("download_from_url", category="tool.actions"),
            "remark": url or i18n.translate("download_from_url.completed", category="tool.messages"),
        }

    @staticmethod
    def _interruption_event(tool_context: ToolContext | None) -> asyncio.Event | None:
        agent_context = tool_context.get_extension("agent_context") if tool_context else None
        return agent_context.get_interruption_event() if agent_context else None

    @staticmethod
    def _validate_url(url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must be a valid HTTP or HTTPS URL")

    @staticmethod
    def _download_error_content(error: DownloadError, next_action: str) -> str:
        parts = [f"Download failed: {error}"]
        if error.downloaded_bytes > 0:
            parts.append(f"Preserved bytes: {error.downloaded_bytes}")
        parts.append(f"Resume available: {'yes' if error.resume_available else 'no'}")
        parts.append(f"Next action: {next_action}")
        return ". ".join(parts) + "."

    @staticmethod
    def _determine_extension_from_content_type(content_type: str, url: str) -> str:
        content_type_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
            "application/json": ".json",
            "application/zip": ".zip",
        }
        normalized = content_type.lower()
        for candidate, extension in content_type_map.items():
            if candidate in normalized:
                return extension
        url_extension = Path(urlparse(url).path).suffix.lower()
        return url_extension if 1 < len(url_extension) <= 10 else ""

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        size = float(size_bytes)
        for unit in ("B", "KB", "MB", "GB", "TB"):
            if size < 1024 or unit == "TB":
                return f"{int(size)} {unit}" if unit == "B" else f"{size:.2f} {unit}"
            size /= 1024
        return f"{size_bytes} B"

    @staticmethod
    def _truncate(text: str, max_length: int) -> str:
        return text if len(text) <= max_length else f"{text[: max_length - 1]}…"


__all__ = [
    "CacheMetadata",
    "DownloadCacheManager",
    "DownloadFromUrl",
    "DownloadFromUrlParams",
    "DownloadProgress",
    "DownloadResult",
]
