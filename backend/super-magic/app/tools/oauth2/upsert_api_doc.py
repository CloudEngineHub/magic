"""新增或更新 OAuth2 接口文档的 Code Mode 工具。"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._api_docs import BaseOAuth2ApiDocTool


class OAuth2UpsertApiDocParams(BaseToolParams):
    """新增或更新 OAuth2 接口文档的参数。"""

    app_name: str = Field(..., description="""<!--zh: 已注册的 OAuth2 app_name。-->
Registered OAuth2 app name.""")
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"] = Field(
        ...,
        description="""<!--zh: HTTP 方法。-->
HTTP method.""",
    )
    path: Optional[str] = Field(None, description="""<!--zh: OpenAPI path。不传时会从 url 中解析。-->
OpenAPI path. If omitted, it is parsed from url.""")
    url: Optional[str] = Field(None, description="""<!--zh: 完整接口 URL，来自平台文档或已验证调用。-->
Full API URL from provider docs or a verified request.""")
    operation_id: Optional[str] = Field(None, description="""<!--zh: 可选 OpenAPI operationId，不传时自动生成。-->
Optional OpenAPI operationId. Generated from method and path when omitted.""")
    summary: Optional[str] = Field(None, description="""<!--zh: 接口摘要。-->
Short API summary.""")
    description: Optional[str] = Field(None, description="""<!--zh: 接口说明。-->
API description.""")
    tags: Optional[List[str]] = Field(None, description="""<!--zh: OpenAPI tags。-->
OpenAPI tags.""")
    headers: Optional[Dict[str, Any]] = Field(None, description="""<!--zh: 业务请求头说明。不要传 token、Authorization 等敏感头。-->
Business header documentation. Do not include token or Authorization headers.""")
    query_schema: Optional[Dict[str, Any]] = Field(None, description="""<!--zh: query 参数 schema 或说明。-->
Query parameter schema or descriptions.""")
    request_body_schema: Optional[Dict[str, Any]] = Field(None, description="""<!--zh: JSON 请求体 schema。-->
JSON request body schema.""")
    response_status_code: str = Field("200", description="""<!--zh: 主要响应状态码。-->
Primary response status code.""")
    response_description: Optional[str] = Field(None, description="""<!--zh: 响应说明。-->
Response description.""")
    response_schema: Optional[Dict[str, Any]] = Field(None, description="""<!--zh: 响应 JSON schema。不要保存真实个人数据。-->
Response JSON schema. Do not store raw personal data.""")
    source_refs: Optional[List[str]] = Field(None, description="""<!--zh: 文档来源链接或用户提供的来源说明。-->
Source document links or user-provided references.""")
    example_tool_call: Optional[Dict[str, Any]] = Field(None, description="""<!--zh: 可复用的 oauth2_request 示例参数，不要包含 access token。-->
Reusable oauth2_request parameters. Do not include access tokens.""")
    notes: Optional[str] = Field(None, description="""<!--zh: 调用注意事项。不要保存 token、code、secret 或原始个人响应。-->
Usage notes. Do not store tokens, codes, secrets, or raw personal response bodies.""")
    verified: bool = Field(True, description="""<!--zh: 是否来自已验证的成功调用。-->
Whether this documentation came from a verified successful request.""")


@tool(name="oauth2_upsert_api_doc")
class OAuth2UpsertApiDoc(BaseOAuth2ApiDocTool[OAuth2UpsertApiDocParams]):
    """<!--zh: 新增或更新某个 OAuth2 app 的业务接口文档。-->
    Create or update recorded business API documentation for an OAuth2 app."""

    name = "oauth2_upsert_api_doc"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回保存接口文档前的展示文案。"""
        args = arguments or {}
        return {
            "action": i18n.translate("oauth2_upsert_api_doc", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.api_docs.upserting",
                category="tool.messages",
                target=self.operation_label(args),
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
        """返回保存接口文档后的展示文案。"""
        target = self.operation_label(result.extra_info or arguments or {})
        message_key = "oauth2.api_docs.upserted" if result.ok else "oauth2.api_docs.upsert_failed"
        return {
            "action": i18n.translate("oauth2_upsert_api_doc", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", target=target),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回保存接口文档的用户可见详情。"""
        info = result.extra_info or {}
        lines = [
            "# OAuth2 接口文档保存结果",
            "",
            f"- 状态: {'已保存' if result.ok else '保存失败'}",
            f"- app_name: `{info.get('app_name') or (arguments or {}).get('app_name') or '-'}`",
            f"- 方法: `{info.get('method') or (arguments or {}).get('method') or '-'}`",
            f"- 路径: `{info.get('path') or (arguments or {}).get('path') or '-'}`",
            f"- operation_id: `{info.get('operation_id') or (arguments or {}).get('operation_id') or '-'}`",
        ]
        if result.ok:
            lines.extend([
                f"- 摘要: {info.get('summary') or '-'}",
                f"- 更新时间: {info.get('updated_at') or '-'}",
            ])
        else:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_api_doc_upsert.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2UpsertApiDocParams) -> ToolResult:
        """新增或更新接口文档，并保存为 OpenAPI operation。"""
        timezone_name = self.resolve_timezone(tool_context)
        try:
            await self.app_registry().get(params.app_name)
            payload = params.model_dump(exclude_none=True)
            operation = await self.api_doc_store().upsert_operation(params.app_name, payload, timezone_name)
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 API documentation save failed: {exc}",
                extra_info={
                    "app_name": params.app_name,
                    "method": params.method,
                    "path": params.path,
                    "operation_id": params.operation_id,
                    "user_error": str(exc),
                },
            )

        data = operation.to_public_dict(include_operation=True)
        return ToolResult(
            content=(
                f"OAuth2 API documentation saved: {operation.method.upper()} {operation.path} "
                f"(operation_id={operation.operation_id}). Use oauth2_get_api_doc next time before calling this API."
            ),
            data=data,
            extra_info=data,
        )
