"""Browser session 与页面管理 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.service.browser import BrowserService
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.base import BrowserToolBase
from app.tools.browser.presentation.session import (
    activate_page_detail,
    close_page_detail,
    list_pages_detail,
    list_sessions_detail,
    open_page_detail,
)
from app.tools.core import BaseToolParams, tool


class BrowserListSessionsParams(BaseToolParams):
    pass


class BrowserListPagesParams(BaseToolParams):
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserOpenPageParams(BaseToolParams):
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")
    url: str = Field("about:blank", description="Initial URL. Defaults to a blank page.")


class BrowserPageParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_list_sessions", code_mode_only=True)
class BrowserListSessions(BrowserToolBase[BrowserListSessionsParams]):
    """List Browser sessions available to the current Agent context."""

    name = "browser_list_sessions"
    operation_key = "browser.list_sessions"

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None) -> ToolDetail:
        return self.create_browser_tool_detail(result, list_sessions_detail(result))

    async def execute(self, tool_context: ToolContext, params: BrowserListSessionsParams) -> ToolResult:
        async def operation() -> ToolResult:
            sessions = await BrowserService(tool_context).list_sessions()
            return BrowserToolResultBuilder.sessions(sessions)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_list_pages", code_mode_only=True)
class BrowserListPages(BrowserToolBase[BrowserListPagesParams]):
    """List open pages in a Browser session."""

    name = "browser_list_pages"
    operation_key = "browser.list_pages"

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None) -> ToolDetail:
        return self.create_browser_tool_detail(result, list_pages_detail(result))

    async def execute(self, tool_context: ToolContext, params: BrowserListPagesParams) -> ToolResult:
        async def operation() -> ToolResult:
            service = BrowserService(tool_context)
            session = await service.get_session(params.session_id)
            pages = await service.list_pages(params.session_id)
            return BrowserToolResultBuilder.pages(pages, session.id)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_open_page", code_mode_only=True)
class BrowserOpenPage(BrowserToolBase[BrowserOpenPageParams]):
    """Open a page in a Browser session."""

    name = "browser_open_page"
    operation_key = "browser.goto"

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None) -> ToolDetail:
        return self.create_browser_tool_detail(result, open_page_detail(result))

    async def execute(self, tool_context: ToolContext, params: BrowserOpenPageParams) -> ToolResult:
        async def operation() -> ToolResult:
            page = await BrowserService(tool_context).open_page(params.url, params.session_id)
            return BrowserToolResultBuilder.page(page, "Browser page opened.")

        return await self.execute_state_change(
            tool_context,
            operation(),
            page_id=None,
            session_id=params.session_id,
        )


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_close_page", code_mode_only=True)
class BrowserClosePage(BrowserToolBase[BrowserPageParams]):
    """Close one Browser page."""

    name = "browser_close_page"
    operation_key = "browser.close_page"

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None) -> ToolDetail:
        return self.create_browser_tool_detail(result, close_page_detail(result, arguments or {}))

    async def execute(self, tool_context: ToolContext, params: BrowserPageParams) -> ToolResult:
        async def operation() -> ToolResult:
            await BrowserService(tool_context).close_page(params.page_id, params.session_id)
            return ToolResult(
                content=f"Browser page closed: {params.page_id}",
                data={"page_id": params.page_id},
            )

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_activate_page", code_mode_only=True)
class BrowserActivatePage(BrowserToolBase[BrowserPageParams]):
    """Activate one Browser page without navigating it."""

    name = "browser_activate_page"
    operation_key = "browser.activate_page"

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None) -> ToolDetail:
        return self.create_browser_tool_detail(result, activate_page_detail(result))

    async def execute(self, tool_context: ToolContext, params: BrowserPageParams) -> ToolResult:
        async def operation() -> ToolResult:
            page = await BrowserService(tool_context).activate_page(params.page_id, params.session_id)
            return BrowserToolResultBuilder.page(page, "Browser page activated.")

        return await self.execute_state_change(
            tool_context,
            operation(),
            page_id=params.page_id,
            session_id=params.session_id,
        )
