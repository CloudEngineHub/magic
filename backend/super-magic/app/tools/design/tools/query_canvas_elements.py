"""批量查询画布 Element 工具。"""

import json
from dataclasses import asdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

from pydantic import ConfigDict, Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.domain.services.canvas_query_service import (
    MAX_QUERY_ELEMENT_IDS,
    CanvasQueryService,
)
from app.tools.design.domain.query import CanvasElementView, CanvasQueryResult
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)


class QueryCanvasElementsParams(BaseToolParams):
    """批量画布查询参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative canvas project path.")
    element_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=MAX_QUERY_ELEMENT_IDS,
        description="Exact Element IDs to read. Provide between 1 and 10 IDs.",
    )

    @field_validator("element_ids")
    @classmethod
    def validate_element_ids(cls, values: List[str]) -> List[str]:
        """拒绝空 ID，并按首次出现顺序去除重复值。"""
        normalized: List[str] = []
        for value in values:
            element_id = value.strip()
            if not element_id:
                raise ValueError("element_ids must contain only non-empty exact Element IDs")
            if element_id not in normalized:
                normalized.append(element_id)
        return normalized


class CanvasQueryContentPresenter:
    """把稳定查询视图转换为可供模型继续调用工具的英文内容。"""

    @classmethod
    def render(cls, result: CanvasQueryResult) -> str:
        """输出 Element、Content 和业务字段，不暴露布局及关系维护细节。"""
        lines = [f"Canvas query completed. Matched {len(result.elements)} Element(s)."]
        if result.validation_warnings:
            lines.extend([
                "",
                "Canvas validation warnings requiring model repair:",
                *[f"- {warning}" for warning in result.validation_warnings],
            ])
        if result.missing_element_ids:
            missing_ids = ", ".join(f'"{element_id}"' for element_id in result.missing_element_ids)
            lines.append(f"Element IDs not found: {missing_ids}.")

        for element in result.elements:
            lines.extend(["", *cls._render_element(element)])
        return "\n".join(lines)

    @classmethod
    def _render_element(cls, element: CanvasElementView) -> List[str]:
        """输出单个 Element 及其全部 Content 业务字段。"""
        lines = [
            f'Element "{element.name}":',
            f'- element_id: "{element.element_id}"',
            f'- type: "{element.element_type}"',
            f'- active_content_id: {cls._format_scalar(element.active_content_id)}',
            f'- main_content_id: {cls._format_scalar(element.main_content_id)}',
            "- contents:",
        ]
        if not element.contents:
            lines.append("  - none")
            return lines

        for content in element.contents:
            lines.append(f"  - content_id: {cls._format_scalar(content.content_id)}")
            if not content.fields:
                lines.append("    fields: none")
                continue
            lines.append("    fields:")
            for field_path, value in cls._flatten_fields(content.fields):
                lines.append(f"      - {field_path}: {cls._format_scalar(value)}")
        return lines

    @classmethod
    def _flatten_fields(
        cls,
        value: Any,
        prefix: str = "",
    ) -> Iterable[Tuple[str, Any]]:
        """把嵌套业务字段展平为稳定字段路径，避免输出原始字典。"""
        if isinstance(value, dict):
            if not value and prefix:
                yield prefix, "empty object"
                return
            for key, child in value.items():
                child_prefix = f"{prefix}.{key}" if prefix else str(key)
                yield from cls._flatten_fields(child, child_prefix)
            return
        if isinstance(value, list):
            if not value and prefix:
                yield prefix, "empty list"
                return
            for index, child in enumerate(value):
                yield from cls._flatten_fields(child, f"{prefix}[{index}]")
            return
        yield prefix, value

    @staticmethod
    def _format_scalar(value: Any) -> str:
        """把标量格式化为模型可稳定复用的精确文本。"""
        if value is None:
            return "not set"
        if isinstance(value, (str, bool, int, float)):
            return json.dumps(value, ensure_ascii=False)
        return json.dumps(str(value), ensure_ascii=False)


# 完整的模型侧使用规范位于 video-production 与 canvas-designer Skill。
@tool(code_mode_only=True)
class QueryCanvasElements(BaseVideoProductionTool[QueryCanvasElementsParams]):
    """批量查询 Canvas Element。"""

    action_key = "query_canvas_elements"
    success_message_key = "query_canvas_elements.success"
    failure_message_key = "query_canvas_elements.exception"

    def __init__(self, **data: Any):
        """初始化画布查询服务。"""
        super().__init__(**data)
        self._query_service = CanvasQueryService()

    async def execute(
        self,
        tool_context: ToolContext,
        params: QueryCanvasElementsParams,
    ) -> ToolResult:
        """执行实时批量查询并返回稳定结构。"""
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
            result = await self._query_service.query(
                str(resolved_path),
                element_ids=params.element_ids,
            )
            data: Dict[str, Any] = {
                "elements": [asdict(element) for element in result.elements],
                "connections": [asdict(connection) for connection in result.connections],
                "missing_element_ids": result.missing_element_ids,
            }
            return ToolResult(
                content=CanvasQueryContentPresenter.render(result),
                data=data,
            )
        except Exception as error:
            return ToolResult.error(
                f"Canvas query failed: {error}",
                extra_info={"error_type": "design.query_failed"},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在读取哪些确定的画布节点。"""
        element_ids = list((arguments or {}).get("element_ids") or [])
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "query_canvas_elements.before",
                count=len(element_ids),
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
        """向用户汇总节点命中数量和缺失数量。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        if not result.ok:
            remark = VideoProductionMarkdownPresenter.message(
                "query_canvas_elements.after_failure",
                failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
            )
        else:
            found_count = len(data.get("elements") or [])
            missing_count = len(data.get("missing_element_ids") or [])
            remark_key = (
                "query_canvas_elements.after_success_with_missing"
                if missing_count
                else "query_canvas_elements.after_success"
            )
            remark = VideoProductionMarkdownPresenter.message(
                remark_key,
                found_count=found_count,
                missing_count=missing_count,
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
        """以 Markdown 展示查询范围、命中节点和缺失节点。"""
        data = VideoProductionMarkdownPresenter.result_data(result)
        project_path = (arguments or {}).get("project_path") or ""
        requested_ids = list((arguments or {}).get("element_ids") or [])
        lines = [
            VideoProductionMarkdownPresenter.message(
                "query_canvas_elements.detail_project",
                project=VideoProductionMarkdownPresenter.code(project_path),
            ),
            VideoProductionMarkdownPresenter.message(
                "query_canvas_elements.detail_requested",
                count=len(requested_ids),
            ),
        ]
        if not result.ok:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "query_canvas_elements.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        else:
            elements = list(data.get("elements") or [])
            connections = list(data.get("connections") or [])
            missing_ids = list(data.get("missing_element_ids") or [])
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "query_canvas_elements.detail_found",
                        count=len(elements),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "query_canvas_elements.detail_connections",
                        count=len(connections),
                    ),
                ]
            )
            if elements:
                lines.extend(
                    [
                        "",
                        VideoProductionMarkdownPresenter.message(
                            "query_canvas_elements.detail_elements_heading"
                        ),
                    ]
                )
                for element in elements:
                    name = (
                        element.get("name")
                        or element.get("element_id")
                        or VideoProductionMarkdownPresenter.message(
                            "query_canvas_elements.unnamed_element"
                        )
                    )
                    element_id = VideoProductionMarkdownPresenter.code(element.get("element_id"))
                    element_type = VideoProductionMarkdownPresenter.code(element.get("element_type"))
                    lines.append(
                        VideoProductionMarkdownPresenter.message(
                            "query_canvas_elements.detail_element",
                            name=name,
                            element_id=element_id,
                            element_type=element_type,
                        )
                    )
            if missing_ids:
                lines.extend(
                    [
                        "",
                        VideoProductionMarkdownPresenter.message(
                            "query_canvas_elements.detail_missing_heading"
                        ),
                    ]
                )
                lines.extend(
                    f"- {VideoProductionMarkdownPresenter.code(element_id)}"
                    for element_id in missing_ids
                )
        return VideoProductionMarkdownPresenter.detail(
            "query_canvas_elements.md",
            VideoProductionMarkdownPresenter.message("query_canvas_elements.detail_title"),
            lines,
        )
