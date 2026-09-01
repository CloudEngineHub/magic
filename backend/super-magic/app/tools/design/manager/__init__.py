"""旧版 Canvas manager 兼容实现。

新的 Canvas 应用边界位于 ``app.tools.canvas``；本模块随旧 Design 目录在下一版本删除。
"""

from app.tools.design.manager.canvas_manager import (
    CanvasManager,
    ElementQuery,
    CanvasStatistics
)
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol

__all__ = [
    "CanvasManager",
    "ElementQuery",
    "CanvasStatistics",
    "CanvasManagerProtocol",
]
