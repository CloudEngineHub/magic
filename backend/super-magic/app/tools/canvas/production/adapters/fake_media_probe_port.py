"""Fake 媒体探测端口。"""

from pathlib import Path

from app.tools.canvas.production.ports.media_probe_port import ImageMediaInfo, MediaProbePort
from app.utils.async_file_utils import async_exists, async_stat


class FakeMediaProbePort(MediaProbePort):
    """返回固定 mock 图片尺寸。"""

    async def inspect_image(self, path: Path) -> ImageMediaInfo:
        """校验 mock 文件存在并返回尺寸。"""
        if not await async_exists(path) or (await async_stat(path)).st_size <= 0:
            raise ValueError("Image file does not exist or is empty.")
        return ImageMediaInfo(800, 600)
