"""OAuth2 接口文档工具的共享辅助能力。"""

from __future__ import annotations

import json
from abc import ABC
from typing import Any, Generic, TypeVar

from app.infrastructure.oauth2.api_doc_store import OAuth2ApiDocOperation, OAuth2ApiDocStore
from app.tools.core import BaseToolParams
from app.tools.oauth2._base import BaseOAuth2Tool

P = TypeVar("P", bound=BaseToolParams)


class BaseOAuth2ApiDocTool(BaseOAuth2Tool[P], Generic[P], ABC):
    """OAuth2 接口文档类 Code Mode 工具的共享基类。"""

    @staticmethod
    def api_doc_store() -> OAuth2ApiDocStore:
        """返回 OAuth2 接口文档存储。"""
        return OAuth2ApiDocStore()

    @staticmethod
    def operation_label(operation: dict[str, Any] | OAuth2ApiDocOperation | None) -> str:
        """生成用户可读的接口文档标签。"""
        if operation is None:
            return "-"
        if isinstance(operation, OAuth2ApiDocOperation):
            return f"{operation.method.upper()} {operation.path}"
        method = str(operation.get("method") or "").upper()
        path = str(operation.get("path") or "")
        operation_id = str(operation.get("operation_id") or "")
        return f"{method} {path}".strip() or operation_id or "-"

    @staticmethod
    def format_json(value: Any) -> str:
        """将任意对象格式化为稳定的 JSON 文本。"""
        try:
            return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False)
        except Exception:
            return str(value)

    @staticmethod
    def build_operation_table(operations: list[dict[str, Any]]) -> list[str]:
        """构造接口文档列表的 Markdown 表格。"""
        if not operations:
            return ["当前没有匹配的接口文档。"]
        lines = [
            "| 方法 | 路径 | operation_id | 摘要 | 更新时间 |",
            "| --- | --- | --- | --- | --- |",
        ]
        for item in operations:
            lines.append(
                "| {method} | `{path}` | `{operation_id}` | {summary} | {updated_at} |".format(
                    method=item.get("method") or "-",
                    path=item.get("path") or "-",
                    operation_id=item.get("operation_id") or "-",
                    summary=item.get("summary") or "-",
                    updated_at=item.get("updated_at") or "-",
                )
            )
        return lines
