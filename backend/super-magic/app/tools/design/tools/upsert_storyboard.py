"""创建或更新视频分镜工具。"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
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
from app.tools.design.video_production.service.storyboard_generation_config_service import (
    StoryboardGenerationConfig,
    StoryboardGenerationConfigService,
)
from app.tools.design.video_production.service.video_production_layout_service import (
    VideoProductionLayoutService,
)


class StoryboardShotInput(BaseModel):
    """分镜镜头输入。"""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, description="Stable shot ID.")
    duration_seconds: float = Field(..., gt=0, description="Shot duration in seconds.")
    description: str = Field(..., min_length=1, description="Visual description for this shot.")
    output_image_element_id: Optional[str] = Field(
        default=None,
        description="Existing or planned Image Element ID produced for this shot.",
    )


class StoryboardGenerationConfigInput(BaseModel):
    """分镜统一图片生成配置。"""

    model_config = ConfigDict(extra="forbid")

    image_model_id: Optional[str] = Field(
        default=None,
        description="Image model ID. Omit to use the user's current image model.",
    )
    aspect_ratio: str = Field(
        ...,
        description="Image aspect ratio in W:H format, for example 9:16.",
    )
    resolution: str = Field(
        ...,
        description="Image resolution tier supported by the selected image model, for example 1K or 2K.",
    )


class UpsertStoryboardParams(BaseToolParams):
    """Storyboard 写入参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    name: str = Field(..., min_length=1, description="Specific storyboard Element name in the user's language.")
    shots: List[StoryboardShotInput] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Ordered storyboard shots.",
    )
    generation_config: Optional[StoryboardGenerationConfigInput] = Field(
        default=None,
        description=(
            "Image generation configuration shared by all shots. Required when creating a new Storyboard; "
            "omit when updating an existing Storyboard to preserve its current configuration."
        ),
    )
    visual_anchor_element_ids: Optional[List[str]] = Field(
        default=None,
        max_length=20,
        description=(
            "Confirmed visual anchor Image Element IDs that the storyboard should follow. "
            "Omit on update to preserve the current anchors; pass an empty list to clear them."
        ),
    )
    replace_all_shots: bool = Field(
        default=False,
        description=(
            "Replace the complete shot list instead of merging the supplied shots by ID. "
            "Use only when the confirmed storyboard intentionally removes or reorders shots."
        ),
    )
    element_id: Optional[str] = Field(
        default=None,
        description="Existing Storyboard Element ID. Omit to create a new Element.",
    )
    content_id: Optional[str] = Field(
        default=None,
        description="Existing Content ID to update. Omit on an existing Element to append a new candidate Content.",
    )

    @model_validator(mode="after")
    def validate_create_generation_config(self) -> "UpsertStoryboardParams":
        """确保新建分镜时同时保存统一的图片生成配置。"""
        if self.element_id is None and self.generation_config is None:
            raise ValueError("generation_config is required when creating a storyboard")
        return self


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class UpsertStoryboard(BaseVideoProductionTool[UpsertStoryboardParams]):
    """创建 Storyboard Element，或追加、更新其 Content。"""

    action_key = "upsert_storyboard"
    success_message_key = "upsert_storyboard.success"
    failure_message_key = "upsert_storyboard.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: UpsertStoryboardParams,
    ) -> ToolResult:
        """写入 Storyboard Content，并确保镜头输出连接存在。"""

        requested_generation_config: Optional[StoryboardGenerationConfig] = None
        if params.generation_config is not None:
            requested_generation_config = StoryboardGenerationConfigService.resolve_for_write(
                tool_context,
                image_model_id=params.generation_config.image_model_id,
                aspect_ratio=params.generation_config.aspect_ratio,
                resolution=params.generation_config.resolution,
            )

        def mutate(config: Any) -> Dict[str, Any]:
            """创建或更新 Storyboard 及其锁定输出连接。"""
            element = config.canvas.get_element(params.element_id) if params.element_id else None
            creating_element = element is None
            if params.element_id and element is None:
                raise ValueError(f"Storyboard Element does not exist: {params.element_id}")

            existing_content = None
            if element is not None:
                existing_content = (
                    element.get_content(params.content_id)
                    if params.content_id
                    else element.get_active_content()
                )

            effective_generation_config = requested_generation_config
            previous_generation_config = None
            if existing_content is not None:
                previous_generation_config = (
                    StoryboardGenerationConfigService.parse_optional_storage_config(
                        existing_content.fields.get("generationConfig"),
                        tool_context,
                    )
                )
            if effective_generation_config is not None:
                effective_generation_config = (
                    StoryboardGenerationConfigService.preserve_image_generation_options(
                        effective_generation_config,
                        previous_generation_config,
                    )
                )
            elif previous_generation_config is not None:
                effective_generation_config = previous_generation_config
            if effective_generation_config is None:
                raise ValueError("Storyboard image generation config is unavailable")

            incoming_shots = [self._serialize_shot(shot) for shot in params.shots]
            existing_shots = (
                existing_content.fields.get("shots", [])
                if existing_content is not None
                else []
            )
            effective_shots = self._merge_shots(
                existing_shots,
                params.shots,
                replace_all=params.replace_all_shots or creating_element,
            )
            fields: Dict[str, Any] = {
                "shots": effective_shots or incoming_shots,
                "generationConfig": effective_generation_config.to_storage(),
            }
            if element is None:
                element_id = params.element_id or CanvasIdGenerator.generate_element_id()
                content_id = params.content_id or CanvasIdGenerator.generate_initial_content_id(
                    element_id
                )
                element = CanvasElementV3(
                    id=element_id,
                    type="storyboard",
                    properties={"name": params.name},
                    contents=[ElementContent(content_id=content_id, fields=fields)],
                    active_content_id=content_id,
                    main_content_id=content_id,
                )
                ElementLayoutService.layout_element(config.canvas, element)
                config.canvas.elements.append(element)
            else:
                if element.type != "storyboard":
                    raise ValueError(f"Element is not a storyboard: {element.id}")
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

            desired_output_connections: Dict[str, CanvasConnection] = {}
            existing_anchor_ids = {
                connection.source_element_id
                for connection in config.canvas.connections
                if connection.locked and connection.target_element_id == element.id
            }
            requested_anchor_ids = {
                anchor_id
                for anchor_id in (params.visual_anchor_element_ids or [])
                if isinstance(anchor_id, str)
            }
            visual_anchor_ids = (
                requested_anchor_ids
                if params.visual_anchor_element_ids is not None
                else existing_anchor_ids
            )
            for shot in fields["shots"]:
                output_image_element_id = shot.get("outputImageElementId")
                if not output_image_element_id:
                    continue
                if output_image_element_id in visual_anchor_ids:
                    raise ValueError(
                        i18n.translate(
                            "upsert_storyboard.anchor_cannot_be_output",
                            category="tool.messages",
                            element_id=output_image_element_id,
                        )
                    )
                output_element = config.canvas.get_element(output_image_element_id)
                if output_element is None or output_element.type != "image":
                    raise ValueError(
                        f"Storyboard output must reference an Image Element: {output_image_element_id}"
                    )
                desired_output_connections[output_element.id] = CanvasConnection(
                    id=CanvasIdGenerator.generate_connection_id(),
                    source_element_id=element.id,
                    target_element_id=output_element.id,
                    locked=True,
                )
            output_connections = ConnectionService.reconcile_locked_connections(
                config.canvas,
                desired_output_connections.values(),
                owner_element_id=element.id,
                direction="outgoing",
                counterpart_types={"image"},
            )

            should_update_anchors = creating_element or params.visual_anchor_element_ids is not None
            if should_update_anchors:
                visual_anchor_ids = list(dict.fromkeys(params.visual_anchor_element_ids or []))
                desired_anchor_connections: List[CanvasConnection] = []
                for visual_anchor_id in visual_anchor_ids:
                    visual_anchor = config.canvas.get_element(visual_anchor_id)
                    if visual_anchor is None or visual_anchor.type != "image":
                        raise ValueError(
                            f"Storyboard visual anchor must reference an Image Element: {visual_anchor_id}"
                        )
                    desired_anchor_connections.append(
                        CanvasConnection(
                            id=CanvasIdGenerator.generate_connection_id(),
                            source_element_id=visual_anchor.id,
                            target_element_id=element.id,
                            locked=True,
                        )
                    )
                anchor_connections = ConnectionService.reconcile_locked_connections(
                    config.canvas,
                    desired_anchor_connections,
                    owner_element_id=element.id,
                    direction="incoming",
                    counterpart_types={"image"},
                )
            else:
                anchor_connections = []
                for connection in config.canvas.connections:
                    if not connection.locked or connection.target_element_id != element.id:
                        continue
                    source = config.canvas.get_element(connection.source_element_id)
                    if source is not None and source.type == "image":
                        anchor_connections.append(connection)
            if creating_element:
                VideoProductionLayoutService.layout_new_elements(
                    config.canvas,
                    [element.id],
                )
            connection_ids = [
                connection.id
                for connection in [*output_connections, *anchor_connections]
            ]
            return {
                "element_id": element.id,
                "content_id": content_id,
                "connection_ids": connection_ids,
                "shot_count": len(fields["shots"]),
                "output_shot_count": sum(
                    1
                    for shot in fields["shots"]
                    if isinstance(shot.get("outputImageElementId"), str)
                ),
                "generation_config": effective_generation_config.to_result_data(),
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
            return ToolResult(
                content=self._build_result_content(params.name, result),
                data=result,
            )
        except Exception as error:
            return ToolResult.error(
                i18n.translate(
                    "upsert_storyboard.update_failed",
                    category="tool.messages",
                    error=error,
                ),
                extra_info={"error_type": "design.storyboard_update_failed"},
            )

    @staticmethod
    def _serialize_shot(shot: StoryboardShotInput) -> Dict[str, Any]:
        """把单个镜头输入转换为画布存储字段。"""
        value: Dict[str, Any] = {
            "id": shot.id,
            "durationSeconds": shot.duration_seconds,
            "description": shot.description,
        }
        if shot.output_image_element_id:
            value["outputImageElementId"] = shot.output_image_element_id
        return value

    @classmethod
    def _merge_shots(
        cls,
        existing_shots: Any,
        incoming_shots: List[StoryboardShotInput],
        *,
        replace_all: bool,
    ) -> List[Dict[str, Any]]:
        """按镜头 ID 合并局部更新，显式全量替换时使用输入顺序。"""
        if replace_all or not isinstance(existing_shots, list):
            return [cls._serialize_shot(shot) for shot in incoming_shots]

        incoming_by_id = {shot.id: shot for shot in incoming_shots}
        merged: List[Dict[str, Any]] = []
        existing_ids: set[str] = set()
        for raw_shot in existing_shots:
            if not isinstance(raw_shot, dict) or not isinstance(raw_shot.get("id"), str):
                raise ValueError("Stored storyboard shot must be an object with an ID")
            shot_id = raw_shot["id"]
            existing_ids.add(shot_id)
            incoming = incoming_by_id.get(shot_id)
            if incoming is None:
                merged.append(dict(raw_shot))
                continue
            updated = {
                **raw_shot,
                "durationSeconds": incoming.duration_seconds,
                "description": incoming.description,
            }
            if "output_image_element_id" in incoming.model_fields_set:
                if incoming.output_image_element_id:
                    updated["outputImageElementId"] = incoming.output_image_element_id
                else:
                    updated.pop("outputImageElementId", None)
            merged.append(updated)

        merged.extend(
            cls._serialize_shot(shot)
            for shot in incoming_shots
            if shot.id not in existing_ids
        )
        return merged

    @staticmethod
    def _build_result_content(name: str, result: Dict[str, Any]) -> str:
        """构造包含后续调用所需 ID 和实际图片设置的模型结果。"""
        generation_config = result["generation_config"]
        return (
            i18n.translate(
                "upsert_storyboard.result_saved",
                category="tool.messages",
                name=name,
                shot_count=result["shot_count"],
            )
            + "\n"
            f'- element_id: "{result["element_id"]}"\n'
            f'- content_id: "{result["content_id"]}"\n'
            f'- output_shot_count: {result["output_shot_count"]}\n'
            "- Image settings:\n"
            f'  - model_id: "{generation_config["image_model_id"]}"\n'
            f'  - aspect_ratio: "{generation_config["aspect_ratio"]}"\n'
            f'  - resolution: "{generation_config["resolution"]}"\n'
            f'  - size: "{generation_config["size"]}"'
        )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明正在保存的分镜名称和镜头数量。"""
        values = arguments or {}
        name = values.get("name") or VideoProductionMarkdownPresenter.message(
            "upsert_storyboard.unnamed"
        )
        shot_count = len(values.get("shots") or [])
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "upsert_storyboard.before",
                name=name,
                shot_count=shot_count,
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
        """向用户汇总分镜保存状态和镜头数量。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        remark = (
            VideoProductionMarkdownPresenter.message(
                "upsert_storyboard.after_success",
                shot_count=data.get("shot_count", 0),
            )
            if result.ok
            else VideoProductionMarkdownPresenter.message(
                "upsert_storyboard.after_failure",
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
        """以 Markdown 展示分镜节点、Content 和镜头保存结果。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        name = values.get("name") or VideoProductionMarkdownPresenter.message(
            "upsert_storyboard.unnamed"
        )
        lines = [
            VideoProductionMarkdownPresenter.message(
                "upsert_storyboard.detail_name",
                name=name,
            ),
            VideoProductionMarkdownPresenter.message(
                "upsert_storyboard.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            ),
        ]
        if result.ok:
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "upsert_storyboard.detail_shot_count",
                        count=data.get("shot_count", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "upsert_storyboard.detail_element_id",
                        element_id=VideoProductionMarkdownPresenter.code(data.get("element_id")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "upsert_storyboard.detail_content_id",
                        content_id=VideoProductionMarkdownPresenter.code(data.get("content_id")),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "upsert_storyboard.detail_connections",
                        count=len(data.get("connection_ids") or []),
                    ),
                ]
            )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "upsert_storyboard.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "upsert_storyboard.md",
            VideoProductionMarkdownPresenter.message("upsert_storyboard.detail_title"),
            lines,
        )
