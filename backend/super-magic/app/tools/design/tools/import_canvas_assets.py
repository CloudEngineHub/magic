"""把工作区已有媒体文件导入画布。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.event.event import EventType
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.tools.design.video_production.service.media_generation_service import (
    CanvasAssetRegistration,
    MediaGenerationService,
    MediaSourceInput,
    MediaSourceType,
)
from app.tools.design.video_production.service.video_production_layout_service import (
    VideoProductionLayoutService,
)


class CanvasAssetInput(BaseModel):
    """单个待导入画布的工作区素材。"""

    model_config = ConfigDict(extra="forbid")

    path: str = Field(
        ...,
        min_length=1,
        description="Workspace-relative uploaded or existing media file path.",
    )
    name: str = Field(
        ...,
        min_length=1,
        description="Specific Canvas asset name in the user's language.",
    )

    @field_validator("path", "name")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        """去除路径和名称两端空白，并拒绝空值。"""
        normalized = value.strip()
        if not normalized:
            raise ValueError("Asset path and name must not be empty")
        return normalized


class ImportCanvasAssetsParams(BaseToolParams):
    """批量导入画布素材参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    assets: list[CanvasAssetInput] = Field(..., min_length=1, max_length=10)


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class ImportCanvasAssets(BaseVideoProductionTool[ImportCanvasAssetsParams]):
    """批量复制工作区媒体，并登记为可复用的 Canvas 素材节点。"""

    action_key = "import_canvas_assets"
    success_message_key = "import_canvas_assets.success"
    failure_message_key = "import_canvas_assets.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: ImportCanvasAssetsParams,
    ) -> ToolResult:
        """准备素材路径，并通过一次画布写事务完成全部节点登记。"""
        try:
            resolved_path, manager, error_result = await self._get_canvas_manager(
                params.project_path,
                tool_context=tool_context,
            )
            if error_result is not None or resolved_path is None or manager is None:
                return error_result or ToolResult.error("Canvas project validation failed.")

            source_inputs = [
                MediaSourceInput(
                    path=asset.path,
                    media_type=MediaGenerationService.infer_media_type(asset.path),
                    name=asset.name,
                )
                for asset in params.assets
            ]
            if not manager.supports_content_versions() and any(
                source.media_type == MediaSourceType.AUDIO for source in source_inputs
            ):
                raise ValueError("The current Canvas format does not support Audio assets")

            prepared_sources = await MediaGenerationService.prepare_source_references(
                manager,
                resolved_path,
                self._get_runtime_workspace_dir(tool_context),
                source_inputs,
            )

            async def mutate(config: Any) -> list[CanvasAssetRegistration]:
                """在当前事务快照中幂等登记全部素材。"""
                registrations = await MediaGenerationService.ensure_canvas_assets(
                    manager,
                    config,
                    prepared_sources,
                )
                if self._is_video_production_agent(tool_context):
                    VideoProductionLayoutService.layout_new_elements(
                        config.canvas,
                        [
                            registration.element_id
                            for registration in registrations
                            if registration.created
                        ],
                    )
                return registrations

            registrations = await manager.run_write_transaction(
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
            data = self._build_result_data(registrations)
            return ToolResult(
                content=self._build_result_content(registrations),
                data=data,
            )
        except Exception as error:
            return ToolResult.error(
                f"Canvas asset import failed: {error}",
                extra_info={"error_type": "design.canvas_asset_import_failed"},
            )

    @staticmethod
    def _build_result_data(
        registrations: list[CanvasAssetRegistration],
    ) -> dict[str, Any]:
        """构造用户展示和后续程序消费的结构化结果。"""
        assets = [registration.to_dict() for registration in registrations]
        return {
            "asset_count": len(assets),
            "imported_count": sum(1 for asset in assets if asset["created"]),
            "reused_count": sum(1 for asset in assets if not asset["created"]),
            "assets": assets,
        }

    @staticmethod
    def _build_result_content(
        registrations: list[CanvasAssetRegistration],
    ) -> str:
        """构造便于模型继续串联工具的导入结果正文。"""
        created_count = sum(1 for registration in registrations if registration.created)
        reused_count = len(registrations) - created_count
        lines = [
            f"Imported {created_count} Canvas asset(s) and reused {reused_count} existing asset(s)."
        ]
        for registration in registrations:
            lines.append(
                f'- name="{registration.name}", media_type="{registration.media_type.value}", '
                f'element_id="{registration.element_id}", content_id="{registration.content_id}", '
                f'media_path="{registration.src}"'
            )
        return "\n".join(lines)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明即将导入的素材名称。"""
        assets = list((arguments or {}).get("assets") or [])
        names = [str(asset.get("name") or "") for asset in assets]
        separator = VideoProductionMarkdownPresenter.message("video_production.list_separator")
        summary = separator.join(name for name in names[:3] if name)
        if len(names) > 3:
            summary = VideoProductionMarkdownPresenter.message(
                "import_canvas_assets.before_more",
                summary=summary,
                count=len(names),
            )
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "import_canvas_assets.before",
                summary=summary
                or VideoProductionMarkdownPresenter.message("import_canvas_assets.empty"),
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
        """向用户汇总素材导入和复用数量。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        remark = (
            VideoProductionMarkdownPresenter.message(
                "import_canvas_assets.after_success",
                imported_count=data.get("imported_count", 0),
                reused_count=data.get("reused_count", 0),
            )
            if result.ok
            else VideoProductionMarkdownPresenter.message(
                "import_canvas_assets.after_failure",
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
        """以 Markdown 展示导入素材的路径和节点标识。"""
        values = arguments or {}
        data = VideoProductionMarkdownPresenter.result_data(result)
        lines = [
            VideoProductionMarkdownPresenter.message(
                "import_canvas_assets.detail_project",
                project=VideoProductionMarkdownPresenter.code(values.get("project_path")),
            )
        ]
        if result.ok:
            lines.extend(
                [
                    VideoProductionMarkdownPresenter.message(
                        "import_canvas_assets.detail_imported",
                        count=data.get("imported_count", 0),
                    ),
                    VideoProductionMarkdownPresenter.message(
                        "import_canvas_assets.detail_reused",
                        count=data.get("reused_count", 0),
                    ),
                    "",
                    VideoProductionMarkdownPresenter.message(
                        "import_canvas_assets.detail_assets_heading"
                    ),
                ]
            )
            for asset in data.get("assets") or []:
                lines.append(
                    VideoProductionMarkdownPresenter.message(
                        "import_canvas_assets.detail_asset",
                        name=asset.get("name"),
                        media_type=VideoProductionMarkdownPresenter.code(asset.get("media_type")),
                        media_path=VideoProductionMarkdownPresenter.code(asset.get("media_path")),
                        element_id=VideoProductionMarkdownPresenter.code(asset.get("element_id")),
                        content_id=VideoProductionMarkdownPresenter.code(asset.get("content_id")),
                    )
                )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "import_canvas_assets.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "import_canvas_assets.md",
            VideoProductionMarkdownPresenter.message("import_canvas_assets.detail_title"),
            lines,
        )
