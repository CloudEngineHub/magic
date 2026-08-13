"""分页读取画布轻量概览工具。"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, Optional

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.domain.query import CanvasOverviewResult
from app.tools.design.domain.services.canvas_query_service import (
    DEFAULT_OVERVIEW_LIMIT,
    MAX_OVERVIEW_LIMIT,
    CanvasQueryService,
)
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)


class GetCanvasOverviewParams(BaseToolParams):
    """画布概览工具参数。"""

    project_path: str = Field(..., description="Workspace-relative canvas project path.")
    limit: int = Field(
        DEFAULT_OVERVIEW_LIMIT,
        description="Number of lightweight Element index entries to return, from 1 to 100.",
    )
    page: int = Field(
        1,
        description="1-based page number.",
    )

    @field_validator("page")
    @classmethod
    def validate_page(cls, value: int) -> int:
        """限制页码从 1 开始。"""
        if value < 1:
            raise ValueError("page must be greater than or equal to 1")
        return value

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, value: int) -> int:
        """限制单页概览大小，避免一次返回过多上下文。"""
        if value < 1 or value > MAX_OVERVIEW_LIMIT:
            raise ValueError(f"limit must be between 1 and {MAX_OVERVIEW_LIMIT}")
        return value

class CanvasOverviewContentPresenter:
    """把轻量概览转换为模型可继续调用工具的稳定文本。"""

    @classmethod
    def render(cls, result: CanvasOverviewResult) -> str:
        """输出紧凑的项目摘要、Element Index 表格和分页信息。"""
        lines = [
            "Canvas overview completed.",
            "",
            f"Project: {cls._cell(result.project_name)} ({cls._cell(result.project_type)})",
            f"Summary: {result.total_elements} Element(s), {result.total_connections} connection(s).",
        ]
        if result.elements_by_type:
            type_summary = ", ".join(
                f"{cls._cell(element_type)}: {count}"
                for element_type, count in result.elements_by_type.items()
            )
            lines.append(f"Types: {type_summary}")
        else:
            lines.append("Types: none")

        lines.extend(["", "Element Index:"])
        if result.elements:
            lines.extend(
                [
                    "| Element ID | Type | Name | Status | Contents | Active Content | Main Content | Connections |",
                    "| --- | --- | --- | --- | ---: | --- | --- | --- |",
                ]
            )
            lines.extend(cls._render_element_row(element) for element in result.elements)
        else:
            lines.append("No Elements.")

        lines.extend(
            [
                "",
                f"Pagination: page {result.page}/{result.total_pages}, returned {result.returned}, limit {result.limit}, has_more: {str(result.has_more).lower()}.",
            ]
        )
        lines.extend(
            [
                "",
                "Use query_canvas_elements with exact element_id values to inspect full Content details.",
            ]
        )
        return "\n".join(lines)

    @staticmethod
    def _cell(value: Any, *, empty: str = "-") -> str:
        """把动态值转为紧凑且安全的 Markdown 单元格。"""
        if value is None or value == "":
            return empty
        text = str(value).replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")
        return f"`{text}`"

    @classmethod
    def _render_element_row(cls, element: Any) -> str:
        """把一个轻量 Element 索引渲染为单行表格。"""
        return "| " + " | ".join(
            [
                cls._cell(element.element_id),
                cls._cell(element.element_type),
                cls._cell(element.name),
                cls._cell(element.status),
                str(element.content_count),
                cls._cell(element.active_content_id),
                cls._cell(element.main_content_id),
                cls._render_connections(element),
            ]
        ) + " |"

    @classmethod
    def _render_connections(cls, element: Any) -> str:
        """把节点的入边和出边压缩为一个可读的表格单元格。"""
        parts = [
            f"out: {cls._cell(target)}"
            for target in element.outgoing_element_ids
        ]
        parts.extend(
            f"in: {cls._cell(source)}"
            for source in element.incoming_element_ids
        )
        return "<br>".join(parts) if parts else "-"


@tool(code_mode_only=True)
class GetCanvasOverview(BaseVideoProductionTool[GetCanvasOverviewParams]):
    """分页读取 Canvas 的轻量 Element 概览。"""

    action_key = "get_canvas_overview"
    success_message_key = "get_canvas_overview.success"
    failure_message_key = "get_canvas_overview.exception"

    def __init__(self, **data: Any):
        """初始化画布概览查询服务。"""
        super().__init__(**data)
        self._query_service = CanvasQueryService()

    async def execute(
        self,
        tool_context: ToolContext,
        params: GetCanvasOverviewParams,
    ) -> ToolResult:
        """执行实时概览查询并返回当前分页。"""
        try:
            resolved_path, error_result = await self._ensure_project_ready(
                params.project_path,
                require_magic_project_js=True,
                tool_context=tool_context,
            )
            if error_result is not None:
                return error_result
            if resolved_path is None:
                return ToolResult.error(
                    "Canvas project path could not be resolved.",
                    extra_info={"error_type": "design.error_project_not_found"},
                )

            result = await self._query_service.overview(
                str(resolved_path),
                page=params.page,
                limit=params.limit,
            )
            return ToolResult(
                content=CanvasOverviewContentPresenter.render(result),
                data=asdict(result),
            )
        except Exception as error:
            return ToolResult.error(
                f"Canvas overview failed: {error}",
                extra_info={"error_type": "design.canvas_overview_failed"},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在读取画布概览。"""
        arguments = arguments or {}
        limit = arguments.get("limit") or DEFAULT_OVERVIEW_LIMIT
        page = arguments.get("page") or 1
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "get_canvas_overview.before",
                page=page,
                limit=limit,
            ),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户汇总概览页读取结果。"""
        result.use_custom_remark = True
        data = result.data if isinstance(result.data, dict) else {}
        if not result.ok:
            remark = VideoProductionMarkdownPresenter.message(
                "get_canvas_overview.after_failure",
                failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
            )
        else:
            remark = VideoProductionMarkdownPresenter.message(
                "get_canvas_overview.after_success",
                page=data.get("page", 1),
                total_pages=data.get("total_pages", 1),
                returned=data.get("returned", 0),
                has_more=VideoProductionMarkdownPresenter.message(
                    "get_canvas_overview.more_yes"
                    if data.get("has_more")
                    else "get_canvas_overview.more_no"
                ),
            )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": remark,
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> ToolDetail:
        """以 Markdown 展示概览统计和分页状态，不展示完整 DSL。"""
        data = result.data if isinstance(result.data, dict) else {}
        project_path = (arguments or {}).get("project_path") or ""
        lines = [
            VideoProductionMarkdownPresenter.message(
                "get_canvas_overview.detail_project",
                project=VideoProductionMarkdownPresenter.code(project_path),
            )
        ]
        if not result.ok:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "get_canvas_overview.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        else:
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "get_canvas_overview.detail_summary",
                        total=data.get("total_elements", 0),
                        connections=data.get("total_connections", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "get_canvas_overview.detail_page",
                        page=data.get("page", 1),
                        total_pages=data.get("total_pages", 1),
                        returned=data.get("returned", 0),
                        limit=data.get("limit", 0),
                        has_more=VideoProductionMarkdownPresenter.message(
                            "get_canvas_overview.more_yes"
                            if data.get("has_more")
                            else "get_canvas_overview.more_no"
                        ),
                    ),
                ]
            )
            types = data.get("elements_by_type") or {}
            if types:
                lines.append(
                    VideoProductionMarkdownPresenter.message(
                        "get_canvas_overview.detail_types",
                        types=", ".join(f"{key}: {value}" for key, value in types.items()),
                    )
                )
        return VideoProductionMarkdownPresenter.detail(
            "get_canvas_overview.md",
            VideoProductionMarkdownPresenter.message("get_canvas_overview.detail_title"),
            lines,
        )
