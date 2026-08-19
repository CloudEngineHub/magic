"""Canvas Agent 的 Code mode 工具。

所有工具只把可继续工作的业务结果放入 ``ToolResult.content``，内部结构放入 ``data``。
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import ConfigDict, Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.domain.errors import CanvasDomainError, CanvasProtocolError
from app.tools.canvas.repository import CanvasRepository
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool


def _workspace(tool_context: ToolContext | None) -> Path:
    """解析当前 Agent 的运行时工作区。"""
    if tool_context is not None:
        agent_context = tool_context.get_extension("agent_context")
        if agent_context is not None and agent_context.get_workspace_dir():
            return Path(agent_context.get_workspace_dir())
        if tool_context.base_dir:
            return Path(tool_context.base_dir)
    return Path.cwd()


def _application(tool_context: ToolContext | None) -> CanvasApplication:
    """创建当前调用使用的 Canvas Application。"""
    return CanvasApplication(CanvasRepository(_workspace(tool_context)))


def _error_result(error: Exception) -> ToolResult:
    """把内部异常转换为稳定的模型可见英文结果。"""
    if isinstance(error, (CanvasDomainError, CanvasProtocolError)):
        code = "CANVAS_PROJECT_NOT_SUPPORTED" if error.code == "UNSUPPORTED_CANVAS_VERSION" else error.code
        return ToolResult.error(f"Canvas operation failed.\n- Error code: {code}\n- Reason: {error.message}")
    if isinstance(error, FileNotFoundError) and str(error) == "PROJECT_NOT_FOUND":
        return ToolResult.error("Canvas operation failed.\n- Error code: PROJECT_NOT_FOUND\n- Action: Call initialize_canvas first.")
    if isinstance(error, ValueError) and str(error) in {"INVALID_ELEMENT_DETAILS", "UNSUPPORTED_ELEMENT_DETAILS_STRUCTURE"}:
        return ToolResult.error(
            "Canvas operation failed.\n"
            "- Error code: INVALID_ELEMENT_DETAILS\n"
            "- Reason: Canvas metadata is unavailable or has an unsupported structure.\n"
            "- Action: Query the Canvas first and ask the user to repair the project metadata."
        )
    if isinstance(error, ValueError) and str(error) == "PROJECT_PATH_INVALID":
        return ToolResult.error(
            "Canvas operation failed.\n"
            "- Error code: PROJECT_PATH_INVALID\n"
            "- Reason: project_path must be a workspace-relative directory."
        )
    return ToolResult.error(
        "Canvas operation failed.\n"
        "- Error code: INTERNAL_ERROR\n"
        "- Reason: An unexpected internal error occurred.\n"
        "- Action: Keep the returned IDs and retry the smallest failed operation."
    )


class CanvasToolFeedbackMixin:
    """生成 Canvas 工具面向用户的 action、remark 和 detail。"""

    feedback_action_key = "canvas"

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """根据工具参数生成调用前的用户反馈。"""
        action_key = self._feedback_action_key(arguments or {})
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": self._feedback_remark(arguments or {}, None),
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """根据结果状态生成调用后的用户反馈。"""
        normalized = arguments or {}
        action_key = self._feedback_action_key(normalized)
        remark = self._feedback_remark(normalized, result)
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, Any] | None = None,
    ) -> ToolDetail | None:
        """把结构化结果整理成用户可展开查看的 Markdown 详情。"""
        payload = {"ok": result.ok, "data": result.data}
        if not result.ok:
            payload["error"] = result.content
        content = "```json\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(
                file_name=f"{getattr(self, 'name', 'canvas')}.md",
                content=content,
            ),
        )

    def _feedback_action_key(self, arguments: dict[str, Any]) -> str:
        """根据工具参数选择动作翻译键。"""
        if self.feedback_action_key == "add_canvas_contents":
            sources = {
                str(item.get("content", {}).get("source"))
                for item in arguments.get("items", [])
                if isinstance(item, dict)
            }
            if sources == {"generated"}:
                return "canvas.add_generated_content"
            if sources == {"imported"}:
                return "canvas.import_content"
        if self.feedback_action_key == "add_canvas_connections":
            items = arguments.get("items", [])
            if any(item.get("replace_existing_connections") for item in items if isinstance(item, dict)):
                return "canvas.replace_connections"
            if all(item.get("remove_connection_ids") and not item.get("source_element_id") for item in items if isinstance(item, dict)):
                return "canvas.remove_connections"
        return self.feedback_action_key

    def _feedback_remark(self, arguments: dict[str, Any], result: ToolResult | None) -> str:
        """生成包含参数规模和结果状态的短摘要。"""
        project_path = arguments.get("project_path") or ""
        items = arguments.get("items")
        prefix = f"{project_path} · " if project_path else ""
        if self.feedback_action_key == "canvas.wait_generation":
            if result is None:
                return prefix + i18n.translate(
                    "canvas.wait_limit",
                    category="tool.messages",
                    seconds=arguments.get("max_wait_seconds", 60),
                )
            values = result.data.get("items", []) if result.data else []
            completed = sum(1 for item in values if item.get("status") == "completed")
            failed = sum(1 for item in values if item.get("status") in {"failed", "not_found"})
            timed_out = sum(1 for item in values if item.get("timed_out"))
            if completed == len(values) and values:
                key = "canvas.wait_completed"
            elif failed == len(values) and values:
                key = "canvas.wait_failed"
            elif timed_out:
                key = "canvas.wait_timeout"
            else:
                key = "canvas.wait_partial"
            return prefix + i18n.translate(
                key,
                category="tool.messages",
                completed=completed,
                failed=failed,
                total=len(values),
            )
        if isinstance(items, list):
            if result is None:
                return prefix + i18n.translate(
                    "canvas.items_pending", category="tool.messages", total=len(items)
                )
            values = result.data.get("items", []) if result.data else []
            success = sum(
                1
                for item in values
                if not item.get("query_error")
                and not item.get("persistence_error")
                and item.get("status")
                in {
                    "completed", "added", "removed", "replaced", "already_removed",
                    "already_replaced", "pending", "processing",
                }
            )
            return prefix + i18n.translate(
                "canvas.items_result",
                category="tool.messages",
                succeeded=success,
                total=len(items),
            )
        if "page" in arguments:
            return prefix + i18n.translate(
                "canvas.page", category="tool.messages", page=arguments.get("page")
            )
        if "max_wait_seconds" in arguments:
            return prefix + i18n.translate(
                "canvas.wait_limit",
                category="tool.messages",
                seconds=arguments.get("max_wait_seconds"),
            )
        return prefix.rstrip(" ·")


class ProjectPathParams(BaseToolParams):
    """公共项目路径参数。"""

    project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")


class ElementIdParams(ProjectPathParams):
    """精确 Element 查询参数。"""

    element_ids: list[str] = Field(..., min_length=1, max_length=10, description="Exact Element IDs obtained from a Canvas result.")


class LayoutInput(BaseToolParams):
    """可插拔布局策略参数。"""

    model_config = ConfigDict(extra="forbid")
    strategy: Literal["row_incremental", "dependency_flow", "explicit_position"]
    position: dict[str, float] | None = None

    @model_validator(mode="after")
    def validate_position(self) -> "LayoutInput":
        """限制显式坐标只出现在显式布局策略中。"""
        if self.strategy == "explicit_position" and (self.position is None or not {"x", "y"}.issubset(self.position)):
            raise ValueError("explicit_position requires position.x and position.y")
        if self.strategy != "explicit_position" and self.position is not None:
            raise ValueError("position is only allowed for explicit_position")
        if self.position is not None and any(not math.isfinite(value) for value in self.position.values()):
            raise ValueError("position values must be finite numbers")
        return self


class UserContentInput(BaseToolParams):
    """用户直接提供的文本、图形、分镜或编辑 Content。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    source: Literal["user"]
    content_type: Literal["text", "rectangle", "ellipse", "triangle", "star", "storyboard", "video-edit"]
    content: Any | None = None
    default_style: dict[str, Any] | None = Field(None, alias="defaultStyle")
    fill: Any | None = None
    stroke: Any | None = None
    stroke_width: float | None = Field(None, alias="strokeWidth")
    corner_radius: float | None = Field(None, alias="cornerRadius")
    sides: int | None = None
    inner_radius_ratio: float | None = Field(None, alias="innerRadiusRatio")
    generation_config: dict[str, Any] | None = Field(None, alias="generationConfig")
    shots: list[dict[str, Any]] | None = None
    video_sequence: list[dict[str, Any]] | None = Field(None, alias="videoSequence")
    output: dict[str, Any] | None = None


class ImportedContentInput(BaseToolParams):
    """从工作区导入的媒体 Content。"""

    model_config = ConfigDict(extra="forbid")
    source: Literal["imported"]
    content_type: Literal["image", "video", "audio"]
    asset_path: str = Field(..., min_length=1, description="Existing workspace-relative media file path.")


class GeneratedImageContentInput(BaseToolParams):
    """同步或异步图片生成 Content 输入。"""

    model_config = ConfigDict(extra="forbid")
    source: Literal["generated"]
    content_type: Literal["image"]
    prompt: str = Field(..., min_length=1)
    size: str | None = None
    model_id: str | None = None
    name: str | None = None
    reference_images: list[str] = Field(default_factory=list)


class GeneratedVideoContentInput(BaseToolParams):
    """异步或同步视频生成 Content 输入。"""

    model_config = ConfigDict(extra="forbid")
    source: Literal["generated"]
    content_type: Literal["video"]
    prompt: str = Field(..., min_length=1)
    model_id: str | None = None
    name: str | None = None
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_video_paths: list[str] = Field(default_factory=list)
    reference_audio_paths: list[str] = Field(default_factory=list)
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    size: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: dict[str, Any] = Field(default_factory=dict)


ContentInput = Annotated[
    UserContentInput | ImportedContentInput | GeneratedImageContentInput | GeneratedVideoContentInput,
    Field(union_mode="smart"),
]


class CreationConnectionInput(BaseToolParams):
    """新增节点时以当前节点为锚点的初始连线。"""

    model_config = ConfigDict(extra="forbid")
    source_element_id: str | None = None
    source_item_ref: str | None = None
    target_element_id: str | None = None
    target_item_ref: str | None = None

    @model_validator(mode="after")
    def validate_anchor(self) -> "CreationConnectionInput":
        """保证连线只有一个方向锚点。"""
        values = [self.source_element_id, self.source_item_ref, self.target_element_id, self.target_item_ref]
        if sum(value is not None for value in values) != 1:
            raise ValueError("each initial connection must provide exactly one source or target reference")
        return self


class ElementInput(BaseToolParams):
    """新增 Element 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_type: str
    name: str | None = None
    layout: LayoutInput | None = None
    content: ContentInput | None = None
    connections: list[CreationConnectionInput] = Field(default_factory=list)


class AddContentInput(BaseToolParams):
    """追加 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content: ContentInput


class GenerationOverrideInput(BaseToolParams):
    """失败生成重试时允许覆盖的公开生成参数。"""

    model_config = ConfigDict(extra="forbid")
    prompt: str | None = Field(None, min_length=1)
    model_id: str | None = None
    name: str | None = None
    size: str | None = None
    reference_images: list[str] | None = None
    reference_image_paths: list[str] | None = None
    reference_video_paths: list[str] | None = None
    reference_audio_paths: list[str] | None = None
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: dict[str, Any] | None = None


class RetryContentInput(BaseToolParams):
    """失败 Content 重试参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content_id: str
    generation_override: GenerationOverrideInput | None = None


class MainContentInput(BaseToolParams):
    """选择主 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content_id: str


class LayoutElementInput(BaseToolParams):
    """调整布局参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    layout: LayoutInput


class ConnectionInput(BaseToolParams):
    """新增、删除或替换 Connection 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    source_element_id: str | None = None
    target_element_id: str | None = None
    replace_existing_connections: bool = False
    remove_connection_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_operation(self) -> "ConnectionInput":
        """保证每个 item 只有一个明确的连线操作分支。"""
        has_endpoints = self.source_element_id is not None or self.target_element_id is not None
        if has_endpoints and (not self.source_element_id or not self.target_element_id):
            raise ValueError("source_element_id and target_element_id must be provided together")
        if self.replace_existing_connections and (not has_endpoints or not self.remove_connection_ids):
            raise ValueError("replacement requires endpoints and remove_connection_ids")
        if self.remove_connection_ids and has_endpoints and not self.replace_existing_connections:
            raise ValueError("set replace_existing_connections=true when replacing an existing Connection")
        if not has_endpoints and not self.remove_connection_ids:
            raise ValueError("connection item must add, remove, or replace a Connection")
        return self


class WaitTask(BaseToolParams):
    """异步生成任务标识。"""

    generation_task_id: str


@tool(name="initialize_canvas", code_mode_only=True)
class InitializeCanvas(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 初始化 Canvas 项目。-->Initialize a Canvas project."""

    name = "initialize_canvas"
    feedback_action_key = "canvas.initialize"

    async def execute(self, tool_context: ToolContext, params: ProjectPathParams) -> ToolResult:
        """初始化项目并返回工作区相对路径。"""
        try:
            result = await _application(tool_context).initialize(params.project_path)
            state = "created" if result["created"] else "already existed"
            return ToolResult(content=f"Canvas project {state}.\n- Project path: {params.project_path}", data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="query_canvas_overview", code_mode_only=True)
class QueryCanvasOverview(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 查询 Canvas 轻量概览。-->Query a lightweight Canvas overview."""

    name = "query_canvas_overview"
    feedback_action_key = "canvas.query_overview"

    class Params(ProjectPathParams):
        page: int = Field(1, ge=1)
        limit: int = Field(50, ge=1, le=100)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """读取当前分页概览。"""
        try:
            result = await _application(tool_context).overview(params.project_path, params.page, params.limit)
            return ToolResult(content=_overview_content(result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="query_canvas_element_details", code_mode_only=True)
class QueryCanvasElementDetails(CanvasToolFeedbackMixin, BaseTool[ElementIdParams]):
    """<!--zh: 查询精确 Canvas Element 详情。-->Query exact Canvas Element details."""

    name = "query_canvas_element_details"
    feedback_action_key = "canvas.query_elements"

    async def execute(self, tool_context: ToolContext, params: ElementIdParams) -> ToolResult:
        """读取指定 Element 和关联 Connection。"""
        try:
            result = await _application(tool_context).elements(params.project_path, params.element_ids)
            return ToolResult(content=_elements_content(result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="add_canvas_elements", code_mode_only=True)
class AddCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 新增 Canvas Element，可选添加 Content、布局和初始连线。-->Add Canvas Elements with optional Content, layout, and initial Connections."""

    name = "add_canvas_elements"
    feedback_action_key = "canvas.add_elements"

    class Params(ProjectPathParams):
        items: list[ElementInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建一批 Element。"""
        try:
            payload = [item.model_dump(exclude_none=True, by_alias=True) for item in params.items]
            result = await _application(tool_context).add_elements(params.project_path, payload, tool_context)
            return ToolResult(content=_items_content("Canvas Elements added successfully.", result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="add_canvas_contents", code_mode_only=True)
class AddCanvasContents(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 向已有 Element 追加新的 Content 版本。-->Add a new Content version to an existing Element."""

    name = "add_canvas_contents"
    feedback_action_key = "add_canvas_contents"

    class Params(ProjectPathParams):
        items: list[AddContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """追加 Content 版本，不覆盖旧 Content。"""
        try:
            payload = [item.model_dump(exclude_none=True, by_alias=True) for item in params.items]
            result = await _application(tool_context).add_contents(params.project_path, payload, tool_context)
            return ToolResult(content=_items_content("Canvas Content versions added successfully.", result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="retry_canvas_content_generation", code_mode_only=True)
class RetryCanvasContentGeneration(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 在用户明确要求时重试失败的 generated Content。-->Retry a failed generated Content only after explicit user intent."""

    name = "retry_canvas_content_generation"
    feedback_action_key = "canvas.retry_generation"

    class Params(ProjectPathParams):
        items: list[RetryContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行失败 Content 的受控重试校验。"""
        try:
            result = await _application(tool_context).retry_content(params.project_path, [item.model_dump(exclude_none=True) for item in params.items], tool_context)
            return ToolResult(content=_items_content("Canvas failed Content retry started.", result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="select_canvas_main_content", code_mode_only=True)
class SelectCanvasMainContent(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 显式选择 Element 的主 Content。-->Select the main Content for an Element."""

    name = "select_canvas_main_content"
    feedback_action_key = "canvas.select_main"

    class Params(ProjectPathParams):
        items: list[MainContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """只修改 main Content 指针。"""
        try:
            result = await _application(tool_context).select_main(params.project_path, [item.model_dump() for item in params.items])
            return ToolResult(content=_items_content("Canvas main Content selected successfully.", result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="layout_canvas_elements", code_mode_only=True)
class LayoutCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 使用布局策略调整已有 Element。-->Apply a named layout strategy to existing Elements."""

    name = "layout_canvas_elements"
    feedback_action_key = "canvas.layout"

    class Params(ProjectPathParams):
        items: list[LayoutElementInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行布局策略。"""
        try:
            result = await _application(tool_context).layout(params.project_path, [item.model_dump(exclude_none=True) for item in params.items])
            return ToolResult(content=_items_content("Canvas layout updated successfully.", result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="add_canvas_connections", code_mode_only=True)
class AddCanvasConnections(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 新增、删除或替换明确的 Canvas Connection。-->Add, remove, or replace explicit Canvas Connections."""

    name = "add_canvas_connections"
    feedback_action_key = "add_canvas_connections"

    class Params(ProjectPathParams):
        items: list[ConnectionInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """按明确分支管理 Connection。"""
        try:
            result = await _application(tool_context).connections(params.project_path, [item.model_dump(exclude_none=True) for item in params.items])
            return ToolResult(content=_items_content("Canvas Connections updated successfully.", result), data=result)
        except Exception as error:
            return _error_result(error)

@tool(name="wait_canvas_generation", code_mode_only=True)
class WaitCanvasGeneration(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 查询异步 Canvas 生成任务状态。-->Wait for Canvas generation task status."""

    name = "wait_canvas_generation"
    feedback_action_key = "canvas.wait_generation"

    class Params(ProjectPathParams):
        tasks: list[WaitTask] = Field(..., min_length=1)
        max_wait_seconds: int = Field(60, ge=1, le=600)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """查询任务状态；超时继续使用原任务 ID。"""
        try:
            result = await _application(tool_context).wait(params.project_path, [task.generation_task_id for task in params.tasks], params.max_wait_seconds, tool_context)
            return ToolResult(content=_items_content("Canvas generation status returned.", result), data=result)
        except Exception as error:
            return _error_result(error)


def _overview_content(result: dict[str, Any]) -> str:
    """生成概览工具的模型可读文本。"""
    lines = [
        "Canvas overview completed.",
        f"- Project path: {result['project_path']}",
        f"- Elements: {result['total_elements']}",
        f"- Connections: {result['total_connections']}",
        f"- Page: {result['page']} | Limit: {result['limit']} | Has more: {str(result['has_more']).lower()}",
    ]
    for element in result["elements"]:
        lines.append(
            f"- element_id={element['element_id']} | type={element['element_type']} | "
            f"name={element.get('name') or '-'} | position=({element.get('x')}, {element.get('y')}) | "
            f"size={element.get('width')}x{element.get('height')} | contents={element['content_count']} | "
            f"active_content_id={element.get('active_content_id') or '-'} | "
            f"main_content_id={element.get('main_content_id') or '-'} | status={element.get('status') or '-'} | "
            f"incoming={len(element.get('incoming') or [])} | outgoing={len(element.get('outgoing') or [])}"
        )
    lines.append("Next: call query_canvas_element_details with exact Element IDs when full details are needed.")
    return "\n".join(lines)


def _elements_content(result: dict[str, Any]) -> str:
    """生成详情工具的模型可读文本。"""
    lines = [
        "Canvas Element details returned.",
        f"- Project path: {result['project_path']}",
        f"- Elements: {len(result['elements'])}",
        f"- details_complete: {str(result.get('details_complete', True)).lower()}",
    ]
    for element in result["elements"]:
        lines.append(f"Element {element['element_id']}:")
        lines.append(json.dumps(element, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    lines.append(f"Connections ({len(result['connections'])}):")
    for connection in result["connections"]:
        lines.append(
            f"- connection_id={connection['connection_id']} | source_element_id={connection['source_element_id']} | "
            f"target_element_id={connection['target_element_id']}"
        )
    for warning in result.get("warnings", []):
        lines.append(f"- Warning: {warning}")
    return "\n".join(lines)


def _items_content(summary: str, result: dict[str, Any]) -> str:
    """生成批量工具的模型可读逐项摘要。"""
    lines = [summary]
    for item in result.get("items", []):
        ordered_keys = (
            "item_ref", "status", "element_id", "content_id", "connection_id",
            "source_element_id", "target_element_id", "strategy",
            "previous_main_content_id", "main_content_id", "active_content_id",
            "removed_connection_ids", "generation_task_id", "output_uri", "error",
            "query_error", "persistence_warning", "persistence_error",
            "timed_out", "already_finalized", "next_action",
        )
        values = []
        for key in ordered_keys:
            value = item.get(key)
            if value is None or value == []:
                continue
            if key == "error":
                value = "Generation failed; report the failure and retry only after explicit user confirmation."
            elif key in {"query_error", "persistence_error"}:
                value = "Generation status is temporarily unavailable; continue with the same task ID."
            rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":")) if isinstance(value, (list, dict)) else str(value).lower() if isinstance(value, bool) else str(value)
            values.append(f"{key}={rendered}")
        lines.append("- " + " | ".join(values))
    if any(
        item.get("generation_task_id")
        and item.get("status") in {"pending", "processing"}
        for item in result.get("items", [])
    ):
        lines.append("Next: call wait_canvas_generation with the returned generation_task_id values.")
    if any(item.get("timed_out") for item in result.get("items", [])):
        lines.append("Continue waiting with the same generation_task_id; do not create a duplicate generation task.")
    return "\n".join(lines)
