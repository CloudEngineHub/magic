"""把已有音频资源写入画布工具。"""

from pathlib import PurePosixPath
from typing import Any, Dict, Optional
from uuid import uuid4

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.event.event import EventType
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.domain.canvas_document import CanvasElementV3
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.domain.services.element_layout_service import ElementLayoutService
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.utils.async_file_utils import async_exists


class UpsertCanvasAudioParams(BaseToolParams):
    """已有音频节点写入参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    name: str = Field(..., min_length=1, description="Specific Audio Element name in the user's language.")
    src: str = Field(
        ...,
        min_length=1,
        description="Project-relative path to an existing audio file, for example ./audio/narration.mp3.",
    )
    element_id: Optional[str] = Field(
        default=None,
        description="Existing Audio Element ID. Omit to create a new Element.",
    )
    content_id: Optional[str] = Field(
        default=None,
        description="Existing Content ID to update. Omit on an existing Element to append a new candidate Content.",
    )


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class UpsertCanvasAudio(BaseVideoProductionTool[UpsertCanvasAudioParams]):
    """根据项目中的已有音频文件创建或追加 Audio Content。"""

    action_key = "upsert_canvas_audio"
    success_message_key = "upsert_canvas_audio.success"
    failure_message_key = "upsert_canvas_audio.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: UpsertCanvasAudioParams,
    ) -> ToolResult:
        """校验音频路径并写入 Audio Content。"""
        try:
            resolved_path, manager, error_result = await self._get_canvas_manager(
                params.project_path,
                tool_context=tool_context,
            )
            if error_result is not None or resolved_path is None or manager is None:
                return error_result or ToolResult.error("Canvas project validation failed.")
            relative_src = self._normalize_project_relative_src(params.src)
            audio_path = resolved_path / relative_src
            if not await async_exists(audio_path):
                return ToolResult.error(
                    f"Audio file does not exist in the project: {params.src}",
                    extra_info={"error_type": "design.audio_file_not_found"},
                )

            def mutate(config: Any) -> Dict[str, str]:
                """创建或更新 Audio Content。"""
                fields = {"src": f"./{relative_src.as_posix()}"}
                element = config.canvas.get_element(params.element_id) if params.element_id else None
                if params.element_id and element is None:
                    raise ValueError(f"Audio Element does not exist: {params.element_id}")
                if element is None:
                    element_id = params.element_id or f"audio-{uuid4()}"
                    content_id = params.content_id or f"{element_id}-content-{uuid4().hex[:8]}"
                    element = CanvasElementV3(
                        id=element_id,
                        type="audio",
                        properties={"name": params.name},
                        contents=[ElementContent(content_id=content_id, fields=fields)],
                        active_content_id=content_id,
                        main_content_id=content_id,
                    )
                    ElementLayoutService.layout_element(config.canvas, element)
                    config.canvas.elements.append(element)
                else:
                    if element.type != "audio":
                        raise ValueError(f"Element is not an Audio Element: {element.id}")
                    element.properties["name"] = params.name
                    if params.content_id:
                        ContentService.update_content(element, params.content_id, fields)
                        ContentService.switch_active_content(element, params.content_id)
                        content_id = params.content_id
                    else:
                        content_id = f"{element.id}-content-{uuid4().hex[:8]}"
                        ContentService.append_content(
                            element,
                            ElementContent(content_id=content_id, fields=fields),
                            activate=True,
                            set_main_when_empty=True,
                        )
                return {
                    "element_id": element.id,
                    "content_id": content_id,
                    "src": fields["src"],
                }

            result = await manager.run_write_transaction(
                mutate,
                before_write=lambda: self._dispatch_file_event(
                    tool_context,
                    str(self._get_magic_project_js_path(resolved_path)),
                    EventType.BEFORE_FILE_UPDATED,
                ),
                after_write=lambda _: self._dispatch_file_event(
                    tool_context,
                    str(self._get_magic_project_js_path(resolved_path)),
                    EventType.FILE_UPDATED,
                ),
            )
            return ToolResult(
                content=(
                    f'Audio Element "{result["element_id"]}" now references "{result["src"]}". '
                    f'Content ID: "{result["content_id"]}".'
                ),
                data=result,
            )
        except Exception as error:
            return ToolResult.error(
                f"Audio Element update failed: {error}",
                extra_info={"error_type": "design.audio_update_failed"},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在添加的音频名称和文件。"""
        values = arguments or {}
        name = values.get("name") or VideoProductionMarkdownPresenter.message(
            "upsert_canvas_audio.unnamed"
        )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "upsert_canvas_audio.before",
                name=name,
                src=VideoProductionMarkdownPresenter.code(values.get("src")),
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
        """向用户汇总音频节点写入结果。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        remark = (
            VideoProductionMarkdownPresenter.message(
                "upsert_canvas_audio.after_success",
                src=VideoProductionMarkdownPresenter.code(data.get("src")),
            )
            if result.ok
            else VideoProductionMarkdownPresenter.message(
                "upsert_canvas_audio.after_failure",
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
        arguments: Optional[Dict[str, Any]] = None,
    ) -> ToolDetail:
        """以 Markdown 展示音频文件与画布节点信息。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        name = values.get("name") or VideoProductionMarkdownPresenter.message(
            "upsert_canvas_audio.unnamed"
        )
        lines = [
            VideoProductionMarkdownPresenter.message(
                "upsert_canvas_audio.detail_name",
                name=name,
            ),
            VideoProductionMarkdownPresenter.message(
                "upsert_canvas_audio.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            ),
        ]
        if result.ok:
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "upsert_canvas_audio.detail_src",
                        src=VideoProductionMarkdownPresenter.code(data.get("src")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "upsert_canvas_audio.detail_element_id",
                        element_id=VideoProductionMarkdownPresenter.code(data.get("element_id")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "upsert_canvas_audio.detail_content_id",
                        content_id=VideoProductionMarkdownPresenter.code(data.get("content_id")),
                    ),
                ]
            )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "upsert_canvas_audio.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "upsert_canvas_audio.md",
            VideoProductionMarkdownPresenter.message("upsert_canvas_audio.detail_title"),
            lines,
        )

    @staticmethod
    def _normalize_project_relative_src(src: str) -> PurePosixPath:
        """规范化并限制音频路径只能位于当前项目内。"""
        normalized = src.strip().replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        path = PurePosixPath(normalized)
        if path.is_absolute() or not path.parts or ".." in path.parts:
            raise ValueError("src must be a safe project-relative path")
        return path
