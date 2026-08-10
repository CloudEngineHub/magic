"""获取单个 OAuth2 接口文档的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._api_docs import BaseOAuth2ApiDocTool


class OAuth2GetApiDocParams(BaseToolParams):
    """Parameters for reading one OAuth2 API document."""

    app_name: str = Field(..., description="Registered OAuth2 app name.")
    operation_id: str = Field(..., description="OpenAPI operationId to fetch.")


@tool(name="oauth2_get_api_doc")
class OAuth2GetApiDoc(BaseOAuth2ApiDocTool[OAuth2GetApiDocParams]):
    """Get recorded OAuth2 API documentation by operationId."""

    name = "oauth2_get_api_doc"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回获取接口文档前的展示文案。"""
        args = arguments or {}
        return {
            "action": i18n.translate("oauth2_get_api_doc", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.api_docs.getting",
                category="tool.messages",
                operation_id=args.get("operation_id", ""),
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
        """返回获取接口文档后的展示文案。"""
        args = arguments or {}
        message_key = "oauth2.api_docs.got" if result.ok else "oauth2.api_docs.get_failed"
        return {
            "action": i18n.translate("oauth2_get_api_doc", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", operation_id=args.get("operation_id", "")),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回单个接口文档的用户可见详情。"""
        info = result.extra_info or {}
        doc = info.get("operation") or {}
        lines = [
            "# OAuth2 接口文档",
            "",
            f"- 状态: {'获取成功' if result.ok else '获取失败'}",
            f"- app_name: `{info.get('app_name') or '-'}`",
            f"- 方法: `{info.get('method') or '-'}`",
            f"- 路径: `{info.get('path') or '-'}`",
            f"- operation_id: `{info.get('operation_id') or '-'}`",
            f"- 摘要: {info.get('summary') or '-'}",
            "",
        ]
        if result.ok:
            lines.extend([
                "## OpenAPI Operation",
                "",
                "```json",
                self.format_json(doc),
                "```",
            ])
        else:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_api_doc.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2GetApiDocParams) -> ToolResult:
        """根据 operationId 获取接口文档。"""
        try:
            await self.app_registry().get(params.app_name)
            operation = await self.api_doc_store().get_operation(params.app_name, params.operation_id)
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 API documentation get failed: {exc}",
                extra_info={
                    "app_name": params.app_name,
                    "operation_id": params.operation_id,
                    "user_error": str(exc),
                },
            )
        if operation is None:
            user_error = f"未找到接口文档 operation_id={params.operation_id}。"
            return ToolResult.error(
                f"OAuth2 API documentation '{params.operation_id}' was not found.",
                extra_info={
                    "app_name": params.app_name,
                    "operation_id": params.operation_id,
                    "user_error": user_error,
                },
            )

        data = operation.to_public_dict(include_operation=True)
        return ToolResult(
            content=(
                f"OAuth2 API documentation found: {operation.method.upper()} {operation.path}. "
                "Use this OpenAPI operation to prepare oauth2_request parameters."
            ),
            data=data,
            extra_info=data,
        )
