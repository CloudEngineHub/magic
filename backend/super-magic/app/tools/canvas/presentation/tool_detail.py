"""Canvas 工具面向用户的详情展示构建器。"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n


class CanvasToolDetailBuilder:
    """在保留结构化值的前提下构建国际化 Canvas Markdown 详情。"""

    def __init__(
        self,
        file_name: str,
        title_key: str,
        result: ToolResult,
        arguments: Mapping[str, Any] | None = None,
    ) -> None:
        """初始化详情标题、状态和工具结果数据。"""
        self._file_name = file_name
        self._data = result.data or {}
        self._arguments = arguments or {}
        self._lines = [
            self._translate(f"canvas.detail.title.{title_key}"),
            self._field_line("status", self.status_value("succeeded" if result.ok else "failed")),
        ]

    @property
    def data(self) -> dict[str, Any]:
        """返回工具结构化结果数据。"""
        return self._data

    @property
    def arguments(self) -> Mapping[str, Any]:
        """返回工具调用参数。"""
        return self._arguments

    def add_field(self, field_key: str, value: Any) -> None:
        """追加一个带翻译标签的详情字段。"""
        self._lines.append(self._field_line(field_key, self.localized_field_value(field_key, value)))

    def add_item(self, fields: Mapping[str, Any]) -> None:
        """追加一条带翻译字段标签的批量结果。"""
        rendered = []
        for field_key, value in fields.items():
            rendered.append(
                f"{self._translate(f'canvas.detail.field.{field_key}')}="
                f"{self.localized_field_value(field_key, value)}"
            )
        self._lines.append(f"- {' | '.join(rendered)}")

    def add_warning(self, value: Any) -> None:
        """追加一条用户可读的警告信息。"""
        self.add_field("warning", value)

    def build(self) -> ToolDetail:
        """生成最终的 Markdown ToolDetail。"""
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=self._file_name, content="\n".join(self._lines)),
        )

    @staticmethod
    def display_value(value: Any) -> str:
        """把空值转换为稳定的用户展示占位符。"""
        return "-" if value is None or value == "" else str(value)

    @classmethod
    def status_value(cls, status: Any) -> str:
        """翻译已知状态，未知状态保留原始值。"""
        return cls.enum_value("status", status)

    @classmethod
    def enum_value(cls, category: str, value: Any) -> str:
        """翻译指定类别的稳定枚举值，未知值保留原文。"""
        display = cls.display_value(value)
        code = f"canvas.detail.{category}.{display}"
        translated = i18n.translate(code, category="tool.messages")
        return display if translated == code else translated

    @classmethod
    def localized_field_value(cls, field_key: str, value: Any) -> str:
        """根据字段语义选择状态、枚举或普通值的展示方式。"""
        if field_key == "status":
            return cls.status_value(value)
        if field_key in {"state", "type", "rule"}:
            return cls.enum_value(field_key, value)
        if field_key == "timed_out":
            return cls.boolean_value(value)
        return cls.display_value(value)

    @classmethod
    def boolean_value(cls, value: Any) -> str:
        """把布尔值转换为当前语言的可读文本。"""
        code = "canvas.detail.boolean.true" if bool(value) else "canvas.detail.boolean.false"
        return i18n.translate(code, category="tool.messages")

    @staticmethod
    def _translate(code: str) -> str:
        """翻译详情内部文案键。"""
        return i18n.translate(code, category="tool.messages")

    @classmethod
    def _field_line(cls, field_key: str, value: str) -> str:
        """生成带翻译字段标签的 Markdown 行。"""
        return f"- {cls._translate(f'canvas.detail.field.{field_key}')}: {value}"
