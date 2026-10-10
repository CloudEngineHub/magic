"""标题与真实文件名独立改动；外部文件和画布写回分别报告。"""

from __future__ import annotations

from pathlib import Path
from typing import cast

from agentlang.context.tool_context import ToolContext
from app.core.context.agent_context import AgentContext
from app.i18n import i18n
from app.tools.canvas.application.commands.rename_commands import BatchNaming, RenameElement
from app.tools.canvas.application.file_reference_updates import CanvasFileReferenceUpdates
from app.tools.canvas.application.operation_confirmation import CanvasOperationConfirmation
from app.tools.canvas.application.rename_preparation import RenamePreparation
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.domain.services.spatial_geometry import CanvasSpatialGeometry
from app.tools.canvas.domain.types import JsonObject
from app.tools.canvas.infrastructure.assets.workspace_file_management import (
    ManagedCanvasFile,
    WorkspaceFileInfo,
    WorkspaceFileManagement,
)
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface


class RenameElementsService:
    def __init__(self, repository: CanvasRepositoryInterface, context: ToolContext):
        self.repository, self.context = repository, context

    async def run(
        self,
        project_path: str,
        items: list[RenameElement],
        stage: str,
        prepared_id: str | None,
        confirmation_id: str | None,
        batch_naming: BatchNaming | None = None,
    ) -> JsonObject:
        if stage == "recover":
            return await self._recover(project_path, prepared_id or "", confirmation_id or "")
        if not items or len({item.element_id for item in items}) != len(items):
            raise CanvasDomainError("INVALID_SELECTION", "Specify distinct exact Element IDs and requested names.")
        gateway = None
        if any(item.files or item.all_versions_base_name for item in items) or (
            batch_naming and batch_naming.target != "title"
        ):
            agent = self.context.get_extension_typed("agent_context", AgentContext)
            if agent is None:
                raise CanvasDomainError("AGENT_CONTEXT_REQUIRED", "File rename requires the current Agent context.")
            gateway = WorkspaceFileManagement(self.repository.workspace, project_path, agent)
            await gateway.check_canvas_write_access()
        preparation = RenamePreparation(self.repository, gateway)
        if batch_naming:
            items = await preparation.batch_items(project_path, items, batch_naming)
        if any(item.canvas_title is None and not item.files and not item.all_versions_base_name for item in items):
            raise CanvasDomainError("INVALID_NAME", "Specify names explicitly or supply batch_naming.")
        has_files = any(item.files or item.all_versions_base_name for item in items)
        if not has_files:
            return await self._titles(project_path, items, stage == "prepare")
        if gateway is None:
            raise CanvasDomainError("AGENT_CONTEXT_REQUIRED", "File rename requires the current Agent context.")
        prepared = await preparation.prepare(project_path, items, gateway)
        payload, fingerprint = prepared.payload, prepared.fingerprint
        if not payload["files"]:
            title_result = await self._paired_titles(project_path, items, payload, [], stage == "prepare")
            return {
                **title_result,
                "items": [*title_result["items"], *payload["skipped"]],
                "skipped": payload["skipped"],
                "complete": not payload["skipped"],
            }
        confirmation = CanvasOperationConfirmation.from_tool(self.context)
        if stage == "prepare":
            comparison = "\n".join(f"{file['file_name']} → {file['target_file_name']}" for file in payload["files"])
            comparison += "\n" + "\n".join(
                i18n.translate("canvas.rename_title_comparison", category="tool.messages", name=item.canvas_title)
                for item in items
                if item.canvas_title is not None
            )
            question = i18n.translate(
                "canvas.rename_confirmation",
                category="tool.messages",
                count=len(payload["files"]),
                comparison=comparison,
            )
            record = await confirmation.prepare(self.context.tool_call_id, "rename", payload, fingerprint, question)
            return {
                **payload,
                "items": [{**file, "status": "prepared"} for file in payload["files"]],
                "stage": "prepared",
                "prepared_tool_call_id": record.prepared_tool_call_id,
            }
        if len(payload["files"]) > 1 or prepared_id:
            record = await confirmation.consume(prepared_id or "", confirmation_id or "", "rename", fingerprint)
        else:
            # 单文件改名不增加确认弹窗，但同样保留外部写入结果，供只修引用的恢复入口使用。
            prepared_id = self.context.tool_call_id
            record = await confirmation.prepare(prepared_id, "rename", payload, fingerprint, "")
            record.state, record.confirmation_tool_call_id = "consumed", self.context.tool_call_id
            await confirmation.save(record)
        outcomes: list[JsonObject] = []
        record.payload["outcomes"] = outcomes
        for file in payload["files"]:
            source = ManagedCanvasFile(Path(file["path"]), WorkspaceFileInfo.model_validate(file["identity"]))
            # 一个记录从 started 演进到 completed；崩溃后只复查身份、修引用，不重发外部写入。
            outcome: JsonObject = {**file, "status": "rename_unconfirmed"}
            outcomes.append(outcome)
            record.payload["outcomes"] = outcomes
            await confirmation.save(record)
            try:
                renamed = await gateway.rename(source, str(file["target_file_name"]))
                outcome.update(
                    {
                        "status": "file_renamed",
                        "new_path": str(renamed.path),
                        "new_identity": renamed.info.model_dump(),
                    }
                )
                # 先保存已发生的外部结果；画布写回失败时只修复引用，不再次改名或覆盖文件。
                record.payload["outcomes"] = outcomes
                await confirmation.save(record)
                await self._references(project_path, gateway, source.path, renamed.path)
                outcome["status"] = "completed"
            except Exception as error:
                outcome["error"] = str(error)
                outcome["error_code"] = error.code if isinstance(error, CanvasDomainError) else "INTERNAL_ERROR"
                if outcome["status"] != "file_renamed" and outcome["error_code"] in {
                    "FILE_IDENTITY_CHANGED",
                    "FILE_NAME_CONFLICT",
                }:
                    outcome["status"] = "failed"
            record.payload["outcomes"] = outcomes
            await confirmation.save(record)
        title_result = await self._paired_titles(project_path, items, payload, outcomes, False)
        complete = not payload["skipped"] and all(
            item["status"] in {"completed", "unchanged"} for item in [*outcomes, *title_result["items"]]
        )
        if complete:
            await confirmation.discard(record)
        return {
            "project_path": project_path,
            "stage": "executed",
            "items": [*outcomes, *title_result["items"], *payload["skipped"]],
            "recovery_prepared_tool_call_id": prepared_id,
            "recovery_confirmation_tool_call_id": record.confirmation_tool_call_id,
            "skipped": payload["skipped"],
            "complete": complete,
        }

    async def _paired_titles(
        self,
        project_path: str,
        items: list[RenameElement],
        payload: JsonObject,
        outcomes: list[JsonObject],
        dry_run: bool,
    ) -> JsonObject:
        # 单版本「一起改」须先有文件成功；多版本标题独立于各文件结果，生成中版本也不阻止它。
        incomplete = {item["element_id"] for item in payload["skipped"]} | {
            element_id
            for outcome in outcomes
            if outcome["status"] != "completed"
            for element_id in outcome["element_ids"]
        }
        blocked = incomplete & set(payload["single_version_ids"])
        eligible = [item for item in items if item.element_id not in blocked]
        try:
            result = await self._titles(project_path, eligible, dry_run)
        except Exception as error:
            result = {
                "project_path": project_path,
                "stage": "prepared" if dry_run else "executed",
                "complete": False,
                "items": [
                    {
                        "element_id": item.element_id,
                        "name": item.canvas_title,
                        "status": "failed",
                        "reason": str(error),
                        "error_code": error.code if isinstance(error, CanvasDomainError) else "INTERNAL_ERROR",
                    }
                    for item in eligible
                    if item.canvas_title is not None
                ],
            }
        result["items"].extend(
            {
                "element_id": item.element_id,
                "name": item.canvas_title,
                "status": "not_applied",
                "reason": "The paired file did not complete; the single-version Canvas title was retained.",
                "error_code": "FILE_NOT_READY",
            }
            for item in items
            if item.element_id in blocked and item.canvas_title is not None
        )
        return result

    async def _titles(self, project_path: str, items: list[RenameElement], dry_run: bool) -> JsonObject:
        def change(project: CanvasProject) -> JsonObject:
            geometry = CanvasSpatialGeometry(project.canvas)
            targets = [(item, geometry.assert_mutable(item.element_id)) for item in items]
            outcomes: list[JsonObject] = []
            for item, element in targets:
                if item.canvas_title is None:
                    continue
                changed = element.properties.name != item.canvas_title
                outcomes.append(
                    {
                        "element_id": item.element_id,
                        "name": item.canvas_title,
                        "previous_title": element.properties.name,
                        "status": "prepared" if dry_run and changed else "completed" if changed else "unchanged",
                        "file_name_changed": False,
                    }
                )
                if not dry_run:
                    element.properties.name = item.canvas_title
            return {
                "project_path": project_path,
                "items": outcomes,
                "complete": True,
                "stage": "prepared" if dry_run else "executed",
            }

        return (
            change(await self.repository.read(project_path))
            if dry_run
            else await self.repository.transaction(project_path, change)
        )

    async def _references(
        self, project_path: str, gateway: WorkspaceFileManagement, old_path: Path, new_path: Path
    ) -> None:
        updates = CanvasFileReferenceUpdates(gateway.paths, project_path, old_path, new_path)

        def change(project: CanvasProject, sidecar: dict) -> tuple[None, dict]:
            updates.apply(project, cast(JsonObject, sidecar))
            return None, sidecar

        await self.repository.transaction_with_sidecar(project_path, change)
        user = await self.repository.read_sidecar(project_path, "element-details-user.json")
        updates.update_json(cast(JsonObject, user))
        if user:
            await self.repository.write_sidecar(project_path, user, "element-details-user.json")

    async def _recover(self, project_path: str, prepared_id: str, confirmation_id: str) -> JsonObject:
        confirmation = CanvasOperationConfirmation.from_tool(self.context)
        record = await confirmation.read(prepared_id)
        if (
            record.operation != "rename"
            or record.state != "consumed"
            or record.confirmation_tool_call_id != confirmation_id
            or record.payload["project_path"] != project_path
        ):
            raise CanvasDomainError(
                "RECOVERY_UNAVAILABLE", "This call does not identify a consumed rename operation in this project."
            )
        gateway = WorkspaceFileManagement(self.repository.workspace, project_path, confirmation.agent_context)
        await gateway.check_canvas_write_access()
        outcomes = record.payload.get("outcomes", [])
        for item in outcomes:
            if item["status"] not in {"file_renamed", "rename_unconfirmed"}:
                continue
            current = await gateway.info(str(item["file_id"]))
            source = WorkspaceFileInfo.model_validate(item["identity"])
            if item["status"] == "rename_unconfirmed":
                if current == source:
                    item["status"] = "not_applied"
                    continue
                if current.name != item["target_file_name"] or current.parent_id != source.parent_id:
                    raise CanvasDomainError(
                        "RECOVERY_STALE",
                        "The started rename has an unexpected current name or parent. No file write was retried.",
                    )
                item["new_identity"] = current.model_dump()
                item["new_path"] = str(Path(item["path"]).with_name(current.name))
            elif current != WorkspaceFileInfo.model_validate(item["new_identity"]):
                raise CanvasDomainError(
                    "RECOVERY_STALE",
                    "The renamed file changed; query its current identity before repairing references.",
                )
            await self._references(project_path, gateway, Path(item["path"]), Path(item["new_path"]))
            item["status"] = "completed"
            item.pop("error", None)
            item.pop("error_code", None)
        record.payload["outcomes"] = outcomes
        complete = all(item["status"] == "completed" for item in outcomes)
        if complete:
            await confirmation.discard(record)
        else:
            await confirmation.save(record)
        return {
            "project_path": project_path,
            "stage": "recovered",
            "items": outcomes,
            "complete": complete,
        }
