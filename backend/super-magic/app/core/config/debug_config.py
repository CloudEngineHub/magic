"""本地调试模式配置。"""

import os

LOCAL_DEBUG_MODE_ENV = "ENABLE_LOCAL_DEBUG_MODE"
MOCK_IMAGE_GENERATION_ENV = "ENABLE_MOCK_IMAGE_GENERATION"
MOCK_VIDEO_GENERATION_ENV = "ENABLE_MOCK_VIDEO_GENERATION"
TRUE_VALUES = {"1", "true", "yes", "on"}


def is_local_debug_mode_enabled() -> bool:
    """统一控制只允许本地调试客户端使用的能力。"""
    return os.getenv(LOCAL_DEBUG_MODE_ENV, "").lower() in TRUE_VALUES


def is_mock_image_generation_enabled() -> bool:
    """判断是否使用本地图片生成 Handler。"""
    return os.getenv(MOCK_IMAGE_GENERATION_ENV, "").lower() in TRUE_VALUES


def is_mock_video_generation_enabled() -> bool:
    """判断是否使用本地视频生成 Handler。"""
    return os.getenv(MOCK_VIDEO_GENERATION_ENV, "").lower() in TRUE_VALUES
