"""旧 Design 视频制作基础设施适配器。

沙箱文件列表合成已迁移到 ``app.tools.canvas``；本模块计划在下一版本删除。
"""

from app.tools.design.video_production.adapters.ffmpeg_video_composition_adapter import (
    FfmpegVideoCompositionAdapter,
    VideoCompositionError,
)

__all__ = ["FfmpegVideoCompositionAdapter", "VideoCompositionError"]
