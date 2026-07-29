"""Browser 页面观察与视觉分析 Code Mode 工具。"""

from __future__ import annotations

import asyncio
from enum import StrEnum
from typing import Generic, TypeVar

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.service.browser import BrowserArtifactService, BrowserService
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.base import BrowserToolBase
from app.tools.core import BaseToolParams, tool
from magic_use import SnapshotOptions, SnapshotScope
from magic_use.errors import BrowserSDKError

P = TypeVar("P", bound=BaseToolParams)

logger = get_logger(__name__)


class BrowserReadScope(StrEnum):
    VIEWPORT = "viewport"
    FULL = "full"


class BrowserReadPageParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    scope: BrowserReadScope = Field(BrowserReadScope.VIEWPORT, description="Read the viewport or full rendered page.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserSnapshotParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    scope: SnapshotScope = Field(SnapshotScope.INTERACTIVE, description="Structured snapshot scope.")
    ref: str | None = Field(None, description="Root ref required for a subtree snapshot.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserScreenshotParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    labels: bool = Field(False, description="Overlay labels mapped to current snapshot refs.")
    full_page: bool = Field(False, description="Capture the full scrollable page instead of the viewport.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserVisualQueryParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    query: str = Field(..., min_length=1, description="Precise question about the rendered page image.")
    full_page: bool = Field(False, description="Analyze the full scrollable page instead of the viewport.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class BrowserFindVisualParams(BaseToolParams):
    page_id: str = Field(..., description="Opaque page ID returned by a Browser tool.")
    target: str = Field(..., min_length=1, description="Visual target to identify among labeled elements.")
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")


class _BrowserVisualToolBase(BrowserToolBase[P], Generic[P]):
    async def _execute_visual_query(
        self,
        tool_context: ToolContext,
        *,
        page_id: str,
        query: str,
        labels: bool,
        full_page: bool,
        session_id: str | None,
    ) -> ToolResult:
        async def operation() -> ToolResult:
            service = BrowserService(tool_context)
            page, screenshot = await service.screenshot(
                page_id,
                full_page=full_page,
                labels=labels,
                session_id=session_id,
            )
            artifact = await BrowserArtifactService(tool_context).publish(screenshot.image)
            try:
                analysis = await service.analyze_screenshot(screenshot.image, query)
            except asyncio.CancelledError:
                raise
            except BrowserSDKError as exc:
                error_result = BrowserToolResultBuilder.error(
                    exc,
                    user_error=self._error_message(exc.code),
                )
                return BrowserToolResultBuilder.attach_screenshot(
                    error_result,
                    page,
                    screenshot,
                    artifact,
                )
            except Exception as exc:
                logger.exception("Browser visual analysis failed")
                error_result = ToolResult.error(
                    f"Browser visual analysis failed because of an unexpected error: {exc}",
                    data={"error_code": "unexpected_error"},
                    extra_info={
                        "error_code": "unexpected_error",
                        "user_error": self._message("browser.error.unexpected"),
                    },
                )
                return BrowserToolResultBuilder.attach_screenshot(
                    error_result,
                    page,
                    screenshot,
                    artifact,
                )
            return BrowserToolResultBuilder.visual(page, screenshot, artifact, analysis)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_read_page", code_mode_only=True)
class BrowserReadPage(BrowserToolBase[BrowserReadPageParams]):
    """Read rendered page content through Lens."""

    name = "browser_read_page"
    operation_key = "browser.read_as_markdown"

    async def execute(self, tool_context: ToolContext, params: BrowserReadPageParams) -> ToolResult:
        async def operation() -> ToolResult:
            page, markdown = await BrowserService(tool_context).read_page(
                params.page_id,
                params.scope.value,
                params.session_id,
            )
            return BrowserToolResultBuilder.markdown(page, params.scope.value, markdown)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_snapshot", code_mode_only=True)
class BrowserSnapshot(BrowserToolBase[BrowserSnapshotParams]):
    """Capture a structured page snapshot and element refs."""

    name = "browser_snapshot"
    operation_key = "browser.get_interactive_elements"

    async def execute(self, tool_context: ToolContext, params: BrowserSnapshotParams) -> ToolResult:
        async def operation() -> ToolResult:
            snapshot = await BrowserService(tool_context).snapshot(
                params.page_id,
                SnapshotOptions(
                    scope=params.scope,
                    root_ref=params.ref,
                ),
                params.session_id,
            )
            return BrowserToolResultBuilder.snapshot(snapshot)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_screenshot", code_mode_only=True)
class BrowserScreenshot(BrowserToolBase[BrowserScreenshotParams]):
    """Capture and display a Browser screenshot without analyzing it."""

    name = "browser_screenshot"
    operation_key = "browser.screenshot"

    async def execute(self, tool_context: ToolContext, params: BrowserScreenshotParams) -> ToolResult:
        async def operation() -> ToolResult:
            page, screenshot = await BrowserService(tool_context).screenshot(
                params.page_id,
                full_page=params.full_page,
                labels=params.labels,
                session_id=params.session_id,
            )
            artifact = await BrowserArtifactService(tool_context).publish(screenshot.image)
            return BrowserToolResultBuilder.screenshot(page, screenshot, artifact)

        return await self.execute_safely(operation())


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_visual_query", code_mode_only=True)
class BrowserVisualQuery(_BrowserVisualToolBase[BrowserVisualQueryParams]):
    """Answer a visual question about the rendered Browser page."""

    name = "browser_visual_query"
    operation_key = "browser.visual_query"

    async def execute(self, tool_context: ToolContext, params: BrowserVisualQueryParams) -> ToolResult:
        return await self._execute_visual_query(
            tool_context,
            page_id=params.page_id,
            query=params.query,
            labels=False,
            full_page=params.full_page,
            session_id=params.session_id,
        )


# Agent-facing usage is documented in agents/skills/browser/.
@tool(name="browser_find_visual", code_mode_only=True)
class BrowserFindVisual(_BrowserVisualToolBase[BrowserFindVisualParams]):
    """Identify a visual target in a labeled screenshot."""

    name = "browser_find_visual"
    operation_key = "browser.find_interactive_element_visually"

    async def execute(self, tool_context: ToolContext, params: BrowserFindVisualParams) -> ToolResult:
        query = (
            "Inspect this labeled browser screenshot and identify the target described below. "
            "Return the best matching visible label and briefly explain the visual evidence. "
            "Do not invent labels or element refs.\n\n"
            f"Target: {params.target}"
        )
        return await self._execute_visual_query(
            tool_context,
            page_id=params.page_id,
            query=query,
            labels=True,
            full_page=False,
            session_id=params.session_id,
        )
