"""基础视频合成端口。"""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol


@dataclass(frozen=True)
class VideoCompositionRequest:
    """描述一次与 Canvas DSL 解耦的基础 MP4 合成请求。"""

    video_paths: list[Path]
    audio_path: Optional[Path]
    output_path: Path
    width: int
    height: int


@dataclass(frozen=True)
class VideoCompositionResult:
    """描述完成后的 MP4 文件事实。"""

    output_path: Path
    width: int
    height: int
    duration_seconds: float
    has_audio: bool


class VideoCompositionPort(Protocol):
    """定义视频制作服务可依赖的基础合成能力。"""

    async def compose(
        self,
        request: VideoCompositionRequest,
        *,
        interruption_event: Optional[asyncio.Event] = None,
    ) -> VideoCompositionResult:
        """顺序合并视频并按需使用一条最终音轨。"""

