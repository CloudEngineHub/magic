"""
Design mode manager module - AI friendly canvas management classes
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
