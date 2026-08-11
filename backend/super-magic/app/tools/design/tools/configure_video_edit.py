"""创建或配置视频编辑计划工具。"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.domain.canvas_document import CanvasConnection, CanvasElementV3
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.canvas_id_generator import CanvasIdGenerator
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.domain.services.element_layout_service import ElementLayoutService
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.tools.design.video_production.service.video_production_layout_service import (
    VideoProductionLayoutService,
)


class VideoEditOutputInput(BaseModel):
    """首版视频编辑输出配置。"""

    model_config = ConfigDict(extra="forbid")

    aspect_ratio: Optional[str] = Field(default=None, description="Output aspect ratio, for example 9:16.")
    resolution: Optional[str] = Field(default=None, description="Output resolution, for example 1080P.")
    format: Literal["mp4"] = Field(default="mp4", description="Output format. The first release supports mp4 only.")


class ConfigureVideoEditParams(BaseToolParams):
    """Video Edit 写入参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    name: str = Field(..., min_length=1, description="Specific Video Edit Element name in the user's language.")
    video_sequence: List[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Ordered Video Element IDs. This array is the composition order source of truth.",
    )
    audio_sequence: List[str] = Field(
        default_factory=list,
        max_length=1,
        description="Optional Audio Element ID. The first release accepts at most one audio input.",
    )
    output: VideoEditOutputInput = Field(default_factory=VideoEditOutputInput)
    element_id: Optional[str] = Field(
        default=None,
        description="Existing Video Edit Element ID. Omit to create a new Element.",
    )
    content_id: Optional[str] = Field(
        default=None,
        description="Existing Content ID to update. Omit on an existing Element to append a new candidate Content.",
    )

    @field_validator("video_sequence", "audio_sequence")
    @classmethod
    def validate_unique_sequence(cls, values: List[str]) -> List[str]:
        """拒绝空 ID 和重复序列项。"""
        if any(not value.strip() for value in values):
            raise ValueError("sequence IDs must not be empty")
        if len(set(values)) != len(values):
            raise ValueError("sequence IDs must be unique")
        return values


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class ConfigureVideoEdit(BaseVideoProductionTool[ConfigureVideoEditParams]):
    """创建或追加 Video Edit Element，并保存有序媒体输入。"""

    action_key = "configure_video_edit"
    success_message_key = "configure_video_edit.success"
    failure_message_key = "configure_video_edit.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: ConfigureVideoEditParams,
    ) -> ToolResult:
        """写入顺序配置并确保媒体输入 Connection 存在。"""

        def mutate(config: Any) -> Dict[str, Any]:
            """创建或更新 Video Edit Content 与输入连接。"""
            for element_id in params.video_sequence:
                element = config.canvas.get_element(element_id)
                if element is None or element.type != "video":
                    raise ValueError(f"video_sequence must reference a Video Element: {element_id}")
            for element_id in params.audio_sequence:
                element = config.canvas.get_element(element_id)
                if element is None or element.type != "audio":
                    raise ValueError(f"audio_sequence must reference an Audio Element: {element_id}")

            output = {
                **({"aspectRatio": params.output.aspect_ratio} if params.output.aspect_ratio else {}),
                **({"resolution": params.output.resolution} if params.output.resolution else {}),
                "format": params.output.format,
            }
            fields: Dict[str, Any] = {
                "videoSequence": list(params.video_sequence),
                "audioSequence": list(params.audio_sequence),
                "output": output,
            }
            element = config.canvas.get_element(params.element_id) if params.element_id else None
            creating_element = element is None
            if params.element_id and element is None:
                raise ValueError(f"Video Edit Element does not exist: {params.element_id}")
            if element is None:
                element_id = params.element_id or CanvasIdGenerator.generate_element_id()
                content_id = params.content_id or CanvasIdGenerator.generate_initial_content_id(
                    element_id
                )
                element = CanvasElementV3(
                    id=element_id,
                    type="video-edit",
                    properties={"name": params.name},
                    contents=[ElementContent(content_id=content_id, fields=fields)],
                    active_content_id=content_id,
                    main_content_id=content_id,
                )
                ElementLayoutService.layout_element(config.canvas, element)
                config.canvas.elements.append(element)
            else:
                if element.type != "video-edit":
                    raise ValueError(f"Element is not a Video Edit Element: {element.id}")
                element.properties["name"] = params.name
                if params.content_id:
                    ContentService.update_content(element, params.content_id, fields)
                    ContentService.switch_active_content(element, params.content_id)
                    content_id = params.content_id
                else:
                    content_id = CanvasIdGenerator.generate_content_id(
                        element.id,
                        [content.content_id for content in element.contents],
                    )
                    ContentService.append_content(
                        element,
                        ElementContent(content_id=content_id, fields=fields),
                        activate=True,
                        set_main_when_empty=True,
                    )

            desired_connections: Dict[str, CanvasConnection] = {}
            for input_element_id in [*params.video_sequence, *params.audio_sequence]:
                desired_connections[input_element_id] = CanvasConnection(
                    id=CanvasIdGenerator.generate_connection_id(),
                    source_element_id=input_element_id,
                    target_element_id=element.id,
                    locked=True,
                )
            connections = ConnectionService.reconcile_locked_connections(
                config.canvas,
                desired_connections.values(),
                owner_element_id=element.id,
                direction="incoming",
                counterpart_types={"video", "audio"},
            )
            if creating_element:
                VideoProductionLayoutService.layout_new_elements(
                    config.canvas,
                    [element.id],
                )
            connection_ids = [connection.id for connection in connections]
            return {
                "element_id": element.id,
                "content_id": content_id,
                "video_sequence": list(params.video_sequence),
                "audio_sequence": list(params.audio_sequence),
                "connection_ids": connection_ids,
                "output": output,
            }

        try:
            result, error_result = await self._run_canvas_write(
                tool_context,
                params.project_path,
                mutate,
            )
            if error_result is not None:
                return error_result
            assert result is not None
            output = result["output"]
            output_parts = [
                *(
                    [f'aspect_ratio="{output["aspectRatio"]}"']
                    if output.get("aspectRatio")
                    else []
                ),
                *(
                    [f'resolution="{output["resolution"]}"']
                    if output.get("resolution")
                    else []
                ),
                f'format="{output["format"]}"',
            ]
            return ToolResult(
                content=(
                    f'Video Edit Element "{result["element_id"]}" now contains '
                    f'{len(result["video_sequence"])} ordered video input(s) and '
                    f'{len(result["audio_sequence"])} audio input(s).\n'
                    f'- content_id: "{result["content_id"]}"\n'
                    f'- Output: {", ".join(output_parts)}'
                ),
                data=result,
            )
        except Exception as error:
            return ToolResult.error(
                f"Video Edit configuration failed: {error}",
                extra_info={"error_type": "design.video_edit_update_failed"},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在配置的成片名称和媒体数量。"""
        values = arguments or {}
        video_count = len(values.get("video_sequence") or [])
        audio_count = len(values.get("audio_sequence") or [])
        name = values.get("name") or VideoProductionMarkdownPresenter.message(
            "configure_video_edit.unnamed"
        )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "configure_video_edit.before",
                name=name,
                video_count=video_count,
                audio_count=audio_count,
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
        """向用户汇总成片顺序配置结果。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        remark = (
            VideoProductionMarkdownPresenter.message(
                "configure_video_edit.after_success",
                video_count=len(data.get("video_sequence") or []),
                audio_count=len(data.get("audio_sequence") or []),
            )
            if result.ok
            else VideoProductionMarkdownPresenter.message(
                "configure_video_edit.after_failure",
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
        """以 Markdown 展示成片输入顺序和输出规格。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        name = values.get("name") or VideoProductionMarkdownPresenter.message(
            "configure_video_edit.unnamed"
        )
        lines = [
            VideoProductionMarkdownPresenter.message(
                "configure_video_edit.detail_name",
                name=name,
            ),
            VideoProductionMarkdownPresenter.message(
                "configure_video_edit.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            ),
        ]
        if result.ok:
            output = data.get("output") or {}
            unspecified = VideoProductionMarkdownPresenter.message(
                "configure_video_edit.unspecified"
            )
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_element_id",
                        element_id=VideoProductionMarkdownPresenter.code(data.get("element_id")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_content_id",
                        content_id=VideoProductionMarkdownPresenter.code(data.get("content_id")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_video_count",
                        count=len(data.get("video_sequence") or []),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_audio_count",
                        count=len(data.get("audio_sequence") or []),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_aspect_ratio",
                        value=VideoProductionMarkdownPresenter.code(
                            output.get("aspectRatio") or unspecified
                        ),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_resolution",
                        value=VideoProductionMarkdownPresenter.code(
                            output.get("resolution") or unspecified
                        ),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "configure_video_edit.detail_format",
                        value=VideoProductionMarkdownPresenter.code(output.get("format") or "mp4"),
                    ),
                ]
            )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "configure_video_edit.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "configure_video_edit.md",
            VideoProductionMarkdownPresenter.message("configure_video_edit.detail_title"),
            lines,
        )
