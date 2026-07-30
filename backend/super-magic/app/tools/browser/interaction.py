"""Browser ref 交互 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.service.browser import BrowserService
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.base import BrowserToolBase
from app.tools.core import BaseToolParams, tool
from magic_use import ActionKind, ActionRequest


class BrowserRefParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    ref: str = Field(..., description="Exact ref from the latest relevant snapshot.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserFillParams(BrowserRefParams):
    value: str = Field(..., description="Text to place in the referenced control.")


class BrowserPressParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    ref: str | None = Field(None, description="Optional ref to focus before pressing. Omit to use the current page focus.")
    key: str = Field(..., description="Playwright-compatible key or key chord, such as Enter or Control+Enter.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserScrollParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    ref: str | None = Field(None, description="Optional ref to scroll into view or use as scroll context.")
    delta_x: float = Field(0, description="Horizontal distance: positive scrolls right, negative scrolls left.")
    delta_y: float = Field(0, description="Vertical distance: positive scrolls down, negative scrolls up.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")

    @model_validator(mode="after")
    def validate_scroll_target(self) -> "BrowserScrollParams":
        if self.ref is None and self.delta_x == 0 and self.delta_y == 0:
            raise ValueError("Page scrolling requires a non-zero delta when ref is omitted")
        return self


class BrowserSelectParams(BrowserRefParams):
    value: str = Field(..., description="Exact option value or unique visible label to select.")


class BrowserCheckParams(BrowserRefParams):
    checked: bool = Field(True, description="Target checked state.")


class BrowserUploadFileParams(BrowserRefParams):
    file_paths: list[str] = Field(
        ...,
        min_length=1,
        description="Relative or absolute file paths inside the current workspace.",
    )


async def _dispatch_action(
    tool_context: ToolContext,
    page_id: str,
    request: ActionRequest,
    session_id: str | None,
) -> ToolResult:
    result = await BrowserService(tool_context).dispatch_action(page_id, request, session_id)
    return BrowserToolResultBuilder.action(result)


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_click", code_mode_only=True)
class BrowserClick(BrowserToolBase[BrowserRefParams]):
    """Click an element by snapshot ref."""

    name = "browser_click"
    operation_key = "browser.click"
    action_kind = ActionKind.CLICK

    async def execute(self, tool_context: ToolContext, params: BrowserRefParams) -> ToolResult:
        return await self.execute_state_change(
            tool_context,
            _dispatch_action(
                tool_context,
                params.page_id,
                ActionRequest(action=self.action_kind, ref=params.ref),
                params.session_id,
            ),
            page_id=params.page_id,
            session_id=params.session_id,
        )


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_fill", code_mode_only=True)
class BrowserFill(BrowserToolBase[BrowserFillParams]):
    """Fill an element by snapshot ref."""

    name = "browser_fill"
    operation_key = "browser.input_text"

    async def execute(self, tool_context: ToolContext, params: BrowserFillParams) -> ToolResult:
        async def operation() -> ToolResult:
            result = await BrowserService(tool_context).dispatch_action(
                params.page_id,
                ActionRequest(action=ActionKind.FILL, ref=params.ref, text=params.value),
                params.session_id,
            )
            return BrowserToolResultBuilder.action(result)

        return await self.execute_state_change(tool_context, operation(), page_id=params.page_id, session_id=params.session_id)


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_press", code_mode_only=True)
class BrowserPress(BrowserToolBase[BrowserPressParams]):
    """Press a key on the current focus or an optional snapshot ref."""

    name = "browser_press"
    operation_key = "browser.press"

    async def execute(self, tool_context: ToolContext, params: BrowserPressParams) -> ToolResult:
        async def operation() -> ToolResult:
            result = await BrowserService(tool_context).dispatch_action(
                params.page_id,
                ActionRequest(action=ActionKind.PRESS, ref=params.ref, key=params.key),
                params.session_id,
            )
            return BrowserToolResultBuilder.action(result)

        return await self.execute_state_change(tool_context, operation(), page_id=params.page_id, session_id=params.session_id)


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_hover", code_mode_only=True)
class BrowserHover(BrowserToolBase[BrowserRefParams]):
    """Hover an element by snapshot ref."""

    name = "browser_hover"
    operation_key = "browser.hover"
    action_kind = ActionKind.HOVER

    async def execute(self, tool_context: ToolContext, params: BrowserRefParams) -> ToolResult:
        return await self.execute_state_change(
            tool_context,
            _dispatch_action(
                tool_context,
                params.page_id,
                ActionRequest(action=self.action_kind, ref=params.ref),
                params.session_id,
            ),
            page_id=params.page_id,
            session_id=params.session_id,
        )


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_scroll", code_mode_only=True)
class BrowserScroll(BrowserToolBase[BrowserScrollParams]):
    """Scroll the page or a referenced region."""

    name = "browser_scroll"
    operation_key = "browser.scroll_to"

    async def execute(self, tool_context: ToolContext, params: BrowserScrollParams) -> ToolResult:
        async def operation() -> ToolResult:
            result = await BrowserService(tool_context).dispatch_action(
                params.page_id,
                ActionRequest(
                    action=ActionKind.SCROLL,
                    ref=params.ref,
                    delta_x=params.delta_x,
                    delta_y=params.delta_y,
                ),
                params.session_id,
            )
            return BrowserToolResultBuilder.action(result)

        return await self.execute_state_change(tool_context, operation(), page_id=params.page_id, session_id=params.session_id)


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_select", code_mode_only=True)
class BrowserSelect(BrowserToolBase[BrowserSelectParams]):
    """Select one option by exact value or unique visible label."""

    name = "browser_select"
    operation_key = "browser.select"

    async def execute(self, tool_context: ToolContext, params: BrowserSelectParams) -> ToolResult:
        async def operation() -> ToolResult:
            result = await BrowserService(tool_context).dispatch_action(
                params.page_id,
                ActionRequest(action=ActionKind.SELECT, ref=params.ref, value=params.value),
                params.session_id,
            )
            return BrowserToolResultBuilder.action(result)

        return await self.execute_state_change(tool_context, operation(), page_id=params.page_id, session_id=params.session_id)


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_check", code_mode_only=True)
class BrowserCheck(BrowserToolBase[BrowserCheckParams]):
    """Set the checked state of an element by snapshot ref."""

    name = "browser_check"
    operation_key = "browser.check"

    async def execute(self, tool_context: ToolContext, params: BrowserCheckParams) -> ToolResult:
        async def operation() -> ToolResult:
            result = await BrowserService(tool_context).dispatch_action(
                params.page_id,
                ActionRequest(action=ActionKind.CHECK, ref=params.ref, checked=params.checked),
                params.session_id,
            )
            return BrowserToolResultBuilder.action(result)

        return await self.execute_state_change(tool_context, operation(), page_id=params.page_id, session_id=params.session_id)


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_upload_file", code_mode_only=True)
class BrowserUploadFile(BrowserToolBase[BrowserUploadFileParams]):
    """Upload workspace files through a file input ref."""

    name = "browser_upload_file"
    operation_key = "browser.upload_file"

    async def execute(self, tool_context: ToolContext, params: BrowserUploadFileParams) -> ToolResult:
        async def operation() -> ToolResult:
            service = BrowserService(tool_context)
            file_paths = await service.resolve_upload_paths(tuple(params.file_paths))
            result = await service.dispatch_action(
                params.page_id,
                ActionRequest(action=ActionKind.UPLOAD, ref=params.ref, file_paths=file_paths),
                params.session_id,
            )
            return BrowserToolResultBuilder.action(result)

        return await self.execute_state_change(tool_context, operation(), page_id=params.page_id, session_id=params.session_id)
