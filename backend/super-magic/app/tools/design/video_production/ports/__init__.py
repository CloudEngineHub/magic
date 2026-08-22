"""旧 Design 视频制作外部能力端口。

本模块计划在下一版本随 ``app.tools.design`` 一并删除。
"""

from app.tools.design.video_production.ports.video_composition_port import (
    VideoCompositionPort,
    VideoCompositionRequest,
    VideoCompositionResult,
    VideoSourceInfo,
)

__all__ = [
    "VideoCompositionPort",
    "VideoCompositionRequest",
    "VideoCompositionResult",
    "VideoSourceInfo",
]
