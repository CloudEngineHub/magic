"""Browser JavaScript 与诊断 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field, JsonValue

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.service.browser import BrowserService
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.base import BrowserToolBase
from app.tools.core import BaseToolParams, tool


class BrowserEvaluateParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    expression: str = Field(..., min_length=1, description="Focused JavaScript expression or function executed in the page.")
    argument: JsonValue = Field(None, description="Optional JSON-serializable argument passed to the expression.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserDiagnosticParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    clear: bool = Field(True, description="Clear returned entries from the session buffer.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_evaluate", code_mode_only=True)
class BrowserEvaluate(BrowserToolBase[BrowserEvaluateParams]):
    """Evaluate focused JavaScript in one Browser page."""

    name = "browser_evaluate"
    operation_key = "browser.evaluate"

    async def execute(self, tool_context: ToolContext, params: BrowserEvaluateParams) -> ToolResult:
        async def operation() -> ToolResult:
            value = await BrowserService(tool_context).evaluate(
                params.page_id,
                params.expression,
                params.argument,
                params.session_id,
            )
            return BrowserToolResultBuilder.value(value, "Browser JavaScript evaluation completed.")

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_read_console", code_mode_only=True)
class BrowserReadConsole(BrowserToolBase[BrowserDiagnosticParams]):
    """Read buffered console entries for one Browser page."""

    name = "browser_read_console"
    operation_key = "browser.read_console"

    async def execute(self, tool_context: ToolContext, params: BrowserDiagnosticParams) -> ToolResult:
        async def operation() -> ToolResult:
            entries = await BrowserService(tool_context).read_console(
                params.page_id,
                clear=params.clear,
                session_id=params.session_id,
            )
            return BrowserToolResultBuilder.console(entries, params.page_id)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_read_network", code_mode_only=True)
class BrowserReadNetwork(BrowserToolBase[BrowserDiagnosticParams]):
    """Read buffered network entries for one Browser page."""

    name = "browser_read_network"
    operation_key = "browser.read_network"

    async def execute(self, tool_context: ToolContext, params: BrowserDiagnosticParams) -> ToolResult:
        async def operation() -> ToolResult:
            entries = await BrowserService(tool_context).read_network(
                params.page_id,
                clear=params.clear,
                session_id=params.session_id,
            )
            return BrowserToolResultBuilder.network(entries, params.page_id)

        return await self.execute_safely(operation())
