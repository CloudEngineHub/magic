"""Browser 导航与等待 Code Mode 工具。"""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.service.browser import BrowserService
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.base import BrowserToolBase
from app.tools.core import BaseToolParams, tool
from magic_use import WaitConditionKind, WaitRequest


class NavigationWaitUntil(StrEnum):
    COMMIT = "commit"
    DOMCONTENTLOADED = "domcontentloaded"
    LOAD = "load"
    NETWORKIDLE = "networkidle"


class BrowserNavigateParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    url: str = Field(..., description="Destination URL.")
    wait_until: NavigationWaitUntil = Field(
        NavigationWaitUntil.DOMCONTENTLOADED,
        description="Navigation readiness state.",
    )
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserWaitParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    condition: WaitConditionKind = Field(
        ...,
        description="Wait condition: time, url, load_state, text, ref, or download.",
    )
    timeout_ms: float = Field(30_000, gt=0, description="Maximum wait time in milliseconds.")
    value: str | None = Field(None, description="Required URL pattern, text, or ref for url, text, or ref waits.")
    duration_ms: float | None = Field(None, gt=0, description="Duration in milliseconds for a time wait.")
    state: str | None = Field(None, description="Required load state, or optional text/ref state.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserKeepAliveParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    seconds: float = Field(..., gt=0, description="Requested idle lease duration in seconds.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_navigate", code_mode_only=True)
class BrowserNavigate(BrowserToolBase[BrowserNavigateParams]):
    """Navigate one Browser page to a URL."""

    name = "browser_navigate"
    operation_key = "browser.goto"

    async def execute(self, tool_context: ToolContext, params: BrowserNavigateParams) -> ToolResult:
        async def operation() -> ToolResult:
            page = await BrowserService(tool_context).navigate(
                params.page_id,
                params.url,
                params.wait_until.value,
                params.session_id,
            )
            return BrowserToolResultBuilder.page(page, "Browser navigation completed.")

        return await self.execute_state_change(
            tool_context,
            operation(),
            page_id=params.page_id,
            session_id=params.session_id,
        )


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_wait", code_mode_only=True)
class BrowserWait(BrowserToolBase[BrowserWaitParams]):
    """Wait for one explicit Browser condition."""

    name = "browser_wait"
    operation_key = "browser.wait"

    async def execute(self, tool_context: ToolContext, params: BrowserWaitParams) -> ToolResult:
        async def operation() -> ToolResult:
            request = WaitRequest(
                condition=params.condition,
                timeout_ms=params.timeout_ms,
                value=params.value,
                duration_ms=params.duration_ms,
                state=params.state,
            )
            page = await BrowserService(tool_context).wait(
                params.page_id,
                request,
                params.session_id,
            )
            result = BrowserToolResultBuilder.page(
                page,
                f"Browser wait completed: {params.condition.value}",
            )
            result.data["condition"] = params.condition.value
            return result

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_keep_alive", code_mode_only=True)
class BrowserKeepAlive(BrowserToolBase[BrowserKeepAliveParams]):
    """Extend the idle lease of one Browser page for a long-running task."""

    name = "browser_keep_alive"
    operation_key = "browser.keep_alive"

    async def execute(self, tool_context: ToolContext, params: BrowserKeepAliveParams) -> ToolResult:
        async def operation() -> ToolResult:
            page = await BrowserService(tool_context).keep_page_alive(
                params.page_id,
                params.seconds,
                params.session_id,
            )
            return BrowserToolResultBuilder.page(page, "Browser page lease extended.")

        return await self.execute_safely(operation())
