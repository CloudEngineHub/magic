"""文件图片探测适配器。"""

import asyncio
from pathlib import Path

from app.tools.canvas.production.ports.media_probe_port import ImageMediaInfo, MediaProbePort
from app.utils.async_file_utils import async_exists, async_stat


class FileMediaProbePort(MediaProbePort):
    """使用 Pillow 读取图片尺寸。"""

    async def inspect_image(self, path: Path) -> ImageMediaInfo:
        """在同步线程中读取格式和尺寸。"""
        if not await async_exists(path) or (await async_stat(path)).st_size <= 0:
            raise ValueError("Image file does not exist or is empty.")

        try:
            width, height = await asyncio.to_thread(self._read_size, path)
        except Exception as error:
            raise ValueError("Downloaded file is not a supported image.") from error
        if width <= 0 or height <= 0:
            raise ValueError("Image dimensions are invalid.")
        return ImageMediaInfo(width, height)

    @staticmethod
    def _read_size(path: Path) -> tuple[int, int]:
        """在线程中读取 Pillow 图片尺寸。"""
        from PIL import Image

        with Image.open(path) as image:
            return image.size
