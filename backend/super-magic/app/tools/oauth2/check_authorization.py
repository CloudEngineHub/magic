"""检查 OAuth2 授权完成状态的 Code Mode 工具。"""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool


class OAuth2CheckAuthorizationParams(BaseToolParams):
    """Parameters for checking OAuth2 authorization."""

    app_name: str = Field(..., description="Registered OAuth2 app name to check.")
    state: Optional[str] = Field(
        None,
        description="Raw OAuth2 state for debugging. Omit to use the latest pending session.",
    )


@tool(name="oauth2_check_authorization")
class OAuth2CheckAuthorization(BaseOAuth2Tool[OAuth2CheckAuthorizationParams]):
    """Check OAuth2 authorization and store tokens when it completes."""

    name = "oauth2_check_authorization"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回检查 OAuth2 授权前的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        return {
            "action": i18n.translate("oauth2_check_authorization", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.check_authorization.checking", category="tool.messages", app_name=app_name
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
        """返回检查 OAuth2 授权后的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        status = (result.extra_info or {}).get("status", "")
        message_key = self._message_key_for_status(status) if result.ok else "oauth2.check_authorization.failed"
        return {
            "action": i18n.translate("oauth2_check_authorization", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", app_name=app_name),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回检查 OAuth2 授权的工具详情。"""
        args = arguments or {}
        info = result.extra_info or {}
        app_name = info.get("app_name") or args.get("app_name", "")
        status = info.get("status") or ("failed" if not result.ok else "")
        lines = [
            "# OAuth2 授权状态",
            "",
            f"- 状态: {self._status_label(status)}",
            f"- app_name: `{app_name}`",
        ]
        if result.ok:
            lines.extend(["", self._user_next_step(status)])
        else:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_authorization_status.md", lines)

    @staticmethod
    def _message_key_for_status(status: str) -> str:
        """根据授权状态选择用户可见的 remark 文案。"""
        keys = {
            "authorized": "oauth2.check_authorization.authorized",
            "authorization_pending": "oauth2.check_authorization.pending",
            "authorization_expired": "oauth2.check_authorization.expired",
            "not_authorized": "oauth2.check_authorization.not_authorized",
            "denied": "oauth2.check_authorization.denied",
            "failed": "oauth2.check_authorization.failed",
            "expired": "oauth2.check_authorization.expired",
        }
        return keys.get(status, "oauth2.check_authorization.checked")

    @staticmethod
    def _status_label(status: str) -> str:
        """将内部授权状态转换成用户可读文案。"""
        labels = {
            "authorized": "授权已完成",
            "authorization_pending": "等待用户授权",
            "authorization_expired": "授权会话已过期",
            "not_authorized": "未授权",
            "denied": "用户拒绝授权",
            "failed": "授权失败",
            "expired": "授权已过期",
        }
        return labels.get(status, status or "-")

    @staticmethod
    def _user_next_step(status: str) -> str:
        """根据授权状态返回用户可读的下一步说明。"""
        if status == "authorized":
            return "授权已完成，后续接口调用可以通过 OAuth2 SDK 获取 access token。"
        if status == "authorization_pending":
            return "还没有收到授权结果，请先在授权页面完成授权。"
        if status == "authorization_expired":
            return "授权链接已过期，需要重新发起授权。"
        if status == "not_authorized":
            return "当前没有可用授权凭证，也没有等待中的授权会话，需要发起授权。"
        if status == "denied":
            return "用户拒绝了授权，需要确认权限后重新发起授权。"
        return "授权没有完成，需要根据错误信息重新处理。"

    async def execute(self, tool_context: ToolContext, params: OAuth2CheckAuthorizationParams) -> ToolResult:
        """检查授权完成状态，并在可能时完成 token exchange。"""
        subject = self.resolve_subject(tool_context)
        timezone_name = self.resolve_timezone(tool_context)
        try:
            result = await self.token_service().check_authorization(
                params.app_name,
                subject,
                state=params.state,
                timezone_name=timezone_name,
            )
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 authorization check failed: {exc}",
                extra_info={
                    "app_name": params.app_name,
                    "status": "failed",
                    "user_error": str(exc),
                },
            )

        data = {
            "status": result.status,
            "app_name": result.app_name,
            "message": result.message,
        }
        next_steps = {
            "authorized": "You can now call sdk.oauth2.get_access_token for this app before making API requests.",
            "authorization_pending": (
                "Ask the user to finish authorization, then call oauth2_check_authorization again."
            ),
            "authorization_expired": "Call oauth2_start_authorization again to create a fresh authorization URL.",
            "not_authorized": "Call oauth2_start_authorization to create an authorization URL.",
            "denied": "Ask the user whether to retry authorization with the required permissions.",
            "expired": "Call oauth2_start_authorization again because the saved credential cannot be refreshed.",
        }
        return ToolResult(
            content=(
                f"OAuth2 authorization status for '{result.app_name}': {result.status}. "
                f"{next_steps.get(result.status, result.message)}"
            ),
            data=data,
            extra_info=data,
        )
