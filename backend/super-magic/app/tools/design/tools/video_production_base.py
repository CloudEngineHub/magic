"""视频制作 Code Mode 工具公共基类。"""

from abc import abstractmethod
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Generic, Optional, Tuple, TypeVar

from agentlang.context.tool_context import ToolContext
from agentlang.event.event import EventType
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.tools.base_design_tool import BaseDesignTool

ParamsT = TypeVar("ParamsT", bound=BaseToolParams)
ResultT = TypeVar("ResultT")
logger = get_logger(__name__)


class BaseVideoProductionTool(BaseDesignTool[ParamsT], Generic[ParamsT]):
    """统一视频制作工具的画布事务入口，并约束具体工具实现独立展示。"""

    async def _get_canvas_manager(
        self,
        project_path: str,
        tool_context: Optional[ToolContext] = None,
    ) -> Tuple[Optional[Path], Optional[CanvasManagerProtocol], Optional[ToolResult]]:
        """校验项目并返回按项目数据格式选择的统一 Manager。"""
        resolved_path, error_result = await self._ensure_project_ready(
            project_path,
            require_magic_project_js=True,
            tool_context=tool_context,
        )
        if error_result is not None:
            return None, None, error_result
        try:
            manager = await get_canvas_manager(str(resolved_path))
        except Exception as error:
            logger.warning(f"Unable to resolve the canvas data handler: {error}")
            return (
                resolved_path,
                None,
                ToolResult.error(
                    "The canvas data could not be read by the available project handler.",
                    extra_info={"error_type": "design.canvas_data_unreadable"},
                ),
            )
        return resolved_path, manager, None

    async def _run_canvas_write(
        self,
        tool_context: ToolContext,
        project_path: str,
        mutator: Callable[[Any], ResultT | Awaitable[ResultT]],
        verifier: Optional[Callable[[Any, ResultT], bool]] = None,
    ) -> Tuple[Optional[ResultT], Optional[ToolResult]]:
        """在当前画布格式对应的 Manager 事务内写入，并派发标准文件更新事件。"""
        resolved_path, manager, error_result = await self._get_canvas_manager(
            project_path,
            tool_context=tool_context,
        )
        if error_result is not None or resolved_path is None or manager is None:
            return None, error_result
        config_file = self._get_magic_project_js_path(resolved_path)
        result = await manager.run_write_transaction(
            mutator,
            verify_content=verifier,
            before_write=lambda: self._dispatch_file_event(
                tool_context,
                str(config_file),
                EventType.BEFORE_FILE_UPDATED,
            ),
            after_write=lambda _: self._dispatch_file_event(
                tool_context,
                str(config_file),
                EventType.FILE_UPDATED,
            ),
        )
        return result, None

    @abstractmethod
    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """返回当前具体工具执行前的 Markdown 动作和说明。"""

    @abstractmethod
    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """返回当前具体工具执行后的 Markdown 动作和结果说明。"""

    @abstractmethod
    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> ToolDetail:
        """返回当前具体工具的 Markdown 用户详情。"""
