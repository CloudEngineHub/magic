"""媒体探测端口。"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ImageMediaInfo:
    """描述图片宽高。"""

    width: int
    height: int


class MediaProbePort(ABC):
    """定义图片落盘后的格式和尺寸探测能力。"""

    @abstractmethod
    async def inspect_image(self, path: Path) -> ImageMediaInfo:
        """读取图片尺寸并拒绝无效文件。"""
