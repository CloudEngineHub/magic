import asyncio
import json
from collections.abc import AsyncIterator, Awaitable
from contextlib import suppress
from pathlib import Path
from typing import TypeVar

import httpx

from agentlang.config.config import config
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
from app.tools.web_scrape_utils.drivers.web_collector import AccessDeniedException
from app.utils.async_file_utils import async_replace, async_unlink, async_write_bytes_iter

logger = get_logger(__name__)
CHUNK_SIZE = 1024 * 1024
T = TypeVar("T")


class WebCollectorDownloadDriver(DownloadDriverInterface):
    """通过 web-collector 服务代理下载，不声明断点续传能力。"""

    def __init__(self) -> None:
        self.base_url: str = config.get("web_collector.base_url", default="")
        self.api_token: str = config.get("web_collector.api_token", default="")

    def is_available(self) -> bool:
        return bool(self.base_url)

    async def download(
        self,
        request: DownloadRequest,
        *,
        progress_callback: ProgressCallback | None = None,
        interruption_event: asyncio.Event | None = None,
    ) -> DownloadResultItem:
        if request.headers:
            raise DownloadError(
                "The configured web-collector download driver does not support custom request headers.",
                retryable=False,
                request_strategy="explicit_headers",
            )

        api_url = f"{self.base_url.rstrip('/')}/v2/download"
        service_headers: dict[str, str] = {}
        if self.api_token:
            service_headers["Authorization"] = f"Bearer {self.api_token}"

        service_timeout = request.timeouts.total_seconds or request.timeouts.read_idle_seconds
        payload = {"url": request.url, "timeout": int(service_timeout)}
        timeout = httpx.Timeout(
            timeout=service_timeout,
            connect=request.timeouts.connect_seconds,
            read=request.timeouts.read_idle_seconds,
        )

        logger.info(
            "[WebCollectorDownloadDriver] request POST %s json=%s headers=%s",
            api_url,
            to_log_text({**payload, "url": redact_url(request.url)}),
            to_log_text(redact_headers(service_headers)),
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await self._await_with_interruption(
                client.post(api_url, json=payload, headers=service_headers),
                interruption_event,
            )
            logger.info("[WebCollectorDownloadDriver] response status=%s", response.status_code)

            if response.status_code != 200:
                try:
                    error_data = json.loads(response.text)
                    if error_data.get("error_code") == "ACCESS_DENIED":
                        raise AccessDeniedException(
                            error_data.get("error", "当前访问被限制，请联系管理员")
                        )
                except (json.JSONDecodeError, KeyError):
                    pass
                raise DownloadError(
                    f"web-collector returned HTTP {response.status_code}",
                    retryable=False,
                    status_code=response.status_code,
                    request_strategy="web_collector",
                )

            data = response.json()
            if not data.get("success"):
                raise DownloadError(
                    f"web-collector failed: {data.get('error', 'unknown error')}",
                    retryable=False,
                    request_strategy="web_collector",
                )

            download_url = data.get("download_url")
            if not isinstance(download_url, str) or not download_url:
                raise DownloadError(
                    "web-collector response did not include a download URL",
                    retryable=False,
                    request_strategy="web_collector",
                )

            content_type = str(data.get("content_type") or "application/octet-stream")
            declared_size = data.get("file_size")
            total_bytes = declared_size if isinstance(declared_size, int) and declared_size > 0 else None
            final_url = str(data.get("url") or request.url)
            temporary_path = Path(f"{request.destination}.tmp")

            await self._emit_progress(
                progress_callback,
                DownloadProgress(
                    phase=DownloadPhase.STARTING,
                    downloaded_bytes=0,
                    total_bytes=total_bytes,
                    retry_count=0,
                    resumed=False,
                    request_strategy="web_collector",
                ),
            )

            downloaded_bytes = 0
            try:
                async with client.stream("GET", download_url, headers=service_headers) as file_response:
                    file_response.raise_for_status()
                    if total_bytes is None and file_response.headers.get("Content-Length", "").isdigit():
                        total_bytes = int(file_response.headers["Content-Length"])

                    async def chunks() -> AsyncIterator[bytes]:
                        nonlocal downloaded_bytes
                        async for chunk in self._iter_chunks(file_response, interruption_event):
                            downloaded_bytes += len(chunk)
                            await self._emit_progress(
                                progress_callback,
                                DownloadProgress(
                                    phase=DownloadPhase.DOWNLOADING,
                                    downloaded_bytes=downloaded_bytes,
                                    total_bytes=total_bytes,
                                    retry_count=0,
                                    resumed=False,
                                    request_strategy="web_collector",
                                ),
                            )
                            yield chunk

                    await async_write_bytes_iter(temporary_path, chunks())

                await async_replace(temporary_path, request.destination)
            except asyncio.CancelledError:
                await async_unlink(temporary_path)
                raise
            except Exception:
                await async_unlink(temporary_path)
                raise

        await self._emit_progress(
            progress_callback,
            DownloadProgress(
                phase=DownloadPhase.COMPLETED,
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes or downloaded_bytes,
                retry_count=0,
                resumed=False,
                request_strategy="web_collector",
            ),
        )
        return DownloadResultItem(
            file_path=request.destination,
            content_type=content_type,
            file_size=downloaded_bytes,
            final_url=final_url,
            resumed=False,
            retry_count=0,
            request_strategy="web_collector",
        )

    async def _iter_chunks(
        self,
        response: httpx.Response,
        interruption_event: asyncio.Event | None,
    ) -> AsyncIterator[bytes]:
        iterator = response.aiter_bytes(chunk_size=CHUNK_SIZE).__aiter__()
        while True:
            try:
                yield await self._await_with_interruption(iterator.__anext__(), interruption_event)
            except StopAsyncIteration:
                return

    @staticmethod
    async def _await_with_interruption(
        awaitable: Awaitable[T],
        interruption_event: asyncio.Event | None,
    ) -> T:
        work_task = asyncio.create_task(awaitable)
        if interruption_event is None:
            return await work_task

        interrupt_task = asyncio.create_task(interruption_event.wait())
        try:
            done, _ = await asyncio.wait(
                {work_task, interrupt_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if interrupt_task in done:
                work_task.cancel()
                with suppress(asyncio.CancelledError):
                    await work_task
                raise asyncio.CancelledError
            return work_task.result()
        finally:
            if not interrupt_task.done():
                interrupt_task.cancel()
            with suppress(asyncio.CancelledError):
                await interrupt_task

    @staticmethod
    async def _emit_progress(
        callback: ProgressCallback | None,
        progress: DownloadProgress,
    ) -> None:
        if callback is not None:
            await callback(progress)
