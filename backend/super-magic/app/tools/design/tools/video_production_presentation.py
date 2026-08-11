"""视频制作工具 Markdown 展示辅助能力。"""

from __future__ import annotations

from typing import Any, Iterable

from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n


class VideoProductionMarkdownPresenter:
    """只负责构造 Markdown 展示，不决定具体工具的业务文案。"""

    @staticmethod
    def action(action_key: str) -> str:
        """把本地化动作名称转换为 Markdown 强调文本。"""
        action = i18n.translate(action_key, category="tool.actions")
        return f"**{action}**"

    @staticmethod
    def message(message_key: str, **kwargs: Any) -> str:
        """读取并格式化用户可见的本地化文案。"""
        return i18n.translate(message_key, category="tool.messages", **kwargs)

    @staticmethod
    def code(value: Any) -> str:
        """把动态值安全格式化为 Markdown 行内代码。"""
        normalized = str(value or "").replace("`", "'")
        return f"`{normalized}`"

    @staticmethod
    def result_data(result: ToolResult) -> dict[str, Any]:
        """读取字典类型的工具结果数据，其他类型统一视为空。"""
        return result.data if isinstance(result.data, dict) else {}

    @staticmethod
    def detail(
        file_name: str,
        title: str,
        lines: Iterable[str],
    ) -> ToolDetail:
        """根据具体工具提供的标题和内容构造 Markdown 详情。"""
        content = "\n".join([f"# {title}", "", *lines])
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=file_name, content=content),
        )
