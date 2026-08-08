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


class BrowserAddInitScriptParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    source: str = Field(
        ...,
        min_length=1,
        description="""<!--zh: 在每个新文档创建时、任何站点脚本运行前执行的 JavaScript。对当前已加载的文档无效。-->
JavaScript that runs on every new document before any page script. Has no effect on the currently loaded document.""",
    )
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserDiagnosticParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    clear: bool = Field(True, description="Clear this page's current diagnostic buffer after reading.")
    limit: int = Field(100, ge=1, le=500, description="Maximum number of newest entries to return.")
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
@tool(name="browser_add_init_script", code_mode_only=True)
class BrowserAddInitScript(BrowserToolBase[BrowserAddInitScriptParams]):
    """Register JavaScript that runs before page scripts on future navigations."""

    name = "browser_add_init_script"
    operation_key = "browser.add_init_script"

    async def execute(self, tool_context: ToolContext, params: BrowserAddInitScriptParams) -> ToolResult:
        async def operation() -> ToolResult:
            await BrowserService(tool_context).add_init_script(params.page_id, params.source, params.session_id)
            return ToolResult(
                content=(
                    "Init script registered. It will run before any page script on the next navigation "
                    "of this page, and on every navigation after that. It did not run on the current document; "
                    "navigate or reload to apply it."
                ),
                data={"page_id": params.page_id},
            )

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_read_console", code_mode_only=True)
class BrowserReadConsole(BrowserToolBase[BrowserDiagnosticParams]):
    """Read buffered console entries for one Browser page."""

    name = "browser_read_console"
    operation_key = "browser.read_console"

    async def execute(self, tool_context: ToolContext, params: BrowserDiagnosticParams) -> ToolResult:
        async def operation() -> ToolResult:
            batch = await BrowserService(tool_context).read_console(
                params.page_id,
                clear=params.clear,
                limit=params.limit,
                session_id=params.session_id,
            )
            return BrowserToolResultBuilder.console(batch, params.page_id)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_read_network", code_mode_only=True)
class BrowserReadNetwork(BrowserToolBase[BrowserDiagnosticParams]):
    """Read buffered network entries for one Browser page."""

    name = "browser_read_network"
    operation_key = "browser.read_network"

    async def execute(self, tool_context: ToolContext, params: BrowserDiagnosticParams) -> ToolResult:
        async def operation() -> ToolResult:
            batch = await BrowserService(tool_context).read_network(
                params.page_id,
                clear=params.clear,
                limit=params.limit,
                session_id=params.session_id,
            )
            return BrowserToolResultBuilder.network(batch, params.page_id)

        return await self.execute_safely(operation())
