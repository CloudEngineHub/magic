"""Browser 页面观察与视觉分析 Code Mode 工具。"""

from __future__ import annotations

import asyncio
import json
import re
from enum import StrEnum
from pathlib import Path
from typing import Generic, TypeVar

from pydantic import Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.event.event import EventType
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.context.agent_context import AgentContext
from app.service.browser import BrowserArtifactService, BrowserService
from app.service.browser.browser_file_adapter import BrowserFileAdapter
from app.service.browser.browser_tool_result_builder import BrowserToolResultBuilder
from app.tools.browser.base import BrowserToolBase
from app.tools.core import BaseToolParams, tool
from app.tools.snippet_timeout_registry import SdkSnippetTimeoutRegistry
from app.utils.async_file_utils import async_exists
from magic_use import SnapshotOptions, SnapshotScope
from magic_use.errors import BrowserSDKError

P = TypeVar("P", bound=BaseToolParams)

logger = get_logger(__name__)

# 视觉工具包含截图处理、对象存储发布和模型推理。为包含视觉调用的 Code Mode
# 脚本预留完整执行时间，避免前序 Browser 操作占用默认 60 秒后取消仍在运行的视觉请求。
SdkSnippetTimeoutRegistry.register(
    ["browser_visual_query", "browser_find_visual"],
    min_timeout=120,
)


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
    output_path: str | None = Field(
        None,
        description="Optional workspace path ending in .webp, .jpg, .jpeg, or .png. Omit for a temporary UI snapshot.",
    )
    scale: float | None = Field(
        None,
        ge=0.5,
        le=3.0,
        description="Optional saved-resolution multiplier. Omit to use the same adaptive resolution as the Tool Detail snapshot.",
    )
    quality: int | None = Field(
        None,
        ge=1,
        le=100,
        description="Optional WebP or JPEG quality from 1 to 100. Omit to use the Tool Detail snapshot quality. Invalid for PNG.",
    )
    session_id: str | None = Field(None, description="Browser session ID. Omit to use the default session.")

    @model_validator(mode="after")
    def validate_output_options(self) -> "BrowserScreenshotParams":
        if self.quality is not None and self.output_path is None:
            raise ValueError("quality requires output_path because temporary snapshots use managed settings")
        if self.scale is not None and self.output_path is None:
            raise ValueError("scale requires output_path because temporary snapshots use managed settings")
        if self.quality is not None and Path(self.output_path or "").suffix.lower() == ".png":
            raise ValueError("quality is only valid for WebP or JPEG screenshot output")
        return self


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
            artifact_task = asyncio.create_task(
                BrowserArtifactService(tool_context).publish(screenshot.image)
            )
            analysis_task = asyncio.create_task(
                service.analyze_screenshot(screenshot.image, query)
            )
            try:
                # 截图发布和视觉推理彼此独立，并行执行可避免对象存储时延串行叠加到模型时延上。
                artifact = await artifact_task
                analysis = await analysis_task
            except asyncio.CancelledError:
                artifact_task.cancel()
                analysis_task.cancel()
                await asyncio.gather(artifact_task, analysis_task, return_exceptions=True)
                raise
            except BrowserSDKError as exc:
                if not artifact_task.done():
                    artifact_task.cancel()
                if not analysis_task.done():
                    analysis_task.cancel()
                await asyncio.gather(artifact_task, analysis_task, return_exceptions=True)
                error_result = BrowserToolResultBuilder.error(
                    exc,
                    user_error=self._error_message(exc.code),
                )
                if not artifact_task.cancelled() and artifact_task.exception() is None:
                    return BrowserToolResultBuilder.attach_screenshot(
                        error_result,
                        page,
                        screenshot,
                        artifact_task.result(),
                    )
                return error_result
            except Exception as exc:
                if not artifact_task.done():
                    artifact_task.cancel()
                if not analysis_task.done():
                    analysis_task.cancel()
                await asyncio.gather(artifact_task, analysis_task, return_exceptions=True)
                logger.exception("Browser visual analysis failed")
                error_result = ToolResult.error(
                    f"Browser visual analysis failed because of an unexpected error: {exc}",
                    data={"error_code": "unexpected_error"},
                    extra_info={
                        "error_code": "unexpected_error",
                        "user_error": self._message("browser.error.unexpected"),
                    },
                )
                if not artifact_task.cancelled() and artifact_task.exception() is None:
                    return BrowserToolResultBuilder.attach_screenshot(
                        error_result,
                        page,
                        screenshot,
                        artifact_task.result(),
                    )
                return error_result
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
            saved = None
            if params.output_path is not None:
                agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
                if agent_context is None:
                    raise ValueError("Agent context is required to save a Browser screenshot")
                file_path, workspace_path = await BrowserFileAdapter.resolve_workspace_output_path(
                    agent_context.get_workspace_dir(),
                    params.output_path,
                )
                file_exists = await async_exists(file_path)
                before_event = EventType.BEFORE_FILE_UPDATED if file_exists else EventType.BEFORE_FILE_CREATED
                await self._dispatch_file_event(
                    tool_context,
                    str(file_path),
                    before_event,
                    is_screenshot=True,
                )
                saved = await BrowserFileAdapter.save_workspace_screenshot(
                    screenshot.image,
                    file_path=file_path,
                    workspace_path=workspace_path,
                    scale=params.scale,
                    quality=params.quality,
                    default_width=artifact.width,
                    default_height=artifact.height,
                    default_quality=artifact.quality,
                )
                try:
                    await self.get_horizon(tool_context).update_timestamp(file_path)
                except Exception:
                    logger.warning("Browser screenshot timestamp update failed", exc_info=True)
                after_event = EventType.FILE_UPDATED if file_exists else EventType.FILE_CREATED
                await self._dispatch_file_event(
                    tool_context,
                    str(file_path),
                    after_event,
                    is_screenshot=True,
                )
            return BrowserToolResultBuilder.screenshot(page, screenshot, artifact, saved)

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
            "Return exactly one visible label and brief visual evidence. Use this format: "
            'Label: A<number>\\nEvidence: <why it matches>. '
            "Do not mention alternative labels, invent labels, or return element refs.\n\n"
            f"Target: {params.target}"
        )
        visual_result = await self._execute_visual_query(
            tool_context,
            page_id=params.page_id,
            query=query,
            labels=True,
            full_page=False,
            session_id=params.session_id,
        )
        if not visual_result.ok:
            return visual_result
        analysis = visual_result.data.get("analysis")
        labels = visual_result.data.get("label_to_ref")
        page = visual_result.data.get("page")
        if not isinstance(analysis, str) or not isinstance(labels, dict) or not isinstance(page, dict):
            return BrowserToolResultBuilder.visual_match_error(
                visual_result,
                "Visual analysis returned an incomplete labeled-screenshot result. Capture a fresh visual match.",
            )
        valid_labels = {
            label.upper(): ref
            for label, ref in labels.items()
            if isinstance(label, str) and isinstance(ref, str)
        }
        matched_labels = self._matched_labels(analysis, tuple(valid_labels))
        if len(matched_labels) != 1:
            reason = (
                "Visual analysis did not identify a valid label."
                if not matched_labels
                else "Visual analysis identified more than one valid label."
            )
            return BrowserToolResultBuilder.visual_match_error(
                visual_result,
                f"{reason} Capture a fresh visual match and require one label only.",
            )
        label = matched_labels[0]
        generation = page.get("document_generation")
        if not isinstance(generation, int):
            return BrowserToolResultBuilder.visual_match_error(
                visual_result,
                "Visual analysis returned no document generation. Capture a fresh visual match.",
            )
        return BrowserToolResultBuilder.visual_match(
            visual_result,
            page_id=params.page_id,
            document_generation=generation,
            target=params.target,
            label=label,
            ref=valid_labels[label],
            evidence=self._evidence(analysis),
        )

    @staticmethod
    def _matched_labels(analysis: str, valid_labels: tuple[str, ...]) -> tuple[str, ...]:
        matched = []
        for label in valid_labels:
            pattern = rf"(?<![A-Z0-9]){re.escape(label)}(?![A-Z0-9])"
            if re.search(pattern, analysis, flags=re.IGNORECASE):
                matched.append(label)
        return tuple(matched)

    @staticmethod
    def _evidence(analysis: str) -> str:
        try:
            payload = json.loads(analysis)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict):
            evidence = payload.get("evidence")
            if isinstance(evidence, str) and evidence.strip():
                return evidence.strip()
        match = re.search(r"(?im)^\s*evidence\s*:\s*(.+(?:\n(?!\s*label\s*:).+)*)", analysis)
        if match:
            return " ".join(match.group(1).split())
        return " ".join(analysis.split())
