"""mcp_remove_server 工具"""

from typing import Any, Dict, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.mcp._base import BaseMcpTool

logger = get_logger(__name__)


class McpRemoveServerParams(BaseToolParams):
    server_name: str = Field(
        ...,
        description="MCP server name returned by mcp_list_servers.",
    )


@tool(name="mcp_remove_server")
class McpRemoveServer(BaseMcpTool[McpRemoveServerParams]):
    """Disconnect an MCP server and delete its tools and persisted configuration."""

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        args = arguments or {}
        server_name = args.get("server_name", "")
        return {
            "action": i18n.translate("remove_server", category="tool.actions"),
            "remark": i18n.translate(
                "mcp.remove_server.removing", category="tool.messages", server_name=server_name
            ),
            "tool_name": tool_name,
        }

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        args = arguments or {}
        server_name = args.get("server_name", "")
        return i18n.translate(
            "mcp.remove_server.removed", category="tool.messages", server_name=server_name
        )
    
    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.content:
            return None
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="mcp_remove_server.md", content=result.content),
        )
    
    async def execute(
        self, tool_context: ToolContext, params: McpRemoveServerParams
    ) -> ToolResult:
        server_name = params.server_name.strip()
        if not server_name:
            return ToolResult.error("server_name must not be empty.")

        # 1. 从运行时 manager 中移除（断开连接 + 清理工具注册）
        manager = self._get_manager_or_none()
        runtime_removed = False
        if manager:
            runtime_removed = await manager.remove_server(server_name, remove_config=True)

        # 2. 从持久化 store 中移除配置
        store = self._get_store()
        store_removed = await store.remove(server_name)

        if not runtime_removed and not store_removed:
            return ToolResult.error(
                f"MCP server '{server_name}' not found (neither connected nor in config)."
            )

        logger.info(
            f"Removed MCP server '{server_name}' "
            f"(runtime={runtime_removed}, store={store_removed})"
        )

        return ToolResult(
            content=(
                f"MCP server '{server_name}' has been removed. "
                f"Its connection is closed and configuration is deleted."
            ),
        )
