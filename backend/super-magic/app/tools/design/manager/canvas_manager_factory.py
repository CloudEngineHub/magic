"""Canvas Manager Factory - 顶层版本路由工厂。"""

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

logger = get_logger(__name__)


async def get_canvas_manager(project_path: str) -> CanvasManagerProtocol:
    """按顶层 version 返回唯一 manager；未知版本拒绝处理。"""
    file_path = get_project_file_path(project_path)

    # 文件不存在时使用当前默认版本，实际文件仍由 create_canvas 创建。
    if not await async_exists(file_path):
        return CanvasManagerV3(project_path)

    content = await async_try_read_text(file_path)
    if not content:
        raise ValueError(f"Canvas project file is empty: {file_path}")

    version = CanvasEnvelopeCodec.get_version(content)
    if version == MAGIC_PROJECT_VERSION_V1:
        return CanvasManager(project_path)
    if version == MAGIC_PROJECT_VERSION_V2:
        return CanvasManagerV2(project_path)
    if version == "3.0.0":
        return CanvasManagerV3(project_path)

    logger.warning("Unsupported canvas version: %s, project=%s", version, project_path)
    raise UnsupportedCanvasVersionError(f"Unsupported canvas version: {version}")
