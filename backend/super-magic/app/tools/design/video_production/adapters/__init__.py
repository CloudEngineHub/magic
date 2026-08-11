"""视频制作基础设施适配器。"""

from app.tools.design.video_production.adapters.ffmpeg_video_composition_adapter import (
    FfmpegVideoCompositionAdapter,
    VideoCompositionError,
)

__all__ = ["FfmpegVideoCompositionAdapter", "VideoCompositionError"]
