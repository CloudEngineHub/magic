"""文件图片探测适配器。"""

import asyncio
from io import BytesIO
from pathlib import Path

from app.tools.canvas.production.ports.media_probe_port import ImageMediaInfo, MediaProbePort
from app.utils.async_file_utils import async_exists, async_read_bytes, async_stat


class FileMediaProbePort(MediaProbePort):
    """使用 Pillow 读取图片尺寸。"""

    async def inspect_image(self, path: Path) -> ImageMediaInfo:
        """在同步线程中读取格式和尺寸。"""
        if not await async_exists(path) or (await async_stat(path)).st_size <= 0:
            raise ValueError("Image file does not exist or is empty.")

        try:
            image_bytes = await async_read_bytes(path)
            width, height = await asyncio.to_thread(self._read_size, image_bytes)
        except Exception as error:
            raise ValueError("Downloaded file is not a supported image.") from error
        if width <= 0 or height <= 0:
            raise ValueError("Image dimensions are invalid.")
        return ImageMediaInfo(width, height)

    @staticmethod
    def _read_size(image_bytes: bytes) -> tuple[int, int]:
        """在线程中从内存字节读取 Pillow 图片尺寸。"""
        from PIL import Image

        with Image.open(BytesIO(image_bytes)) as image:
            return image.size
