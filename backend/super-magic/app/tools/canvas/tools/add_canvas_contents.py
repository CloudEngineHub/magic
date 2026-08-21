"""追加 Canvas Content 工具。"""

from typing import Any

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.canvas.application.commands import AddContentCommand
from app.tools.canvas.presentation import (
    CanvasGenerationFeedback,
    CanvasToolDetailBuilder,
    canvas_remark,
    error_result,
    items_content,
)
from app.tools.canvas.tools.add_canvas_elements import ContentInput
from app.tools.canvas.tools.agent_write_policy import CanvasAgentWritePolicy
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool


class AddContentInput(BaseToolParams):
    """单个追加 Content 参数。"""

    model_config = ConfigDict(extra="forbid")

    item_ref: str = Field(..., min_length=1)
    element_id: str = Field(..., min_length=1)
    content: ContentInput

    def to_command(self) -> AddContentCommand:
        """转换为应用层追加 Content 命令。"""
        return AddContentCommand(
            item_ref=self.item_ref,
            element_id=self.element_id,
            content=self.content.to_command(),
        )


@tool(name="add_canvas_contents", code_mode_only=True)
class AddCanvasContents(BaseTool[BaseToolParams]):
    """<!--zh: 向已有 Element 追加 Content。-->Add Content versions to existing Elements."""

    name = "add_canvas_contents"
    feedback_action_key = "add_canvas_contents"

    class Params(BaseToolParams):
        """批量追加 Content 参数。"""

        model_config = ConfigDict(extra="forbid")

        project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
        items: list[AddContentInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成追加 Content 前的来源反馈。"""
        args = arguments or {}
        generation_summary = CanvasGenerationFeedback.from_arguments(args)
        if CanvasGenerationFeedback.is_pure_generated_batch(args):
            return {
                "action": i18n.translate(
                    CanvasGenerationFeedback.action_key(generation_summary, pending=True),
                    category="tool.actions",
                ),
                "remark": CanvasGenerationFeedback.remark(generation_summary, pending=True),
                "tool_name": tool_name,
            }
        items = args.get("items") or []
        sources = {
            str(item.get("content", {}).get("source"))
            for item in items
            if isinstance(item, dict) and isinstance(item.get("content"), dict)
        }
        action_key = "canvas.add_generated_content" if sources == {"generated"} else (
            "canvas.import_content" if sources == {"imported"} else self.feedback_action_key
        )
        project_path = args.get("project_path", "")
        remark = canvas_remark("canvas.add_contents_pending", project_path, total=len(items))
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
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
        """生成追加 Content 后的逐项反馈。"""
        generation_summary = CanvasGenerationFeedback.from_arguments(arguments)
        if not result.ok:
            if CanvasGenerationFeedback.is_pure_generated_batch(arguments):
                return {
                    "action": i18n.translate(
                        CanvasGenerationFeedback.action_key(generation_summary),
                        category="tool.actions",
                    ),
                    "remark": CanvasGenerationFeedback.failure_remark(generation_summary),
                }
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            generation_summary = CanvasGenerationFeedback.from_result(result, arguments)
            if CanvasGenerationFeedback.is_pure_generated_batch(arguments) and generation_summary.is_supported:
                return {
                    "action": i18n.translate(
                        CanvasGenerationFeedback.action_key(generation_summary),
                        category="tool.actions",
                    ),
                    "remark": CanvasGenerationFeedback.remark(generation_summary),
                }
            succeeded = sum(
                1
                for item in values
                if item.get("status") in {"added", "completed", "pending", "processing"}
            )
            remark = canvas_remark("canvas.add_contents_result", succeeded=succeeded, total=len(values))
        args = arguments or {}
        sources = {
            str(item.get("content", {}).get("source"))
            for item in args.get("items", [])
            if isinstance(item, dict) and isinstance(item.get("content"), dict)
        }
        action_key = "canvas.add_generated_content" if sources == {"generated"} else (
            "canvas.import_content" if sources == {"imported"} else self.feedback_action_key
        )
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成追加 Content 自己的版本详情。"""
        data = result.data or {}
        generation_summary = CanvasGenerationFeedback.from_result(result, arguments)
        is_generation_batch = (
            CanvasGenerationFeedback.is_pure_generated_batch(arguments) and generation_summary.is_supported
        )
        title_key = (
            CanvasGenerationFeedback.detail_title_key(generation_summary)
            if is_generation_batch
            else "content_versions_added"
        )
        builder = CanvasToolDetailBuilder(self.name, title_key, result, arguments)
        builder.add_field("project_path", data.get("project_path") or builder.arguments.get("project_path") or "-")
        if is_generation_batch:
            builder.add_field("media_type", generation_summary.media_label())
            for media_type in generation_summary.media_types:
                counts = generation_summary.by_type[media_type]
                builder.add_item(
                    {
                        "media_type": CanvasGenerationFeedback.media_label_for_type(media_type),
                        "total": counts.total,
                        "completed": counts.completed,
                        "processing": counts.processing,
                        "failed": counts.failed,
                    }
                )
        for item in data.get("items", []):
            media_type = CanvasGenerationFeedback.media_type_for_item(item, arguments)
            builder.add_item(
                {
                    "item_ref": item.get("item_ref", "-"),
                    "status": item.get("status", "-"),
                    "element_id": item.get("element_id", "-"),
                    "content_id": item.get("content_id", "-"),
                    **({"media_type": CanvasGenerationFeedback.media_label_for_type(media_type)} if media_type else {}),
                }
            )
        return builder.build()

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """追加 Content 版本，不覆盖已有版本。"""
        try:
            application = _application(tool_context)
            commands = [item.to_command() for item in params.items]
            await CanvasAgentWritePolicy.validate_targets(application.repository, params.project_path, commands)
            result = await application.add_contents(
                params.project_path,
                commands,
                tool_context=tool_context,
            )
            return ToolResult(
                content=items_content(
                    "Canvas Content versions added successfully.",
                    result.to_dict(),
                    "call query_canvas_element_details with the returned element_id values to verify the Content versions",
                ),
                data=result.to_dict(),
            )
        except Exception as error:
            return error_result(error)
