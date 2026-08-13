"""Canvas Manager Factory - 顶层版本路由工厂。"""

import asyncio

from agentlang.logger import get_logger
from app.tools.design.codec.envelope_codec import (
    CanvasEnvelopeCodec,
    UnsupportedCanvasVersionError,
)
from app.tools.design.manager.canvas_manager import CanvasManager
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.manager.canvas_manager_v2 import CanvasManagerV2
from app.tools.design.manager.canvas_manager_v3 import CanvasManagerV3
from app.tools.design.utils.magic_project_design_parser import (
    MAGIC_PROJECT_VERSION_V1,
    MAGIC_PROJECT_VERSION_V2,
    get_project_file_path,
)
from app.utils.async_file_utils import async_exists, async_try_read_text

CANVAS_MANAGER_READ_MAX_RETRIES = 20
CANVAS_MANAGER_READ_RETRY_DELAY_SECONDS = 0.5

logger = get_logger(__name__)


async def get_canvas_manager(project_path: str) -> CanvasManagerProtocol:
    """按顶层 version 返回唯一 manager，兼容 MagicFS 延迟产生的空文件。"""
    file_path = get_project_file_path(project_path)

    # 文件不存在时使用当前默认版本，实际文件仍由 create_canvas 创建。
    if not await async_exists(file_path):
        return CanvasManagerV3(project_path)

    content = None
    for attempt in range(CANVAS_MANAGER_READ_MAX_RETRIES):
        content = await async_try_read_text(file_path)
        if content and content.strip():
            break
        if attempt < CANVAS_MANAGER_READ_MAX_RETRIES - 1:
            await asyncio.sleep(CANVAS_MANAGER_READ_RETRY_DELAY_SECONDS)
    if not content or not content.strip():
        raise ValueError(
            f"Canvas project file is empty after {CANVAS_MANAGER_READ_MAX_RETRIES} retries: {file_path}. "
            "The file may still be propagating through MagicFS."
        )

    version = CanvasEnvelopeCodec.get_version(content)
    if version == MAGIC_PROJECT_VERSION_V1:
        return CanvasManager(project_path)
    if version == MAGIC_PROJECT_VERSION_V2:
        return CanvasManagerV2(project_path)
    if version == "3.0.0":
        return CanvasManagerV3(project_path)

    logger.warning("Unsupported canvas version: %s, project=%s", version, project_path)
    raise UnsupportedCanvasVersionError(f"Unsupported canvas version: {version}")
