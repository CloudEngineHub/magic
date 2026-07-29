"""Browser 仅供外部能力读取的短期文件适配。"""

from __future__ import annotations

import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from collections.abc import AsyncIterator

from app.utils.async_file_utils import (
    async_close_fd,
    async_mkdir,
    async_mkstemp,
    async_unlink,
    async_write_bytes,
)


class BrowserFileAdapter:
    @staticmethod
    @asynccontextmanager
    async def temporary_png(image: bytes) -> AsyncIterator[str]:
        """为只接受文件路径的视觉能力短暂提供原始 PNG。"""
        temp_dir = Path(tempfile.gettempdir()) / "super-magic" / "browser-visual"
        await async_mkdir(temp_dir, parents=True, exist_ok=True)
        fd, file_path = await async_mkstemp(suffix=".png", prefix="browser-", dir=temp_dir)
        await async_close_fd(fd)
        try:
            await async_write_bytes(file_path, image)
            yield file_path
        finally:
            await async_unlink(file_path)
