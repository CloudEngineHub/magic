import asyncio
import hashlib
import json
import random
import re
from collections.abc import AsyncIterator, Mapping
from contextlib import suppress
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

import aiohttp

from agentlang.logger import get_logger
from app.tools.download_utils.drivers.base import (
    DownloadDriverInterface,
    DownloadError,
    DownloadPhase,
    DownloadProgress,
    DownloadRequest,
    DownloadResultItem,
    ProgressCallback,
)
from app.tools.driver_log_utils import redact_headers, redact_url, to_log_text
from app.tools.webview_utils import IMAGE_DOWNLOAD_HEADERS
from app.utils.async_file_utils import (
    async_exists,
    async_mkdir,
    async_replace,
    async_stat,
    async_try_read_json,
    async_unlink,
    async_write_bytes_iter,
    async_write_json,
)

logger = get_logger(__name__)

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
ORIGIN_RETRY_STATUS_CODES = {403, 412}
CHUNK_SIZE = 1024 * 1024
RETRY_BASE_DELAY_SECONDS = 1.0
CONTENT_RANGE_PATTERN = re.compile(r"^bytes\s+(\d+)-(\d+)/(\d+|\*)$", re.IGNORECASE)
UNSATISFIED_RANGE_PATTERN = re.compile(r"^bytes\s+\*/(\d+)$", re.IGNORECASE)


class DirectDownloadDriver(DownloadDriverInterface):
    """支持断点续传和进度回调的直接 HTTP 下载驱动。"""

    def is_available(self) -> bool:
        return True

    async def download(
        self,
        request: DownloadRequest,
        *,
        progress_callback: ProgressCallback | None = None,
        interruption_event: asyncio.Event | None = None,
    ) -> DownloadResultItem:
        await async_mkdir(request.destination.parent, parents=True, exist_ok=True)

        explicit_headers = dict(request.headers)
        origin_retry_used = False
        last_error: DownloadError | None = None

        for retry_count in range(request.max_retries + 1):
            await self._raise_if_interrupted(interruption_event)
            request_strategy = self._request_strategy(explicit_headers, origin_retry_used)

            if retry_count > 0:
                await self._emit_progress(
                    progress_callback,
                    DownloadProgress(
                        phase=DownloadPhase.RETRYING,
                        downloaded_bytes=last_error.downloaded_bytes if last_error else 0,
                        total_bytes=last_error.total_bytes if last_error else None,
                        retry_count=retry_count,
                        resumed=bool(last_error and last_error.resume_available),
                        request_strategy=request_strategy,
                    ),
                )

            try:
                return await self._download_once(
                    request,
                    retry_count=retry_count,
                    request_strategy=request_strategy,
                    add_origin=origin_retry_used,
                    progress_callback=progress_callback,
                    interruption_event=interruption_event,
                )
            except asyncio.CancelledError:
                raise
            except DownloadError as exc:
                last_error = exc

                if (
                    exc.status_code in ORIGIN_RETRY_STATUS_CODES
                    and not origin_retry_used
                    and not self._has_header(explicit_headers, "Origin")
                ):
                    origin_retry_used = True
                    logger.info(
                        "下载请求将使用自动同源 Origin 重试: %s",
                        to_log_text(redact_url(request.url)),
                    )
                    continue

                if not exc.retryable or retry_count >= request.max_retries:
                    raise

                delay = exc.retry_after_seconds or self._retry_delay(retry_count)
                await self._sleep_with_interruption(delay, interruption_event)
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                partial_size, total_bytes = await self._partial_state(request.destination)
                last_error = DownloadError(
                    f"Network error while downloading: {type(exc).__name__}: {exc}",
                    retryable=True,
                    resume_available=partial_size > 0,
                    downloaded_bytes=partial_size,
                    total_bytes=total_bytes,
                    request_strategy=request_strategy,
                )
                if retry_count >= request.max_retries:
                    raise last_error from exc
                await self._sleep_with_interruption(self._retry_delay(retry_count), interruption_event)

        if last_error is not None:
            raise last_error
        raise DownloadError("Download failed without a result", retryable=False)

    async def _download_once(
        self,
        request: DownloadRequest,
        *,
        retry_count: int,
        request_strategy: str,
        add_origin: bool,
        progress_callback: ProgressCallback | None,
        interruption_event: asyncio.Event | None,
    ) -> DownloadResultItem:
        partial_path = self._partial_path(request.destination)
        metadata_path = self._metadata_path(request.destination)
        request_fingerprint = self._request_fingerprint(request.url, request.headers)
        metadata = await async_try_read_json(metadata_path)
        partial_size = await self._file_size(partial_path)

        if not request.resume or not self._metadata_matches(metadata, request.url, request_fingerprint):
            await self._clear_partial_state(partial_path, metadata_path)
            metadata = None
            partial_size = 0

        headers = self._build_headers(request.url, request.headers, add_origin=add_origin)
        if partial_size > 0:
            headers["Range"] = f"bytes={partial_size}-"
            validator = str((metadata or {}).get("etag") or (metadata or {}).get("last_modified") or "")
            if validator:
                headers["If-Range"] = validator

        timeout = aiohttp.ClientTimeout(
            total=request.timeouts.total_seconds,
            connect=request.timeouts.connect_seconds,
            sock_connect=request.timeouts.connect_seconds,
            sock_read=request.timeouts.read_idle_seconds,
        )

        logger.info(
            "[DirectDownloadDriver] request GET %s headers=%s strategy=%s",
            to_log_text(redact_url(request.url)),
            to_log_text(redact_headers(headers)),
            request_strategy,
        )

        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(request.url, allow_redirects=True, headers=headers) as response:
                logger.info("[DirectDownloadDriver] response status=%s", response.status)

                if response.status == 416 and partial_size > 0:
                    complete_size = self._parse_unsatisfied_total(response.headers.get("Content-Range"))
                    if complete_size == partial_size and self._response_validators_match(
                        response,
                        metadata,
                    ):
                        await async_replace(partial_path, request.destination)
                        await async_unlink(metadata_path)
                        return DownloadResultItem(
                            file_path=request.destination,
                            content_type=str((metadata or {}).get("content_type") or "application/octet-stream"),
                            file_size=partial_size,
                            final_url=str(response.url),
                            resumed=True,
                            retry_count=retry_count,
                            request_strategy=request_strategy,
                        )
                    await self._clear_partial_state(partial_path, metadata_path)
                    raise DownloadError(
                        "The server rejected the saved byte range; retrying from the beginning.",
                        retryable=True,
                        status_code=416,
                        request_strategy=request_strategy,
                    )

                if response.status in RETRYABLE_STATUS_CODES:
                    raise DownloadError(
                        f"HTTP {response.status} {response.reason}",
                        retryable=True,
                        status_code=response.status,
                        resume_available=partial_size > 0,
                        downloaded_bytes=partial_size,
                        total_bytes=self._metadata_total(metadata),
                        request_strategy=request_strategy,
                        retry_after_seconds=self._parse_retry_after(response.headers.get("Retry-After")),
                    )

                if response.status not in {200, 206}:
                    raise DownloadError(
                        f"HTTP {response.status} {response.reason}",
                        retryable=False,
                        status_code=response.status,
                        resume_available=partial_size > 0,
                        downloaded_bytes=partial_size,
                        total_bytes=self._metadata_total(metadata),
                        request_strategy=request_strategy,
                    )

                append = partial_size > 0 and response.status == 206
                total_bytes = self._resolve_total_bytes(response, partial_size if append else 0)

                if append:
                    range_start = self._parse_content_range_start(response.headers.get("Content-Range"))
                    if range_start != partial_size:
                        await self._clear_partial_state(partial_path, metadata_path)
                        raise DownloadError(
                            "The server returned an inconsistent byte range; retrying from the beginning.",
                            retryable=True,
                            status_code=response.status,
                            request_strategy=request_strategy,
                        )
                elif partial_size > 0:
                    await self._clear_partial_state(partial_path, metadata_path)
                    partial_size = 0
                    metadata = None

                content_type = response.headers.get("Content-Type", "application/octet-stream")
                resume_metadata = {
                    "url": request.url,
                    "final_url": str(response.url),
                    "request_fingerprint": request_fingerprint,
                    "total_bytes": total_bytes,
                    "etag": response.headers.get("ETag"),
                    "last_modified": response.headers.get("Last-Modified"),
                    "content_type": content_type,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                await async_write_json(metadata_path, resume_metadata, ensure_ascii=False)

                resumed = append and partial_size > 0
                await self._emit_progress(
                    progress_callback,
                    DownloadProgress(
                        phase=DownloadPhase.STARTING,
                        downloaded_bytes=partial_size,
                        total_bytes=total_bytes,
                        retry_count=retry_count,
                        resumed=resumed,
                        request_strategy=request_strategy,
                    ),
                )

                downloaded_bytes = partial_size

                async def chunks() -> AsyncIterator[bytes]:
                    nonlocal downloaded_bytes
                    async for chunk in self._iter_chunks(response, interruption_event):
                        downloaded_bytes += len(chunk)
                        await self._emit_progress(
                            progress_callback,
                            DownloadProgress(
                                phase=DownloadPhase.DOWNLOADING,
                                downloaded_bytes=downloaded_bytes,
                                total_bytes=total_bytes,
                                retry_count=retry_count,
                                resumed=resumed,
                                request_strategy=request_strategy,
                            ),
                        )
                        yield chunk

                await async_write_bytes_iter(partial_path, chunks(), append=append)

                if total_bytes is not None and downloaded_bytes != total_bytes:
                    raise DownloadError(
                        f"Incomplete download: expected {total_bytes} bytes, received {downloaded_bytes} bytes",
                        retryable=True,
                        resume_available=downloaded_bytes > 0,
                        downloaded_bytes=downloaded_bytes,
                        total_bytes=total_bytes,
                        request_strategy=request_strategy,
                    )

                await async_replace(partial_path, request.destination)
                await async_unlink(metadata_path)
                await self._emit_progress(
                    progress_callback,
                    DownloadProgress(
                        phase=DownloadPhase.COMPLETED,
                        downloaded_bytes=downloaded_bytes,
                        total_bytes=total_bytes or downloaded_bytes,
                        retry_count=retry_count,
                        resumed=resumed,
                        request_strategy=request_strategy,
                    ),
                )

                return DownloadResultItem(
                    file_path=request.destination,
                    content_type=content_type,
                    file_size=downloaded_bytes,
                    final_url=str(response.url),
                    resumed=resumed,
                    retry_count=retry_count,
                    request_strategy=request_strategy,
                )

    async def _iter_chunks(
        self,
        response: aiohttp.ClientResponse,
        interruption_event: asyncio.Event | None,
    ) -> AsyncIterator[bytes]:
        iterator = response.content.iter_chunked(CHUNK_SIZE).__aiter__()
        interrupt_task = (
            asyncio.create_task(interruption_event.wait()) if interruption_event is not None else None
        )

        try:
            while True:
                chunk_task = asyncio.create_task(iterator.__anext__())
                if interrupt_task is None:
                    try:
                        yield await chunk_task
                    except StopAsyncIteration:
                        return
                    continue

                done, _ = await asyncio.wait(
                    {chunk_task, interrupt_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if interrupt_task in done:
                    chunk_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await chunk_task
                    raise asyncio.CancelledError

                try:
                    yield chunk_task.result()
                except StopAsyncIteration:
                    return
        finally:
            if interrupt_task is not None:
                interrupt_task.cancel()
                with suppress(asyncio.CancelledError):
                    await interrupt_task

    def _build_headers(
        self,
        url: str,
        explicit_headers: Mapping[str, str],
        *,
        add_origin: bool,
    ) -> dict[str, str]:
        headers = dict(IMAGE_DOWNLOAD_HEADERS)
        headers["Accept"] = "*/*"
        headers["Accept-Encoding"] = "identity"
        headers["Sec-Fetch-Dest"] = "empty"

        parsed_url = urlparse(url)
        origin = f"{parsed_url.scheme}://{parsed_url.netloc}" if parsed_url.scheme and parsed_url.netloc else ""
        if origin and not self._has_header(explicit_headers, "Referer"):
            headers["Referer"] = f"{origin}/"
        if add_origin and origin and not self._has_header(explicit_headers, "Origin"):
            headers["Origin"] = origin

        self._apply_explicit_headers(headers, explicit_headers)
        return headers

    @staticmethod
    def _apply_explicit_headers(target: dict[str, str], explicit: Mapping[str, str]) -> None:
        existing_by_lower = {key.lower(): key for key in target}
        for key, value in explicit.items():
            old_key = existing_by_lower.get(key.lower())
            if old_key is not None and old_key != key:
                target.pop(old_key, None)
            target[key] = value

    @staticmethod
    def _has_header(headers: Mapping[str, str], name: str) -> bool:
        expected = name.lower()
        return any(key.lower() == expected for key in headers)

    @staticmethod
    def _request_strategy(explicit_headers: Mapping[str, str], origin_retry_used: bool) -> str:
        if explicit_headers:
            return "explicit_headers"
        if origin_retry_used:
            return "auto_origin_retry"
        return "auto_same_origin"

    @staticmethod
    def _request_fingerprint(url: str, headers: Mapping[str, str]) -> str:
        normalized_headers = sorted((key.lower(), value) for key, value in headers.items())
        payload = json.dumps(
            {"url": url, "headers": normalized_headers},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _metadata_matches(metadata: dict[str, object] | None, url: str, fingerprint: str) -> bool:
        if metadata is None:
            return False
        return metadata.get("url") == url and metadata.get("request_fingerprint") == fingerprint

    @staticmethod
    def _metadata_total(metadata: dict[str, object] | None) -> int | None:
        value = (metadata or {}).get("total_bytes")
        return value if isinstance(value, int) and value >= 0 else None

    @staticmethod
    def _response_validators_match(
        response: aiohttp.ClientResponse,
        metadata: dict[str, object] | None,
    ) -> bool:
        if metadata is None:
            return False
        saved_etag = metadata.get("etag")
        response_etag = response.headers.get("ETag")
        if saved_etag and response_etag and saved_etag != response_etag:
            return False
        saved_modified = metadata.get("last_modified")
        response_modified = response.headers.get("Last-Modified")
        if saved_modified and response_modified and saved_modified != response_modified:
            return False
        return True

    @staticmethod
    def _partial_path(destination: Path) -> Path:
        return destination.parent / f"{destination.name}.part"

    @staticmethod
    def _metadata_path(destination: Path) -> Path:
        return destination.parent / f"{destination.name}.part.meta"

    async def _partial_state(self, destination: Path) -> tuple[int, int | None]:
        partial_path = self._partial_path(destination)
        metadata = await async_try_read_json(self._metadata_path(destination))
        return await self._file_size(partial_path), self._metadata_total(metadata)

    @staticmethod
    async def _file_size(path: Path) -> int:
        if not await async_exists(path):
            return 0
        return (await async_stat(path)).st_size

    @staticmethod
    async def _clear_partial_state(partial_path: Path, metadata_path: Path) -> None:
        await async_unlink(partial_path)
        await async_unlink(metadata_path)

    @staticmethod
    def _parse_content_range_start(value: str | None) -> int | None:
        if not value:
            return None
        match = CONTENT_RANGE_PATTERN.match(value.strip())
        return int(match.group(1)) if match else None

    @staticmethod
    def _parse_unsatisfied_total(value: str | None) -> int | None:
        if not value:
            return None
        match = UNSATISFIED_RANGE_PATTERN.match(value.strip())
        return int(match.group(1)) if match else None

    @staticmethod
    def _resolve_total_bytes(response: aiohttp.ClientResponse, offset: int) -> int | None:
        content_range = response.headers.get("Content-Range")
        if content_range:
            match = CONTENT_RANGE_PATTERN.match(content_range.strip())
            if match and match.group(3) != "*":
                return int(match.group(3))
        if response.content_length is None:
            return None
        return offset + response.content_length

    @staticmethod
    def _parse_retry_after(value: str | None) -> float | None:
        if not value:
            return None
        stripped = value.strip()
        if stripped.isdigit():
            return max(0.0, float(stripped))
        try:
            retry_at = parsedate_to_datetime(stripped)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None

    @staticmethod
    def _retry_delay(retry_count: int) -> float:
        base = RETRY_BASE_DELAY_SECONDS * (2**retry_count)
        return base + random.uniform(0, min(1.0, base / 2))

    @staticmethod
    async def _emit_progress(
        callback: ProgressCallback | None,
        progress: DownloadProgress,
    ) -> None:
        if callback is not None:
            await callback(progress)

    @staticmethod
    async def _raise_if_interrupted(interruption_event: asyncio.Event | None) -> None:
        if interruption_event is not None and interruption_event.is_set():
            raise asyncio.CancelledError

    async def _sleep_with_interruption(
        self,
        delay: float,
        interruption_event: asyncio.Event | None,
    ) -> None:
        if interruption_event is None:
            await asyncio.sleep(delay)
            return

        sleep_task = asyncio.create_task(asyncio.sleep(delay))
        interrupt_task = asyncio.create_task(interruption_event.wait())
        try:
            done, _ = await asyncio.wait(
                {sleep_task, interrupt_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if interrupt_task in done:
                raise asyncio.CancelledError
        finally:
            for task in (sleep_task, interrupt_task):
                if not task.done():
                    task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
