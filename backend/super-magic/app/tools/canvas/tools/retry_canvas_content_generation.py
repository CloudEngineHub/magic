"""重试 Canvas Content 生成工具。"""

from typing import Any, Literal

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.application.commands import GenerationParametersOverride, RetryContentCommand
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.tools.add_canvas_elements import VideoInputMode
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool


class GenerationOverrideInput(BaseToolParams):
    """失败生成重试允许覆盖的确定参数。"""

    model_config = ConfigDict(extra="forbid")

    prompt: str | None = Field(None, min_length=1)
    model_id: str | None = None
    estimate_id: str | None = None
    name: str | None = None
    size: str | None = None
    reference_images: list[str] | None = None
    reference_image_paths: list[str] | None = None
    reference_video_paths: list[str] | None = None
    reference_audio_paths: list[str] | None = None
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    input_mode: VideoInputMode | None = None
    task: Literal["generate", "edit"] | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None

    def to_command(self) -> GenerationParametersOverride:
        """只转换本次明确填写的覆盖字段。"""
        values = self.model_dump(exclude_none=True)
        provided_fields = frozenset(values)
        for field_name in ("reference_images", "reference_image_paths", "reference_video_paths", "reference_audio_paths"):
            if field_name in values:
                values[field_name] = tuple(values[field_name])
        return GenerationParametersOverride(
            prompt=values.get("prompt"),
            model_id=values.get("model_id"),
            estimate_id=values.get("estimate_id"),
            name=values.get("name"),
            size=values.get("size"),
            reference_images=values.get("reference_images"),
            reference_image_paths=values.get("reference_image_paths"),
            reference_video_paths=values.get("reference_video_paths"),
            reference_audio_paths=values.get("reference_audio_paths"),
            frame_start_path=values.get("frame_start_path"),
            frame_end_path=values.get("frame_end_path"),
            input_mode=values.get("input_mode"),
            task=values.get("task"),
            duration_seconds=values.get("duration_seconds"),
            aspect_ratio=values.get("aspect_ratio"),
            resolution=values.get("resolution"),
            fps=values.get("fps"),
            seed=values.get("seed"),
            watermark=values.get("watermark"),
            _provided_fields=provided_fields,
        )


class RetryContentInput(BaseToolParams):
    """单个失败 Content 重试参数。"""

    model_config = ConfigDict(extra="forbid")

    item_ref: str = Field(..., min_length=1)
    element_id: str = Field(..., min_length=1)
    content_id: str = Field(..., min_length=1)
    generation_override: GenerationOverrideInput | None = None

    def to_command(self) -> RetryContentCommand:
        """转换为应用层失败 Content 重试命令。"""
        return RetryContentCommand(
            item_ref=self.item_ref,
            element_id=self.element_id,
            content_id=self.content_id,
            generation_override=self.generation_override.to_command() if self.generation_override else None,
        )


@tool(name="retry_canvas_content_generation", code_mode_only=True)
class RetryCanvasContentGeneration(BaseTool[BaseToolParams]):
    """<!--zh: 重试失败的 generated Content。-->Retry failed generated Content."""

    name = "retry_canvas_content_generation"
    feedback_action_key = "canvas.retry_generation"

    class Params(BaseToolParams):
        """批量生成重试参数。"""

        model_config = ConfigDict(extra="forbid")

        project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
        items: list[RetryContentInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成失败 Content 重试前的受控反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        project_path = args.get("project_path", "")
        remark = f"{project_path} · retrying {len(items)} failed Content item(s)" if project_path else f"retrying {len(items)} failed Content item(s)"
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
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
        """生成重试结果和失败上限反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            limited = sum(1 for item in values if item.get("error_code") == "CONTENT_RETRY_LIMIT_REACHED")
            remark = f"Retried {len(values) - limited} Content item(s)."
            if limited:
                remark += f" {limited} item(s) reached the retry limit."
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成重试工具自己的任务详情。"""
        data = result.data or {}
        lines = [
            "Canvas Content retry",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"element_id={item.get('element_id', '-')} | content_id={item.get('content_id', '-')} | "
                f"task_id={item.get('generation_task_id', '-') }"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """在重试上限内复用原 Content ID。"""
        try:
            result = await _application(tool_context).retry_content(
                params.project_path,
                [item.to_command() for item in params.items],
                tool_context=tool_context,
            )
            return ToolResult(
                content=items_content(
                    "Canvas failed Content retry started.",
                    result.to_dict(),
                    "call query_canvas_element_details with the returned element_id values to verify the retried Content",
                ),
                data=result.to_dict(),
            )
        except Exception as error:
            return error_result(error)
