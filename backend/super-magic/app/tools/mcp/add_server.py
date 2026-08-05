"""mcp_add_server 工具"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.mcp.config.models import MCPConfigSource, MCPServerConfig
from app.tools.core import BaseToolParams, tool
from app.tools.mcp._base import BaseMcpTool

logger = get_logger(__name__)


class McpAddServerParams(BaseToolParams):
    name: str = Field(
        ...,
        description="MCP server name. Replaces an existing server with the same name.",
    )
    server_type: Literal["stdio", "http"] = Field(
        ...,
        description="Connection type: 'stdio' or 'http'.",
    )
    command: Optional[str] = Field(
        None,
        description="Launch command. Required for stdio servers.",
    )
    args: Optional[List[str]] = Field(
        None,
        description="Command arguments for a stdio server.",
    )
    url: Optional[str] = Field(
        None,
        description="Server URL. Required for HTTP servers.",
    )
    env: Optional[Dict[str, str]] = Field(
        None,
        description="Environment variables for the stdio subprocess.",
    )
    headers: Optional[Dict[str, str]] = Field(
        None,
        description="HTTP headers. Values may reference env-manager secrets as ${VAR_NAME}.",
    )
    label_name: Optional[str] = Field(
        None,
        description="Optional user-facing server label.",
    )


@tool(name="mcp_add_server")
class McpAddServer(BaseMcpTool[McpAddServerParams]):
    """Add or update a chat-scoped MCP server configuration and connect it."""

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        args = arguments or {}
        name = args.get("name", "")
        return {
            "action": i18n.translate("add_server", category="tool.actions"),
            "remark": i18n.translate("mcp.add_server.adding", category="tool.messages", name=name),
            "tool_name": tool_name,
        }

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        args = arguments or {}
        name = args.get("name", "")
        return i18n.translate("mcp.add_server.added", category="tool.messages", name=name)

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.content:
            return None
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="mcp_add_server.md", content=result.content),
        )

    async def execute(
        self, tool_context: ToolContext, params: McpAddServerParams
    ) -> ToolResult:
        server_type = params.server_type.lower()

        if server_type == "stdio" and not params.command:
            return ToolResult.error(
                "stdio server requires 'command'.",
            )
        if server_type == "http" and not params.url:
            return ToolResult.error(
                "http server requires 'url'.",
            )

        config_kwargs: dict = {
            "name": params.name,
            "type": server_type,
            "source": MCPConfigSource.CLIENT_CONFIG.value,
        }
        if params.command:
            config_kwargs["command"] = params.command
        if params.args:
            config_kwargs["args"] = params.args
        if params.url:
            config_kwargs["url"] = params.url
        if params.env:
            config_kwargs["env"] = params.env
        if params.headers:
            config_kwargs["headers"] = params.headers
        if params.label_name:
            config_kwargs["server_options"] = {"label_name": params.label_name}

        try:
            config = MCPServerConfig(**config_kwargs)
        except Exception as e:
            logger.warning(f"Invalid MCP server config: {params.name} - {e}")
            return ToolResult.error(f"Invalid MCP server config: {e!s}")

        store = self._get_store()
        await store.upsert_many([config], source=MCPConfigSource.CLIENT_CONFIG)

        manager = self._get_manager()
        result = await manager.add_server(config)

        logger.info(f"Persisted MCP server config: {params.name} (type={server_type})")

        if result and result.status == "success":
            manager = self._get_manager()
            tool_infos = manager.get_server_tools(params.name)
            lines = [
                f"MCP server '{params.name}' has been registered and connected "
                f"(type={server_type}). {len(tool_infos)} tool(s) discovered:"
            ]
            for info in tool_infos:
                desc = info.description
                prefix = f"MCP server [{info.server_name}] - "
                if desc.startswith(prefix):
                    desc = desc[len(prefix):]
                lines.append(f"- {info.original_name}: {desc}")
            return ToolResult(content="\n".join(lines))

        error_msg = result.error if result else "Connection failed"
        return ToolResult(
            content=(
                f"MCP server '{params.name}' has been registered "
                f"(type={server_type}), but connection failed: {error_msg}. "
                f"You can retry with mcp_connect_server."
            ),
        )
