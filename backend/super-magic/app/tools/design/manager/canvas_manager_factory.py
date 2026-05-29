"""Canvas Manager Factory - 版本路由工厂

根据 magic.project.js 的 canvas 形态返回对应版本的画布管理器：

    文件不存在（新建场景）              → CanvasManagerV2
    canvas 是 MAGICPROJECTDESIGNDATA:// → CanvasManagerV2（v2）
    canvas 是对象 / 其它               → CanvasManager（v1）

返回类型统一为基类 CanvasManager，工具层无需关心具体版本（V2 是其子类）。
判定只读取信封并看 canvas 字段类型，不解压 elements。
"""

from agentlang.logger import get_logger
from app.tools.design.manager.canvas_manager import CanvasManager
from app.tools.design.manager.canvas_manager_v2 import CanvasManagerV2
from app.tools.design.utils.magic_project_design_parser import (
    get_project_file_path,
    is_v2_project_content,
)
from app.utils.async_file_utils import async_exists, async_try_read_text

logger = get_logger(__name__)


async def get_canvas_manager(project_path: str) -> CanvasManager:
    """按 canvas 形态路由，返回对应的画布管理器实例。"""
    file_path = get_project_file_path(project_path)

    # 文件不存在：新建场景，使用 v2
    if not await async_exists(file_path):
        return CanvasManagerV2(project_path)

    content = await async_try_read_text(file_path)
    if content and is_v2_project_content(content):
        return CanvasManagerV2(project_path)

    return CanvasManager(project_path)
