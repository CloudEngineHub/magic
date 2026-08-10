"""OAuth2 Code Mode 工具共享基类。"""

from __future__ import annotations

from abc import ABC
from typing import Any, Generic, Optional, TypeVar

from agentlang.context.tool_context import ToolContext
from app.core.context.agent_context import AgentContext
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.infrastructure.oauth2.app_registry import OAuth2AppRegistry
from app.infrastructure.oauth2.credential_store import OAuth2CredentialStore
from app.infrastructure.oauth2.token_service import OAuth2TokenService
from app.tools.core import BaseTool, BaseToolParams, tool

P = TypeVar("P", bound=BaseToolParams)


@tool(code_mode_only=True)
class BaseOAuth2Tool(BaseTool[P], Generic[P], ABC):
    """Shared base for OAuth2 tools available only through Code Mode."""

    @staticmethod
    def resolve_subject(tool_context: ToolContext) -> str:
        """从 AgentContext 解析当前用户 ID 作为 credential subject。"""
        try:
            agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        except Exception:
            agent_context = None
        if agent_context is not None:
            user_id = agent_context.get_user_id() if hasattr(agent_context, "get_user_id") else None
            if user_id:
                return str(user_id)
        return "user"

    @staticmethod
    def app_registry() -> OAuth2AppRegistry:
        """返回 OAuth2 app 注册表。"""
        return OAuth2AppRegistry()

    @staticmethod
    def credential_store() -> OAuth2CredentialStore:
        """返回 OAuth2 credential 存储。"""
        return OAuth2CredentialStore()

    @staticmethod
    def resolve_timezone(tool_context: ToolContext | None) -> str:
        """从 AgentContext 解析用户时区。"""
        try:
            agent_context = tool_context.get_extension_typed("agent_context", AgentContext) if tool_context else None
        except Exception:
            agent_context = None
        if agent_context is not None and hasattr(agent_context, "get_user_timezone"):
            return agent_context.get_user_timezone() or "UTC"
        return "UTC"

    @staticmethod
    def token_service() -> OAuth2TokenService:
        """返回 OAuth2 token 服务。"""
        return OAuth2TokenService()

    @staticmethod
    def markdown_file(file_name: str, lines: list[str]) -> Optional[ToolDetail]:
        """将工具自定义展示内容包装成 Markdown 详情。"""
        if not lines:
            return None
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name=file_name, content="\n".join(lines)))

    @staticmethod
    def user_error(result: Any) -> str:
        """从工具内部信息中提取用户可见错误，避免直接展示模型态 content。"""
        return (result.extra_info or {}).get("user_error") or "执行失败，请查看工具调用结果。"
