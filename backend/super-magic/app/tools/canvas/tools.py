"""Canvas Agent 的 Code mode 工具入口。"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.presentation import (
    CanvasToolFeedbackMixin,
    elements_content,
    error_result,
    items_content,
    overview_content,
)
from app.tools.canvas.repository import CanvasRepository
from app.tools.canvas.schemas import (
    AddContentInput,
    ConnectionInput,
    ContentInput,
    CreationConnectionInput,
    ElementIdParams,
    ElementInput,
    FrameSelectionInput,
    GenerationOverrideInput,
    LayoutElementInput,
    LayoutInput,
    MainContentInput,
    ProjectPathParams,
    RetryContentInput,
    WaitTask,
)
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool

# 这些工具仅供 Code mode 使用，完整调用说明位于 agents/skills/canvas-manager/SKILL.md。


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


# 保留模块内旧名称，供已有测试和调用方平滑迁移。
_error_result = error_result
_overview_content = overview_content
_elements_content = elements_content
_items_content = items_content


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
            return ToolResult(
                content=f"Canvas project {state}.\n- Project path: {params.project_path}",
                data=result,
            )
        except Exception as error:
            return error_result(error)


@tool(name="query_canvas_overview", code_mode_only=True)
class QueryCanvasOverview(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 查询 Canvas 轻量概览。-->Query a lightweight Canvas overview."""

    name = "query_canvas_overview"
    feedback_action_key = "canvas.query_overview"

    class Params(ProjectPathParams):
        """概览分页参数。"""

        page: int = Field(1, ge=1, description="One-based page number.")
        limit: int = Field(50, ge=1, le=100, description="Maximum Elements returned on this page.")

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """读取当前分页概览。"""
        try:
            result = await _application(tool_context).overview(params.project_path, params.page, params.limit)
            return ToolResult(content=overview_content(result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="query_canvas_element_details", code_mode_only=True)
class QueryCanvasElementDetails(CanvasToolFeedbackMixin, BaseTool[ElementIdParams]):
    """<!--zh: 查询精确 Canvas Element 详情。-->Query exact Canvas Element details."""

    name = "query_canvas_element_details"
    feedback_action_key = "canvas.query_elements"

    async def execute(self, tool_context: ToolContext, params: ElementIdParams) -> ToolResult:
        """读取指定 Element 和关联 Connection。"""
        try:
            result = await _application(tool_context).elements(params.project_path, params.element_ids)
            return ToolResult(content=elements_content(result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="add_canvas_elements", code_mode_only=True)
class AddCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 新增 Canvas Element。-->Add Canvas Elements."""

    name = "add_canvas_elements"
    feedback_action_key = "canvas.add_elements"

    class Params(ProjectPathParams):
        """批量新增 Element 参数。"""

        items: list[ElementInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建一批 Element，并按 item 返回真实标识。"""
        try:
            payload = [item.model_dump(exclude_none=True, by_alias=True) for item in params.items]
            result = await _application(tool_context).add_elements(params.project_path, payload, tool_context)
            return ToolResult(content=items_content("Canvas Elements added successfully.", result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="frame_canvas_elements", code_mode_only=True)
class FrameCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 将已有同层级节点框选为新的 Frame。-->Frame existing sibling Elements."""

    name = "frame_canvas_elements"
    feedback_action_key = "canvas.frame_elements"

    class Params(ProjectPathParams):
        """批量框选参数。"""

        items: list[FrameSelectionInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建 Frame 并返回真实 Frame 和子节点 ID。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).frame_elements(params.project_path, payload)
            return ToolResult(content=items_content("Canvas Frames created successfully.", result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="add_canvas_contents", code_mode_only=True)
class AddCanvasContents(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 向已有 Element 追加 Content。-->Add Content versions to existing Elements."""

    name = "add_canvas_contents"
    feedback_action_key = "add_canvas_contents"

    class Params(ProjectPathParams):
        """批量追加 Content 参数。"""

        items: list[AddContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """追加 Content 版本，不覆盖已有版本。"""
        try:
            payload = [item.model_dump(exclude_none=True, by_alias=True) for item in params.items]
            result = await _application(tool_context).add_contents(params.project_path, payload, tool_context)
            return ToolResult(
                content=items_content("Canvas Content versions added successfully.", result),
                data=result,
            )
        except Exception as error:
            return error_result(error)


@tool(name="retry_canvas_content_generation", code_mode_only=True)
class RetryCanvasContentGeneration(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 重试失败的 generated Content。-->Retry failed generated Content."""

    name = "retry_canvas_content_generation"
    feedback_action_key = "canvas.retry_generation"

    class Params(ProjectPathParams):
        """批量生成重试参数。"""

        items: list[RetryContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """在重试上限内复用原 Content ID。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).retry_content(
                params.project_path,
                payload,
                tool_context,
            )
            return ToolResult(content=items_content("Canvas failed Content retry started.", result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="select_canvas_main_content", code_mode_only=True)
class SelectCanvasMainContent(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 显式选择 Element 的主 Content。-->Select the main Content for Elements."""

    name = "select_canvas_main_content"
    feedback_action_key = "canvas.select_main"

    class Params(ProjectPathParams):
        """批量选择主 Content 参数。"""

        items: list[MainContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """只修改明确选择的 main Content 指针。"""
        try:
            result = await _application(tool_context).select_main(
                params.project_path,
                [item.model_dump() for item in params.items],
            )
            return ToolResult(content=items_content("Canvas main Content selected successfully.", result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="layout_canvas_elements", code_mode_only=True)
class LayoutCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 使用布局策略调整 Element。-->Apply named layout strategies to Elements."""

    name = "layout_canvas_elements"
    feedback_action_key = "canvas.layout"

    class Params(ProjectPathParams):
        """批量布局参数。"""

        items: list[LayoutElementInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行布局策略，不修改 Content 或 Connection。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).layout(params.project_path, payload)
            return ToolResult(content=items_content("Canvas layout updated successfully.", result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="add_canvas_connections", code_mode_only=True)
class AddCanvasConnections(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 新增、删除或替换明确的 Connection。-->Manage explicit Canvas Connections."""

    name = "add_canvas_connections"
    feedback_action_key = "add_canvas_connections"

    class Params(ProjectPathParams):
        """批量 Connection 操作参数。"""

        items: list[ConnectionInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """按明确 ID 管理 Connection。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).connections(params.project_path, payload)
            return ToolResult(content=items_content("Canvas Connections updated successfully.", result), data=result)
        except Exception as error:
            return error_result(error)


@tool(name="wait_canvas_generation", code_mode_only=True)
class WaitCanvasGeneration(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 等待异步生成任务。-->Wait for Canvas generation tasks."""

    name = "wait_canvas_generation"
    feedback_action_key = "canvas.wait_generation"

    class Params(ProjectPathParams):
        """批量等待参数。"""

        tasks: list[WaitTask] = Field(..., min_length=1)
        max_wait_seconds: int = Field(60, ge=1, le=600)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """查询任务状态；超时后继续使用原任务 ID。"""
        try:
            task_ids = [task.generation_task_id for task in params.tasks]
            result = await _application(tool_context).wait(
                params.project_path,
                task_ids,
                params.max_wait_seconds,
                tool_context,
            )
            return ToolResult(content=items_content("Canvas generation status returned.", result), data=result)
        except Exception as error:
            return error_result(error)
