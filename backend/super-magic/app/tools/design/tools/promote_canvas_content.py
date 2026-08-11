"""确认并设置主 Content 工具。"""

from typing import Any, Optional

from pydantic import ConfigDict, Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)


class PromoteCanvasContentParams(BaseToolParams):
    """提升 main Content 的参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    element_id: str = Field(..., description="Element whose confirmed Content becomes main.")
    content_id: Optional[str] = Field(
        default=None,
        description="Confirmed Content ID. Omit to promote the current active Content.",
    )
    confirmed_by_user: bool = Field(
        ...,
        description="Must be true only after the user explicitly confirmed this generated result.",
    )
    confirmation_text: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Short excerpt or summary of the user's explicit confirmation.",
    )

    @model_validator(mode="after")
    def validate_confirmation(self) -> "PromoteCanvasContentParams":
        """拒绝缺少用户明确确认的提升请求。"""
        if not self.confirmed_by_user:
            raise ValueError("confirmed_by_user must be true after explicit user confirmation")
        return self


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class PromoteCanvasContent(BaseVideoProductionTool[PromoteCanvasContentParams]):
    """将用户明确确认的候选 Content 设为 Element 的主内容。"""

    action_key = "promote_canvas_content"
    success_message_key = "promote_canvas_content.success"
    failure_message_key = "promote_canvas_content.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: PromoteCanvasContentParams,
    ) -> ToolResult:
        """在单次画布写事务内提升指定 Content。"""

        def promote(config: Any) -> dict[str, str]:
            """定位 Element 并更新 mainContentId。"""
            element = config.canvas.get_element(params.element_id)
            if element is None:
                raise ValueError(f"Element does not exist: {params.element_id}")
            content_id = params.content_id or element.active_content_id
            if content_id is None:
                raise ValueError(f"Element has no active Content: {params.element_id}")
            ContentService.set_main_content(element, content_id)
            return {"element_id": element.id, "content_id": content_id}

        try:
            result, error_result = await self._run_canvas_write(
                tool_context,
                params.project_path,
                promote,
                verifier=lambda config, promoted: (
                    config.canvas.get_element(promoted["element_id"]) is not None
                    and config.canvas.get_element(promoted["element_id"]).main_content_id
                    == promoted["content_id"]
                ),
            )
            if error_result is not None:
                return error_result
            assert result is not None
            return ToolResult(
                content=(
                    f'Confirmed Content "{result["content_id"]}" is now the main Content '
                    f'for Element "{result["element_id"]}".'
                ),
                data=result,
            )
        except Exception as error:
            return ToolResult.error(
                f"Content promotion failed: {error}",
                extra_info={"error_type": "design.content_promotion_failed"},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[dict[str, Any]] = None,
    ) -> dict[str, str]:
        """向用户说明正在确认哪个候选 Content。"""
        values = arguments or {}
        target_value = values.get("content_id") or VideoProductionMarkdownPresenter.message(
            "promote_canvas_content.active_content"
        )
        target = VideoProductionMarkdownPresenter.code(target_value)
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "promote_canvas_content.before",
                element_id=VideoProductionMarkdownPresenter.code(values.get("element_id")),
                content_id=target,
            ),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Optional[dict[str, Any]] = None,
    ) -> dict[str, str]:
        """向用户汇总 Content 提升结果。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        remark = (
            VideoProductionMarkdownPresenter.message(
                "promote_canvas_content.after_success",
                content_id=VideoProductionMarkdownPresenter.code(data.get("content_id")),
            )
            if result.ok
            else VideoProductionMarkdownPresenter.message(
                "promote_canvas_content.after_failure",
                failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
            )
        )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": remark,
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: Optional[dict[str, Any]] = None,
    ) -> ToolDetail:
        """以 Markdown 展示用户确认后的主内容变更。"""
        data = VideoProductionMarkdownPresenter.result_data(result)
        lines = [
            VideoProductionMarkdownPresenter.message(
                "promote_canvas_content.detail_project",
                project=VideoProductionMarkdownPresenter.code((arguments or {}).get("project_path")),
            ),
            VideoProductionMarkdownPresenter.message(
                "promote_canvas_content.detail_element_id",
                element_id=VideoProductionMarkdownPresenter.code(
                    data.get("element_id") or (arguments or {}).get("element_id")
                ),
            ),
        ]
        if result.ok:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "promote_canvas_content.detail_main_content_id",
                    content_id=VideoProductionMarkdownPresenter.code(data.get("content_id")),
                )
            )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "promote_canvas_content.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "promote_canvas_content.md",
            VideoProductionMarkdownPresenter.message("promote_canvas_content.detail_title"),
            lines,
        )
