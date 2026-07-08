"""媒体理解工具公共工具包。

为图片理解、视频理解等媒体类工具提供可复用的共享逻辑：
- constants: LLM 调用公共常量
- presigned_url: 存储文件预签名 URL 生成
- batch_media_resolve: 批量媒体来源解析通用数据结构
"""

from .constants import DISABLE_THINKING_BODY
from .presigned_url import generate_presigned_url
from .batch_media_resolve import MediaResolveResult, BatchMediaResolveResults
from .format_utils import extract_media_source_name
from .video_format_utils import (
    VIDEO_MIME_MAP,
    VideoFormatCheckResult,
    VideoFormatGuard,
    get_video_mime_type,
)

__all__ = [
    "DISABLE_THINKING_BODY",
    "generate_presigned_url",
    "MediaResolveResult",
    "BatchMediaResolveResults",
    "extract_media_source_name",
    "VIDEO_MIME_MAP",
    "VideoFormatCheckResult",
    "VideoFormatGuard",
    "get_video_mime_type",
]
