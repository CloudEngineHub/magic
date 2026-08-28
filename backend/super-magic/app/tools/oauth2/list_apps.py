"""列出已注册 OAuth2 app 的 Code Mode 工具。"""

from __future__ import annotations

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.infrastructure.oauth2.credential_store import OAuth2Credential
from app.infrastructure.oauth2.time_utils import format_timestamp
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool


class OAuth2ListAppsParams(BaseToolParams):
    """Parameters for listing OAuth2 apps."""


@tool(name="oauth2_list_apps")
class OAuth2ListApps(BaseOAuth2Tool[OAuth2ListAppsParams]):
    """List registered OAuth2 apps and the current user's authorization status."""

    name = "oauth2_list_apps"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回列出 OAuth2 app 前的展示文案。"""
        return {
            "action": i18n.translate("oauth2_list_apps", category="tool.actions"),
            "remark": i18n.translate("oauth2.list_apps.listing", category="tool.messages"),
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
        """返回列出 OAuth2 app 后的展示文案。"""
        message_key = "oauth2.list_apps.listed" if result.ok else "oauth2.list_apps.failed"
        return {
            "action": i18n.translate("oauth2_list_apps", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages"),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回列出 OAuth2 app 的工具详情。"""
        if not result.ok:
            return self.markdown_file(
                "oauth2_apps.md",
                [
                    "# OAuth2 应用列表",
                    "",
                    "- 状态: 查看失败",
                    f"- 错误: {self.user_error(result)}",
                ],
        )
        apps = (result.extra_info or {}).get("apps") or []
        timezone_name = (result.extra_info or {}).get("timezone", "")
        lines = [
            "# OAuth2 应用列表",
            "",
            f"- 时区: `{timezone_name or '-'}`",
            f"- 应用数量: {len(apps)}",
            "",
        ]
        if not apps:
            lines.append("当前没有已注册的 OAuth2 应用。")
            return self.markdown_file("oauth2_apps.md", lines)

        lines.extend([
            "| 应用 | app_name | 授权状态 | 应用添加时间 | 授权时间 | access token 过期时间 | scope |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ])
        for app in apps:
            lines.append(
                "| {label} | `{app_name}` | {status} | {app_created_at} | {authorized_at} | {expires_at} | `{scope}` |".format(
                    label=app.get("label_name") or app.get("app_name", ""),
                    app_name=app.get("app_name", ""),
                    status=self._status_label(app.get("status", "")),
                    app_created_at=app.get("app_created_at") or app.get("created_at") or "-",
                    authorized_at=app.get("authorized_at") or "-",
                    expires_at=app.get("expires_at") or "-",
                    scope=app.get("scope") or "-",
                )
            )
        return self.markdown_file("oauth2_apps.md", lines)

    @staticmethod
    def _status_label(status: str) -> str:
        """将内部授权状态转换成用户可读文案。"""
        labels = {
            "authorized": "已授权",
            "not_authorized": "未授权",
            "expired": "已过期",
        }
        return labels.get(status, status or "-")

    @staticmethod
    def _credential_public_fields(credential: OAuth2Credential | None, timezone_name: str) -> dict:
        """返回可暴露给模型和用户的脱敏 credential 状态。"""
        if credential is None:
            return {
                "status": "not_authorized",
                "has_refresh_token": False,
                "authorized_at": "",
                "expires_at": "",
                "expires_at_timestamp": 0,
                "timezone": timezone_name,
            }
        status = "authorized" if credential.is_valid() else "expired"
        return {
            "status": status,
            "has_refresh_token": bool(credential.refresh_token),
            "authorized_at": credential.created_at or credential.updated_at,
            "expires_at": format_timestamp(credential.expires_at, timezone_name),
            "expires_at_timestamp": credential.expires_at,
            "timezone": timezone_name,
        }

    async def execute(self, tool_context: ToolContext, params: OAuth2ListAppsParams) -> ToolResult:
        """列出 app 注册信息和脱敏 credential 状态。"""
        subject = self.resolve_subject(tool_context)
        timezone_name = self.resolve_timezone(tool_context)
        apps = await self.app_registry().list_apps()
        if not apps:
            data = {"apps": [], "timezone": timezone_name}
            return ToolResult(
                content=(
                    "No OAuth2 app is registered. Ask the user for an OAuth2 app's client_id, "
                    "client_secret, authorization_url, token_url, and scope, then call oauth2_upsert_app."
                ),
                data=data,
                extra_info=data,
            )

        credential_store = self.credential_store()
        rows = []
        data_apps = []
        for app in apps:
            credential = await credential_store.get(app.app_name, subject)
            credential_public = self._credential_public_fields(credential, timezone_name)
            status = credential_public["status"]
            expires_at = credential_public["expires_at"] or "-"
            rows.append(
                f"- {app.label_name} (app_name={app.app_name}, status={status}, "
                f"app_created_at={app.created_at or '-'}, authorized_at={credential_public.get('authorized_at') or '-'}, "
                f"expires_at={expires_at})"
            )
            public = app.to_public_dict()
            public["app_created_at"] = app.created_at
            public.update(credential_public)
            data_apps.append(public)

        return ToolResult(
            content="Registered OAuth2 app(s):\n" + "\n".join(rows),
            data={"apps": data_apps, "timezone": timezone_name},
            extra_info={"apps": data_apps, "timezone": timezone_name},
        )
