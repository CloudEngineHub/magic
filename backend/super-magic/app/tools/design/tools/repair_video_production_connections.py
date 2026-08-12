"""修复视频制作画布中的直接业务关系。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseToolParams, tool
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.tools.video_production_presentation import (
    VideoProductionMarkdownPresenter,
)
from app.tools.design.video_production.service.video_production_relation_service import (
    VideoProductionRelationService,
)


class ConnectionRepairTarget(BaseModel):
    """描述一个目标 Element 当前应保留的直接来源。"""

    model_config = ConfigDict(extra="forbid")

    target_element_id: str = Field(
        ...,
        min_length=1,
        description="Target Canvas Element ID whose direct incoming relations are repaired.",
    )
    source_element_ids: list[str] = Field(
        default_factory=list,
        max_length=20,
        description=(
            "Complete direct source Element ID list for this target. "
            "Use an empty list only when intentionally removing all managed incoming relations."
        ),
    )

    @field_validator("target_element_id")
    @classmethod
    def validate_target_id(cls, value: str) -> str:
        """规范化目标节点 ID。"""
        value = value.strip()
        if not value:
            raise ValueError("target_element_id must not be empty")
        return value

    @field_validator("source_element_ids")
    @classmethod
    def validate_source_ids(cls, values: list[str]) -> list[str]:
        """规范化来源节点 ID，并拒绝空值和重复值。"""
        normalized: list[str] = []
        for value in values:
            value = value.strip()
            if not value:
                raise ValueError("source_element_ids must contain only non-empty IDs")
            if value not in normalized:
                normalized.append(value)
        return normalized


class RepairVideoProductionConnectionsParams(BaseToolParams):
    """批量修复视频制作节点关系参数。"""

    model_config = ConfigDict(extra="forbid")

    project_path: str = Field(..., description="Workspace-relative Canvas project path.")
    targets: list[ConnectionRepairTarget] = Field(
        ...,
        min_length=1,
        max_length=20,
        description=(
            "Targets and their complete direct source lists. Each target is synchronized in one transaction."
        ),
    )

    @field_validator("targets")
    @classmethod
    def validate_targets(cls, values: list[ConnectionRepairTarget]) -> list[ConnectionRepairTarget]:
        """拒绝重复目标，避免一次请求产生互相覆盖的关系声明。"""
        target_ids = [target.target_element_id for target in values]
        if len(set(target_ids)) != len(target_ids):
            raise ValueError("targets must not contain duplicate target_element_id values")
        return values


# 完整的模型侧使用规范位于 agents/skills/video-production/SKILL.md。
@tool(code_mode_only=True)
class RepairVideoProductionConnections(
    BaseVideoProductionTool[RepairVideoProductionConnectionsParams]
):
    """仅同步视频制作工具拥有的锁定入边，不生成或修改媒体内容。"""

    action_key = "repair_video_production_connections"
    success_message_key = "repair_video_production_connections.success"
    failure_message_key = "repair_video_production_connections.exception"

    async def execute(
        self,
        tool_context: ToolContext,
        params: RepairVideoProductionConnectionsParams,
    ) -> ToolResult:
        """在单次画布事务中按目标节点同步完整的直接来源集合。"""
        def repair(config: Any) -> dict[str, Any]:
            """同步所有目标节点的受管锁定入边。"""
            repaired_targets: list[dict[str, Any]] = []
            all_connections: list[dict[str, str]] = []
            for target in params.targets:
                connections = VideoProductionRelationService.synchronize_incoming(
                    config.canvas,
                    target.target_element_id,
                    target.source_element_ids,
                )
                summaries = VideoProductionRelationService.to_summaries(connections)
                repaired_targets.append(
                    {
                        "target_element_id": target.target_element_id,
                        "source_element_ids": list(target.source_element_ids),
                        "connection_ids": [item["connection_id"] for item in summaries],
                    }
                )
                all_connections.extend(summaries)
            return {
                "targets": repaired_targets,
                "connections": all_connections,
            }

        try:
            result, error_result = await self._run_canvas_write(
                tool_context,
                params.project_path,
                repair,
            )
            if error_result is not None:
                return error_result
            assert result is not None
            return ToolResult(
                content=(
                    f"Repaired incoming relations for {len(result['targets'])} target Element(s). "
                    f"Active direct connections: {len(result['connections'])}."
                ),
                data=result,
            )
        except Exception as error:
            return ToolResult.error(
                f"Video production connection repair failed: {error}",
                extra_info={"error_type": "design.video_production_connection_repair_failed"},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """向用户说明即将修复的目标关系数量。"""
        targets = list((arguments or {}).get("targets") or [])
        return {
            "action": VideoProductionMarkdownPresenter.action(self.action_key),
            "remark": VideoProductionMarkdownPresenter.message(
                "repair_video_production_connections.before",
                target_count=len(targets),
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
        """向用户汇总关系修复结果。"""
        result.use_custom_remark = True
        data = VideoProductionMarkdownPresenter.result_data(result)
        remark = (
            VideoProductionMarkdownPresenter.message(
                "repair_video_production_connections.after_success",
                connection_count=len(data.get("connections") or []),
            )
            if result.ok
            else VideoProductionMarkdownPresenter.message(
                "repair_video_production_connections.after_failure",
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
        """以 Markdown 展示目标节点及其直接来源。"""
        data = VideoProductionMarkdownPresenter.result_data(result)
        lines = [
            VideoProductionMarkdownPresenter.message(
                "repair_video_production_connections.detail_project",
                project=VideoProductionMarkdownPresenter.code((arguments or {}).get("project_path")),
            )
        ]
        if result.ok:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "repair_video_production_connections.detail_targets",
                    count=len(data.get("targets") or []),
                )
            )
            for target in data.get("targets") or []:
                sources = target.get("source_element_ids") or []
                lines.append(
                    f'- {VideoProductionMarkdownPresenter.code(target.get("target_element_id"))} '
                    f'<- {", ".join(VideoProductionMarkdownPresenter.code(item) for item in sources) or "none"}'
                )
        else:
            lines.append(
                VideoProductionMarkdownPresenter.message(
                    "repair_video_production_connections.detail_failure",
                    failure=VideoProductionMarkdownPresenter.message(self.failure_message_key),
                )
            )
        return VideoProductionMarkdownPresenter.detail(
            "repair_video_production_connections.md",
            VideoProductionMarkdownPresenter.message(
                "repair_video_production_connections.detail_title"
            ),
            lines,
        )
