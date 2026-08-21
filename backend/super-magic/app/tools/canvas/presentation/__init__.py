"""Canvas ToolResult 和用户反馈 Presenter。"""

from app.tools.canvas.presentation.model_content import elements_content, items_content, overview_content
from app.tools.canvas.presentation.tool_detail import CanvasToolDetailBuilder
from app.tools.canvas.presentation.tool_feedback import canvas_remark, error_result

__all__ = [
    "CanvasToolDetailBuilder",
    "canvas_remark",
    "elements_content",
    "error_result",
    "items_content",
    "overview_content",
]
