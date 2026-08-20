"""Canvas ToolResult 和用户反馈 Presenter。"""

from app.tools.canvas.presentation.model_content import elements_content, items_content, overview_content
from app.tools.canvas.presentation.tool_feedback import error_result

__all__ = [
    "elements_content",
    "error_result",
    "items_content",
    "overview_content",
]
