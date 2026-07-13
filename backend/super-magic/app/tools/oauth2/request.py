"""发起 OAuth2 认证 HTTP 请求的 Code Mode 工具。"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, Literal, Optional
from urllib.parse import urlparse

import aiohttp
from pydantic import BaseModel, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool

_DEFAULT_TIMEOUT_SECONDS = 30
_MAX_TIMEOUT_SECONDS = 120
_MAX_RESPONSE_BYTES = 256 * 1024
_MODEL_BODY_LIMIT = 12000
_DETAIL_BODY_LIMIT = 3000
_BLOCKED_HEADER_NAMES = {
    "authorization",
    "proxy-authorization",
    "access-token",
    "x-access-token",
}


class OAuth2RequestAuthParams(BaseModel):
    """OAuth2 access-token injection settings."""

    type: Literal["bearer", "header"] = Field(
        "bearer",
        description="Token injection mode: bearer Authorization or a custom header.",
    )
    header_name: str = Field(
        "Authorization",
        description="Header name used when type='header', such as Access-Token.",
    )
    prefix: str = Field(
        "Bearer ",
        description="Token prefix. Use an empty string for raw-token headers.",
    )


class OAuth2RequestParams(BaseToolParams):
    """Parameters for an OAuth2-authenticated HTTP request."""

    app_name: str = Field(..., description="Authorized OAuth2 app name.")
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = Field(
        "GET",
        description="HTTP request method.",
    )
    url: str = Field(..., description="Business API URL from the user or provider documentation.")
    headers: Optional[Dict[str, str]] = Field(
        None,
        description="Business headers. Do not include OAuth2 authorization headers.",
    )
    query: Optional[Dict[str, Any]] = Field(
        None,
        description="URL query parameters.",
    )
    json_body: Optional[Any] = Field(
        None,
        description="JSON request body. Mutually exclusive with form_body.",
    )
    form_body: Optional[Dict[str, Any]] = Field(
        None,
        description="Form request body. Mutually exclusive with json_body.",
    )
    auth: Optional[OAuth2RequestAuthParams] = Field(
        None,
        description="Token injection settings. Defaults to Authorization: Bearer <token>.",
    )
    timeout: int = Field(
        _DEFAULT_TIMEOUT_SECONDS,
        description="Request timeout in seconds. Maximum 120.",
    )


@tool(name="oauth2_request")
class OAuth2Request(BaseOAuth2Tool[OAuth2RequestParams]):
    """Send an HTTP request with an OAuth2 access token and show the request details."""

    name = "oauth2_request"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回 OAuth2 HTTP 请求前的展示文案。"""
        args = arguments or {}
        return {
            "action": i18n.translate("oauth2_request", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.request.requesting",
                category="tool.messages",
                target=self._request_label(args.get("method", "GET"), args.get("url", "")),
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
        """返回 OAuth2 HTTP 请求后的展示文案。"""
        args = arguments or {}
        info = result.extra_info or {}
        key = "oauth2.request.succeeded" if result.ok else "oauth2.request.failed"
        return {
            "action": i18n.translate("oauth2_request", category="tool.actions"),
            "remark": i18n.translate(
                key,
                category="tool.messages",
                target=self._request_label(args.get("method", "GET"), args.get("url", "")),
                status_code=str(info.get("status_code") or "-"),
            ),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回 OAuth2 HTTP 请求的用户可见详情。"""
        args = arguments or {}
        info = result.extra_info or {}
        request_headers = self._redact_headers(info.get("request_headers") or args.get("headers") or {})
        response_headers = self._redact_headers(info.get("response_headers") or {})
        request_duration_ms = info.get("request_duration_ms")
        body_text = str(info.get("body_text") or "")
        if len(body_text) > _DETAIL_BODY_LIMIT:
            body_text = body_text[:_DETAIL_BODY_LIMIT] + "\n... 响应内容已截断"

        lines = [
            "# OAuth2 API 请求",
            "",
            f"- 状态: {'成功' if result.ok else '失败'}",
            f"- 方法: `{info.get('method') or args.get('method') or '-'}`",
            f"- URL: `{info.get('url') or args.get('url') or '-'}`",
            f"- HTTP 状态码: `{info.get('status_code') or '-'}`",
            f"- 请求耗时: `{self._format_duration_ms(request_duration_ms)}`",
            "",
            "## 请求头",
            "",
            "```json",
            self._format_json(request_headers),
            "```",
            "",
            "## 响应头",
            "",
            "```json",
            self._format_json(response_headers),
            "```",
            "",
            "## 响应内容",
            "",
            self._render_content_block(body_text),
        ]
        if not result.ok:
            lines.extend(["", f"- 错误: {self.user_error(result)}"])
        return self.markdown_file("oauth2_request.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2RequestParams) -> ToolResult:
        """注入 OAuth2 access token 并执行 HTTP 请求。"""
        request_started_at: float | None = None
        try:
            self._validate_url(params.url)
            if params.json_body is not None and params.form_body is not None:
                return ToolResult.error("json_body and form_body cannot both be set.")
            timeout_seconds = self._normalize_timeout(params.timeout)
            headers = self._prepare_headers(params.headers or {}, params.auth)
            subject = self.resolve_subject(tool_context)
            timezone_name = self.resolve_timezone(tool_context)
            access_token = await self.token_service().resolve_access_token(params.app_name, subject, timezone_name)
            self._inject_auth_header(headers, access_token, params.auth)
            request_started_at = time.perf_counter()
            result = await self._send_request(params, headers, timeout_seconds)
            result["request_duration_ms"] = round((time.perf_counter() - request_started_at) * 1000, 2)
        except Exception as exc:
            extra_info: dict[str, Any] = {
                "method": params.method,
                "url": params.url,
                "request_headers": self._redact_headers(params.headers or {}),
                "user_error": str(exc),
            }
            if request_started_at is not None:
                extra_info["request_duration_ms"] = round((time.perf_counter() - request_started_at) * 1000, 2)
            return ToolResult.error(
                f"OAuth2 API request failed: {exc}",
                extra_info=extra_info,
            )

        body_for_model = result["body_text"]
        if len(body_for_model) > _MODEL_BODY_LIMIT:
            body_for_model = body_for_model[:_MODEL_BODY_LIMIT] + "\n... response truncated"

        ok = 200 <= result["status_code"] < 400
        content = "\n".join([
            f"OAuth2 API request completed: {result['method']} {result['url']}",
            f"HTTP status: {result['status_code']}",
            f"Request duration: {self._format_duration_ms(result.get('request_duration_ms'))}",
            "Response body:",
            body_for_model or "(empty)",
        ])
        extra_info: dict[str, Any] = {
            **result,
            "request_headers": self._redact_headers(headers),
            "response_headers": self._redact_headers(result["response_headers"]),
        }
        if not ok:
            reason = result.get("reason") or "request failed"
            extra_info["user_error"] = f"HTTP status {result['status_code']}: {reason}"
        return ToolResult(content=content, ok=ok, data=extra_info, extra_info=extra_info)

    async def _send_request(
        self,
        params: OAuth2RequestParams,
        headers: dict[str, str],
        timeout_seconds: int,
    ) -> dict:
        """执行 HTTP 请求并读取有限长度的响应体。"""
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(
                params.method,
                params.url,
                params=params.query,
                headers=headers,
                json=params.json_body,
                data=params.form_body,
            ) as response:
                body_bytes, truncated = await self._read_limited_body(response)
                body_text = self._decode_body(body_bytes)
                return {
                    "method": params.method,
                    "url": str(response.url),
                    "status_code": response.status,
                    "reason": response.reason,
                    "response_headers": dict(response.headers),
                    "body_text": body_text,
                    "body_truncated": truncated,
                }

    @staticmethod
    async def _read_limited_body(response: aiohttp.ClientResponse) -> tuple[bytes, bool]:
        """读取响应体并限制最大字节数。"""
        chunks: list[bytes] = []
        total = 0
        truncated = False
        async for chunk in response.content.iter_chunked(8192):
            if total + len(chunk) > _MAX_RESPONSE_BYTES:
                remain = max(0, _MAX_RESPONSE_BYTES - total)
                if remain:
                    chunks.append(chunk[:remain])
                truncated = True
                break
            chunks.append(chunk)
            total += len(chunk)
        return b"".join(chunks), truncated

    @staticmethod
    def _decode_body(body: bytes) -> str:
        """将响应体解码为文本。"""
        if not body:
            return ""
        return body.decode("utf-8", errors="replace")

    @staticmethod
    def _validate_url(url: str) -> None:
        """校验业务 API URL 的基本格式。"""
        parsed = urlparse((url or "").strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must be an absolute http or https URL.")

    @staticmethod
    def _normalize_timeout(timeout: int) -> int:
        """规范化 HTTP 请求超时。"""
        if timeout <= 0:
            return _DEFAULT_TIMEOUT_SECONDS
        return min(timeout, _MAX_TIMEOUT_SECONDS)

    @staticmethod
    def _prepare_headers(headers: Dict[str, str], auth: OAuth2RequestAuthParams | None) -> dict[str, str]:
        """清理用户请求头，并阻止调用方手动传入认证头。"""
        cleaned: dict[str, str] = {}
        for key, value in (headers or {}).items():
            name = str(key).strip()
            if not name:
                continue
            if name.lower() in _BLOCKED_HEADER_NAMES:
                raise ValueError(f"Do not pass OAuth2 authorization header '{name}'. This tool injects it.")
            cleaned[name] = str(value)

        auth_config = auth or OAuth2RequestAuthParams()
        auth_header_name = auth_config.header_name.strip() or "Authorization"
        cleaned_lower_names = {name.lower() for name in cleaned}
        if auth_header_name.lower() in cleaned_lower_names:
            raise ValueError(f"Do not pass OAuth2 authorization header '{auth_header_name}'. This tool injects it.")
        return cleaned

    @staticmethod
    def _inject_auth_header(
        headers: dict[str, str],
        access_token: str,
        auth: OAuth2RequestAuthParams | None,
    ) -> None:
        """向请求头注入 OAuth2 access token。"""
        auth_config = auth or OAuth2RequestAuthParams()
        if auth_config.type == "bearer":
            headers["Authorization"] = f"Bearer {access_token}"
            return
        header_name = auth_config.header_name.strip()
        if not header_name:
            raise ValueError("auth.header_name must not be empty when auth.type is header.")
        headers[header_name] = f"{auth_config.prefix or ''}{access_token}"

    @staticmethod
    def _redact_headers(headers: Dict[str, Any]) -> dict[str, str]:
        """脱敏展示请求头和响应头。"""
        redacted: dict[str, str] = {}
        sensitive_fragments = ("authorization", "token", "secret", "key")
        for key, value in (headers or {}).items():
            name = str(key)
            if any(fragment in name.lower() for fragment in sensitive_fragments):
                redacted[name] = "***REDACTED***"
            else:
                redacted[name] = str(value)
        return redacted

    @staticmethod
    def _request_label(method: Any, url: Any) -> str:
        """生成用于 before/after 文案的请求标签。"""
        method_text = str(method or "GET").upper()
        parsed = urlparse(str(url or ""))
        path = parsed.path or str(url or "")
        return f"{method_text} {path or '-'}"

    @staticmethod
    def _format_json(value: Any) -> str:
        """将对象格式化为 JSON 字符串。"""
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except (TypeError, ValueError):
            return str(value)

    @staticmethod
    def _format_duration_ms(value: Any) -> str:
        """将请求耗时格式化为毫秒文本。"""
        if value is None:
            return "-"
        try:
            return f"{float(value):.2f} ms"
        except (TypeError, ValueError):
            return str(value)

    @classmethod
    def _render_content_block(cls, content: str) -> str:
        """将响应内容渲染为 Markdown 代码块。"""
        text = (content or "").strip()
        if not text:
            return "_(empty)_"
        try:
            obj = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            obj = None
        if isinstance(obj, (dict, list)):
            return f"```json\n{json.dumps(obj, ensure_ascii=False, indent=2)}\n```"
        return f"````text\n{text}\n````"
