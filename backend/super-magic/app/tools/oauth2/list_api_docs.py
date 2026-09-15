"""查询 OAuth2 接口文档列表的 Code Mode 工具。"""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._api_docs import BaseOAuth2ApiDocTool


class OAuth2ListApiDocsParams(BaseToolParams):
    """Parameters for listing OAuth2 API documentation."""

    app_name: str = Field(..., description="Registered OAuth2 app name.")
    query: Optional[str] = Field(
        None,
        description="Keyword matching operation_id, path, summary, description, tags, or notes.",
    )
    method: Optional[str] = Field(None, description="Optional HTTP method filter.")
    path: Optional[str] = Field(None, description="Optional path fragment filter.")
    limit: int = Field(20, description="Maximum results. Defaults to 20 and cannot exceed 100.")


@tool(name="oauth2_list_api_docs")
class OAuth2ListApiDocs(BaseOAuth2ApiDocTool[OAuth2ListApiDocsParams]):
    """List recorded API documentation for an OAuth2 app."""

    name = "oauth2_list_api_docs"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回查询接口文档列表前的展示文案。"""
        args = arguments or {}
        return {
            "action": i18n.translate("oauth2_list_api_docs", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.api_docs.listing",
                category="tool.messages",
                app_name=args.get("app_name", ""),
            ),
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict | None = None,
    ) -> dict:
        """返回查询接口文档列表后的展示文案。"""
        args = arguments or {}
        message_key = "oauth2.api_docs.listed" if result.ok else "oauth2.api_docs.list_failed"
        return {
            "action": i18n.translate("oauth2_list_api_docs", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", app_name=args.get("app_name", "")),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回接口文档列表的用户可见详情。"""
        args = arguments or {}
        info = result.extra_info or {}
        app_name = info.get("app_name") or args.get("app_name", "")
        operations = info.get("operations") or []
        all_operations = info.get("all_operations") or []
        query = info.get("query") or args.get("query") or ""
        total_count = info.get("total_count", len(operations))
        lines = [
            "# OAuth2 接口文档列表",
            "",
            f"- 状态: {'查询成功' if result.ok else '查询失败'}",
            f"- app_name: `{app_name}`",
            f"- 查询词: `{query or '-'}`",
            f"- 匹配数量: {len(operations)}",
            f"- 文档总数: {total_count}",
            "",
        ]
        if result.ok:
            lines.extend(self.build_operation_table(operations))
            if not operations and all_operations:
                lines.extend([
                    "",
                    "## 当前已有接口文档",
                    "",
                    *self.build_operation_table(all_operations),
                ])
        else:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_api_docs.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2ListApiDocsParams) -> ToolResult:
        """查询 app 下已记录的接口文档列表。"""
        try:
            await self.app_registry().get(params.app_name)
            limit = min(max(params.limit, 1), 100)
            store = self.api_doc_store()
            operations = await store.list_operations(
                params.app_name,
                query=params.query,
                method=params.method,
                path=params.path,
                limit=limit,
            )
            all_operations = operations
            if params.query or params.method or params.path:
                all_operations = await store.list_operations(params.app_name, limit=100)
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 API documentation list failed: {exc}",
                extra_info={"app_name": params.app_name, "user_error": str(exc)},
            )

        rows = [operation.to_public_dict() for operation in operations]
        all_rows = [operation.to_public_dict() for operation in all_operations]
        data = {
            "app_name": params.app_name,
            "operations": rows,
            "all_operations": all_rows,
            "query": params.query or "",
            "method": params.method or "",
            "path": params.path or "",
            "total_count": len(all_rows),
        }
        if not rows:
            content = self._empty_result_content(params.app_name, params.query, all_rows)
        else:
            content = "Matched OAuth2 API documentation:\n" + "\n".join(
                f"- {item['method']} {item['path']} (operation_id={item['operation_id']}, summary={item['summary']})"
                for item in rows
            )
        return ToolResult(content=content, data=data, extra_info=data)

    @staticmethod
    def _empty_result_content(app_name: str, query: str | None, all_rows: list[dict]) -> str:
        """构造未命中接口文档时给模型看的结果说明。"""
        if all_rows:
            existing = "\n".join(
                f"- {item['method']} {item['path']} (operation_id={item['operation_id']}, summary={item['summary']})"
                for item in all_rows
            )
            return (
                f"No OAuth2 API documentation matched query '{query or ''}' for app '{app_name}', "
                "but this app already has recorded API documentation:\n"
                f"{existing}\n"
                "If none of these operations fits the user's request, use the provider docs for the request. "
                "After a successful call, ask the user whether to save the new API documentation for future use."
            )
        return (
            f"No OAuth2 API documentation is recorded for app '{app_name}'. "
            "Use the user's provider docs for the request. After a successful call, ask the user whether to save "
            "this API documentation for future use."
        )
