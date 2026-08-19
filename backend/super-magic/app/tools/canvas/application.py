"""Canvas Application 用例编排。

Application 层只负责跨领域组装和事务调用，布局、Content、连线策略保持可替换。
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.assets import AssetGateway, WorkspaceAssetGateway
from app.tools.canvas.batch import AtomicBatchGuard
from app.tools.canvas.codec import SUPPORTED_ELEMENT_TYPES
from app.tools.canvas.connection_ledger import ConnectionOperationLedger
from app.tools.canvas.content_metadata import ContentMetadataService
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasElement, CanvasProject
from app.tools.canvas.generation import (
    CanvasGenerationResultApplier,
    GenerationCapabilityRegistry,
    GenerationExecutionStrategyRegistry,
    GenerationQueryRequest,
    GenerationRequest,
    GenerationTaskPoller,
    GenerationSubmission,
    GenerationTask,
    GenerationTaskRepository,
    InMemoryGenerationTaskRepository,
)
from app.tools.canvas.repository import CanvasRepository, CanvasUnitOfWork
from app.tools.canvas.query import CanvasQueryService
from app.tools.canvas.sidecar import ElementDetailsAdapter
from app.tools.canvas.strategies import ConnectionStrategyRegistry, ContentStrategyRegistry, LayoutStrategyRegistry
from app.tools.canvas.hierarchy import (
    ElementTreeIndex,
    FrameSelectionRequest,
    FrameSelectionStrategy,
    HierarchyMutationPlan,
)
from app.tools.core.tool_keepalive import start_tool_keep_alive, stop_tool_keep_alive

_default_generation_tasks = InMemoryGenerationTaskRepository()


def _new_id(prefix: str) -> str:
    """生成不依赖模型输入的稳定对象 ID。"""
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


class CanvasApplication:
    """Canvas 业务用例门面。"""

    def __init__(
        self,
        repository: CanvasRepository,
        *,
        layout_strategies: LayoutStrategyRegistry | None = None,
        content_strategies: ContentStrategyRegistry | None = None,
        connection_strategies: ConnectionStrategyRegistry | None = None,
        generation_capabilities: GenerationCapabilityRegistry | None = None,
        generation_tasks: GenerationTaskRepository | None = None,
        asset_gateway: AssetGateway | None = None,
    ):
        """初始化用例门面和仓储。"""
        self.repository = repository
        self.unit_of_work = CanvasUnitOfWork(repository)
        self.layout_strategies = layout_strategies or LayoutStrategyRegistry()
        self.content_strategies = content_strategies or ContentStrategyRegistry()
        self.connection_strategies = connection_strategies or ConnectionStrategyRegistry()
        self.sidecar_adapter = ElementDetailsAdapter()
        self.query_service = CanvasQueryService(repository, self.sidecar_adapter)
        self.generation_capabilities = generation_capabilities or GenerationCapabilityRegistry(workspace=repository.workspace)
        self.generation_tasks = generation_tasks or _default_generation_tasks
        self.asset_gateway = asset_gateway or WorkspaceAssetGateway(repository.workspace)
        self.frame_selection = FrameSelectionStrategy()
        self.generation_execution = GenerationExecutionStrategyRegistry()
        self.generation_poller = GenerationTaskPoller()
        self.generation_result_applier = CanvasGenerationResultApplier()

    async def initialize(self, project_path: str) -> dict[str, Any]:
        """创建或复用一个 Canvas 项目。"""
        path, created = await self.repository.initialize(project_path)
        return {"project_path": project_path, "project_name": path.name, "created": created}

    async def overview(self, project_path: str, page: int, limit: int) -> dict[str, Any]:
        """返回分页的轻量 Element 概览。"""
        return await self.query_service.overview(project_path, page, limit)

    async def elements(self, project_path: str, element_ids: list[str]) -> dict[str, Any]:
        """返回精确 Element 的模型友好业务 DTO 和关联连线。"""
        return await self.query_service.elements(project_path, element_ids)

    async def add_elements(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        generated: list[dict[str, Any]] = []
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            created: dict[str, str] = {}
            results: list[dict[str, Any]] = []
            layout_requests: list[tuple[CanvasElement, dict[str, Any] | None]] = []
            for item in items:
                item_ref = item["item_ref"]
                current_item_ref = item_ref
                if item.get("element_type") not in SUPPORTED_ELEMENT_TYPES:
                    raise CanvasDomainError(
                        "INVALID_ELEMENT",
                        f"Element type {item.get('element_type')} is unsupported.",
                    )
                element_id = item.get("element_id") or _new_id("element")
                if project.canvas.get_element(element_id) is not None:
                    raise CanvasDomainError("ELEMENT_ALREADY_EXISTS", f"Element {element_id} already exists.")
                element = CanvasElement(
                    element_id=element_id,
                    element_type=item["element_type"],
                    properties={"name": item.get("name")} if item.get("name") else {},
                )
                content = item.get("content")
                if element.element_type in {"frame", "group"}:
                    if content is not None:
                        raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                    content_id = _new_id("content")
                    element.contents.append(CanvasContent(content_id, {}))
                    element.active_content_id = content_id
                    element.main_content_id = content_id
                    element.children = []
                generated_content_id = None
                if content:
                    content = dict(content)
                    await self._prepare_imported_content(project, content)
                    content.setdefault("content_id", _new_id("content"))
                    element.contents.append(self._build_content(content, element.element_type))
                    element.active_content_id = element.contents[0].content_id
                    element.main_content_id = element.contents[0].content_id
                    if content.get("source") == "generated":
                        self.generation_capabilities.get(element.element_type)
                        generated_content_id = element.contents[0].content_id
                        generated.append({
                            "element_id": element.element_id,
                            "content_id": element.contents[0].content_id,
                            "element_type": element.element_type,
                            "parameters": content,
                        })
                    self._set_content_detail(
                        metadata,
                        element.element_id,
                        element.contents[0].content_id,
                        self._new_content_detail(element.element_id, content),
                    )
                project.canvas.elements.append(element)
                layout_requests.append((element, item.get("layout")))
                created[item_ref] = element_id
                results.append({"item_ref": item_ref, "element_id": element_id, "content_id": generated_content_id or (element.contents[0].content_id if element.contents else None), "status": "pending" if generated_content_id else "completed"})
            for item in items:
                current_item_ref = item["item_ref"]
                current_element_id = created.get(item["item_ref"])
                for relation in item.get("connections", []):
                    source_id = relation.get("source_element_id") or created.get(relation.get("source_item_ref"))
                    target_id = relation.get("target_element_id") or created.get(relation.get("target_item_ref"))
                    if relation.get("source_element_id") or relation.get("source_item_ref"):
                        target_id = current_element_id
                    elif relation.get("target_element_id") or relation.get("target_item_ref"):
                        source_id = current_element_id
                    if not source_id or not target_id:
                        raise CanvasDomainError("INVALID_CONNECTION", "Connection reference could not be resolved.")
                    self._add_connection(project, source_id, target_id)
            for index, (element, layout) in enumerate(layout_requests):
                current_item_ref = items[index]["item_ref"]
                self._apply_layout(project, element, layout, index)
            return {"items": results, "created_element_ids": list(created.values())}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error
        return await self._submit_generated(project_path, result, generated, tool_context)

    async def frame_elements(
        self,
        project_path: str,
        items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """将根级普通兄弟节点框选为新 Frame，并完成局部坐标转换。"""
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None

        def mutate(project: CanvasProject) -> dict[str, Any]:
            nonlocal current_item_ref
            results: list[dict[str, Any]] = []
            selected_ids: set[str] = set()
            for item in items:
                current_item_ref = item["item_ref"]
                request = FrameSelectionRequest(
                    item_ref=item["item_ref"],
                    element_ids=tuple(item.get("element_ids") or []),
                    name=item.get("name"),
                    padding=item.get("padding"),
                )
                if selected_ids.intersection(request.element_ids):
                    raise CanvasDomainError("FRAME_SELECTION_OVERLAP", "Frame selections in one batch cannot overlap.")
                plan = self.frame_selection.plan(project.canvas, request)
                children = [child.clone() for child in plan.children]
                plan.frame.children = children
                HierarchyMutationPlan(
                    frame=plan.frame,
                    selected_ids=plan.selected_ids,
                    root_insert_index=plan.root_insert_index,
                ).apply(project.canvas)
                selected_ids.update(plan.selected_ids)
                results.append({
                    "item_ref": item["item_ref"],
                    "frame_element_id": plan.frame.element_id,
                    "child_element_ids": [child.element_id for child in children],
                    "content_id": plan.frame.active_content_id,
                    "parent_element_id": None,
                    "depth": 0,
                    "padding": plan.padding,
                    "status": "completed",
                })
            return {"items": results}

        try:
            return await self.unit_of_work.transaction(project_path, mutate)
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error

    async def add_contents(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """向已有 Element 追加 Content 版本。"""
        generated: list[dict[str, Any]] = []
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results = []
            for item in items:
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                if element.element_type in {"frame", "group"}:
                    raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                content_data = dict(item["content"])
                await self._prepare_imported_content(project, content_data)
                content_data.setdefault("content_id", _new_id("content"))
                content = self._build_content(content_data, element.element_type)
                if element.get_content(content.content_id) is not None:
                    raise CanvasDomainError("CONTENT_ALREADY_EXISTS", f"Content {content.content_id} already exists.")
                element.contents.append(content)
                if len(element.contents) == 1:
                    element.active_content_id = content.content_id
                    element.main_content_id = content.content_id
                status = "pending" if content_data.get("source") == "generated" else "completed"
                if content_data.get("source") == "generated":
                    self.generation_capabilities.get(element.element_type)
                results.append({"item_ref": item["item_ref"], "element_id": element.element_id, "content_id": content.content_id, "status": status})
                if content_data.get("source") == "generated":
                    generated.append({
                        "item_ref": item["item_ref"],
                        "element_id": element.element_id,
                        "content_id": content.content_id,
                        "element_type": element.element_type,
                        "parameters": content_data,
                    })
                self._set_content_detail(
                    metadata,
                    element.element_id,
                    content.content_id,
                    self._new_content_detail(element.element_id, content_data),
                )
            return {"items": results}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error
        return await self._submit_generated(project_path, result, generated, tool_context)

    async def select_main(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """只修改用户明确选择的 main Content 指针。"""
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None
        def mutate(project: CanvasProject) -> dict[str, Any]:
            nonlocal current_item_ref
            results = []
            for item in items:
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                if element.element_type in {"frame", "group"}:
                    raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                content = element.get_content(item["content_id"])
                if content is None:
                    raise CanvasDomainError("CONTENT_NOT_FOUND", f"Content {item['content_id']} does not exist.")
                if content.fields.get("status") not in {None, "completed"}:
                    raise CanvasDomainError("MAIN_CONTENT_NOT_COMPLETED", "The selected Content is not completed.")
                previous = element.main_content_id
                element.main_content_id = content.content_id
                results.append({
                    "item_ref": item["item_ref"],
                    "element_id": element.element_id,
                    "previous_main_content_id": previous,
                    "main_content_id": content.content_id,
                    "active_content_id": element.active_content_id,
                })
            return {"items": results}

        try:
            return await self.unit_of_work.transaction(project_path, mutate)
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error

    async def layout(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """按可插拔布局策略调整 Element 布局。"""
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None
        def mutate(project: CanvasProject) -> dict[str, Any]:
            nonlocal current_item_ref
            results = []
            for index, item in enumerate(items):
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                self._apply_layout(project, element, item["layout"], index)
                results.append({"item_ref": item["item_ref"], "element_id": element.element_id, "strategy": item["layout"]["strategy"]})
            return {"items": results}

        try:
            return await self.unit_of_work.transaction(project_path, mutate)
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error

    async def connections(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """新增、按 ID 删除或原子替换 Connection。"""
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None
        def mutate(project: CanvasProject, metadata: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
            nonlocal current_item_ref
            ledger = ConnectionOperationLedger(metadata)
            results = []
            for item in items:
                current_item_ref = item["item_ref"]
                remove_ids = item.get("remove_connection_ids") or []
                replace = item.get("replace_existing_connections", False)
                source = item.get("source_element_id")
                target = item.get("target_element_id")
                if remove_ids and replace and (not source or not target):
                    raise CanvasDomainError("CONNECTION_REPLACEMENT_INVALID", "Replacement requires new source and target Elements.")
                if remove_ids and not replace and source and target:
                    raise CanvasDomainError("CONNECTION_REPLACEMENT_INVALID", "Set replace_existing_connections=true when removing old lines before adding a new one.")
                old_connections = [self._get_connection(project, connection_id) for connection_id in remove_ids]
                existing_old_connections = [connection for connection in old_connections if connection is not None]
                missing_ids = [connection_id for connection_id, connection in zip(remove_ids, old_connections, strict=True) if connection is None]
                existing_new = None
                if source and target:
                    existing_new = next(
                        (
                            connection
                            for connection in project.canvas.connections
                            if connection.source_element_id == source and connection.target_element_id == target
                        ),
                        None,
                    )
                if missing_ids:
                    repeated_remove = (
                        not source
                        and not target
                        and all(ledger.was_removed(connection_id) for connection_id in missing_ids)
                    )
                    repeated_replace = (
                        replace
                        and existing_new is not None
                        and all(
                            ledger.replacement_matches(connection_id, source, target)
                            for connection_id in missing_ids
                        )
                    )
                    if repeated_remove:
                        results.append({"item_ref": item["item_ref"], "status": "already_removed", "removed_connection_ids": remove_ids})
                        continue
                    if repeated_replace:
                        results.append({
                            "item_ref": item["item_ref"],
                            "status": "already_replaced",
                            "connection_id": existing_new.connection_id,
                            "removed_connection_ids": remove_ids,
                            "source_element_id": source,
                            "target_element_id": target,
                        })
                        continue
                    raise CanvasDomainError("CONNECTION_NOT_FOUND", "One or more Connection IDs do not exist.")
                if source or target:
                    if not source or not target:
                        raise CanvasDomainError("INVALID_CONNECTION", "Both source_element_id and target_element_id are required.")
                    if replace:
                        for old in existing_old_connections:
                            project.canvas.connections.remove(old)
                    connection = self._add_connection(project, source, target)
                    if replace:
                        for old_id in remove_ids:
                            ledger.mark_replaced(old_id, connection.connection_id, source, target)
                    results.append({
                        "item_ref": item["item_ref"],
                        "status": "replaced" if replace else "added",
                        "connection_id": connection.connection_id,
                        "removed_connection_ids": remove_ids,
                        "source_element_id": source,
                        "target_element_id": target,
                    })
                else:
                    for old in existing_old_connections:
                        project.canvas.connections.remove(old)
                    for old_id in remove_ids:
                        ledger.mark_removed(old_id)
                    results.append({"item_ref": item["item_ref"], "status": "removed", "removed_connection_ids": remove_ids})
            ledger.compact()
            return {"items": results}, metadata

        try:
            return await self.unit_of_work.transaction_with_sidecar(
                project_path,
                mutate,
                filename=".canvas-connection-ledger.json",
            )
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error

    async def retry_content(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """校验失败 Content 的受控重试边界；生成提交由后续 Port 接入。"""
        self._validate_unique_item_refs(items)
        current_item_ref: str | None = None

        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results = []
            for item in items:
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                content = element.get_content(item["content_id"]) if element else None
                if element is None or content is None:
                    raise CanvasDomainError("CONTENT_NOT_FOUND", "The requested Content does not exist.")
                if element.element_type in {"frame", "group"}:
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Frame and Group Elements do not have generated Content.")
                if content.fields.get("status") != "failed":
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Only failed generated Content can be retried.")
                detail = self._get_content_detail(metadata, element.element_id, item["content_id"])
                if detail.get("source") != "generated":
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Only generated Content can be retried.")
                retry_count = int(detail.get("retryCount", 0))
                if retry_count >= 2:
                    raise CanvasDomainError("CONTENT_RETRY_LIMIT_REACHED", "This Content has reached the retry limit.")
                self.generation_capabilities.get(element.element_type)
                parameters = self._merge_generation_override(
                    element.element_type,
                    detail.get("generationParameters", {}),
                    item.get("generation_override"),
                )
                content.fields["status"] = "pending"
                content.fields.pop("errorMessage", None)
                self._set_content_detail(
                    metadata,
                    element.element_id,
                    item["content_id"],
                    self._start_retry_detail(element.element_id, detail, retry_count + 1, parameters),
                )
                results.append({"item_ref": item["item_ref"], "element_id": element.element_id, "content_id": content.content_id, "status": "pending"})
            return {"items": results}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self._batch_error(items, current_item_ref, error) from error
        project = await self.repository.read(project_path)
        metadata = await self.repository.read_sidecar(project_path)
        generated = []
        for item in items:
            element = project.canvas.get_element(item["element_id"])
            detail = self._get_content_detail(metadata, item["element_id"], item["content_id"])
            generated.append({
                "item_ref": item.get("item_ref"),
                "element_id": item["element_id"],
                "content_id": item["content_id"],
                "element_type": element.element_type if element else "image",
                "retry_count": int(detail.get("retryCount", 0)),
                "parameters": detail.get("generationParameters", {}),
            })
        return await self._submit_generated(project_path, result, generated, tool_context)

    async def wait(
        self,
        project_path: str,
        task_ids: list[str],
        max_wait_seconds: int = 60,
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """轮询异步任务并在终态回写 Content。"""
        if len(task_ids) != len(set(task_ids)):
            raise CanvasDomainError("GENERATION_TASK_ID_INVALID", "generation_task_id values must be unique within a wait call.")
        keep_alive_task = start_tool_keep_alive(tool_context) if tool_context is not None else None
        try:
            deadline = time.monotonic() + max_wait_seconds
            results = await asyncio.gather(
                *(self._wait_one_safely(project_path, task_id, deadline, tool_context) for task_id in task_ids)
            )
            return {"items": results}
        finally:
            stop_tool_keep_alive(keep_alive_task)

    async def _wait_one_safely(
        self,
        project_path: str,
        task_id: str,
        deadline: float,
        tool_context: ToolContext | None,
    ) -> dict[str, Any]:
        """隔离单个等待任务的查询或持久化异常，避免拖垮同批其他任务。"""
        try:
            return await self._wait_one(project_path, task_id, deadline, tool_context)
        except CanvasDomainError as error:
            if error.code in {"CONTENT_NOT_FOUND", "ELEMENT_NOT_FOUND"}:
                return {
                    "generation_task_id": task_id,
                    "status": "not_found",
                    "error": error.message,
                }
            return {
                "generation_task_id": task_id,
                "status": "processing",
                "query_error": "Generation status is temporarily unavailable.",
                "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
            }
        except Exception:
            return {
                "generation_task_id": task_id,
                "status": "processing",
                "query_error": "Generation status is temporarily unavailable.",
                "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
            }

    async def _wait_one(
        self,
        project_path: str,
        task_id: str,
        deadline: float,
        tool_context: ToolContext | None,
    ) -> dict[str, Any]:
        """在共享等待窗口内查询并幂等回写一个异步任务。"""
        record = await self.generation_tasks.get(task_id)
        if record is None:
            record = await self._recover_generation_task(project_path, task_id)
        if record is None or record.project_path != project_path:
            return {
                "generation_task_id": task_id,
                "status": "not_found",
            }
        if record.status in {"completed", "failed"}:
            return {
                "generation_task_id": task_id,
                "element_id": record.element_id,
                "content_id": record.content_id,
                "status": record.status,
                "output_uri": record.output_uri,
                "error": record.error,
                "already_finalized": True,
            }
        if record.element_type in {"frame", "group"}:
            return {
                "generation_task_id": task_id,
                "element_id": record.element_id,
                "content_id": record.content_id,
                "status": "not_applicable",
                "error": "Frame and Group Elements do not have generation tasks.",
            }
        capability = self.generation_capabilities.get(record.element_type)
        if capability.query_port is None:
            return {"generation_task_id": task_id, "status": "processing", "timed_out": True}
        query_result = await self.generation_poller.poll(
            capability.query_port,
            GenerationQueryRequest(
                provider_task_id=record.provider_task_id,
                project_path=record.project_path,
                element_id=record.element_id,
                content_id=record.content_id,
            ),
            deadline,
            tool_context,
        )
        if query_result.status not in {"completed", "failed"}:
            return {
                "generation_task_id": task_id,
                "element_id": record.element_id,
                "content_id": record.content_id,
                "status": query_result.status,
                "timed_out": True,
                "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
            }

        final_status = query_result.status

        def finalize(project: CanvasProject, metadata: dict) -> tuple[None, dict]:
            """在同一项目事务中完成异步结果和任务元数据回写。"""
            self.generation_result_applier.apply(
                project,
                record.element_id,
                record.content_id,
                final_status,
                query_result.output_uri,
                query_result.error_message,
            )
            detail = self._get_content_detail(metadata, record.element_id, record.content_id)
            self._set_content_detail(metadata, record.element_id, record.content_id, {
                **detail,
                "generationStatus": final_status,
                "outputUri": query_result.output_uri,
                "errorMessage": query_result.error_message,
            })
            return None, metadata

        await self.unit_of_work.transaction_with_sidecar(project_path, finalize)
        record.status = final_status
        record.error = query_result.error_message
        record.output_uri = query_result.output_uri
        await self.generation_tasks.update(record)
        return {
            "generation_task_id": task_id,
            "element_id": record.element_id,
            "content_id": record.content_id,
            "status": final_status,
            "output_uri": query_result.output_uri,
            "error": query_result.error_message,
            "next_action": "Call query_canvas_element_details to verify the persisted Content.",
        }

    async def _recover_generation_task(
        self, project_path: str, generation_task_id: str
    ) -> GenerationTask | None:
        """从 sidecar 恢复进程重启后仍未完成的异步任务绑定。"""
        metadata = await self.repository.read_sidecar(project_path)
        project = await self.repository.read(project_path)
        for element in project.canvas.iter_elements():
            for content in element.contents:
                detail = self._get_content_detail(metadata, element.element_id, content.content_id)
                if detail.get("generationTaskId") != generation_task_id:
                    continue
                provider_task_id = detail.get("providerTaskId")
                if not isinstance(provider_task_id, str) or not provider_task_id:
                    return None
                record = GenerationTask(
                    generation_task_id=generation_task_id,
                    provider_task_id=provider_task_id,
                    project_path=project_path,
                    element_id=element.element_id,
                    content_id=content.content_id,
                    element_type=element.element_type,
                    capability_name="recovered",
                    retry_count=int(detail.get("retryCount", 0)),
                    status=str(detail.get("generationStatus") or content.fields.get("status") or "processing"),
                    error=detail.get("errorMessage") or content.fields.get("errorMessage"),
                    output_uri=detail.get("outputUri") or content.fields.get("src"),
                )
                await self.generation_tasks.put(record)
                return record
        return None

    async def _submit_generated(
        self,
        project_path: str,
        result: dict[str, Any],
        generated: list[dict[str, Any]],
        tool_context: ToolContext | None,
    ) -> dict[str, Any]:
        """提交生成能力并把逐项状态合并回结构结果。"""
        by_content = {item["content_id"]: item for item in result.get("items", []) if item.get("content_id")}
        for item in generated:
            capability = self.generation_capabilities.get(item["element_type"])
            request = GenerationRequest(
                project_path=project_path,
                element_id=item["element_id"],
                content_id=item["content_id"],
                element_type=item["element_type"],
                parameters=item.get("parameters") or {},
            )
            strategy = self.generation_execution.get(capability.execution_mode)
            try:
                submission = await strategy.execute(capability, request, tool_context)
            except Exception as error:
                submission = self._failed_generation_submission(capability.execution_mode, error)
            target = by_content.get(item["content_id"])
            if target is not None:
                target["status"] = submission.status
                if submission.generation_task_id:
                    target["generation_task_id"] = submission.generation_task_id
                if submission.output_uri:
                    target["output_uri"] = submission.output_uri
                if submission.error_message:
                    target["error"] = submission.error_message
            if submission.execution_mode == "async" and submission.generation_task_id and submission.provider_task_id:
                await self.generation_tasks.put(GenerationTask(
                    generation_task_id=submission.generation_task_id,
                    provider_task_id=submission.provider_task_id,
                    project_path=project_path,
                    element_id=item["element_id"],
                    content_id=item["content_id"],
                    element_type=item["element_type"],
                    capability_name=capability.name,
                    retry_count=int(item.get("retry_count", 0)),
                    status=submission.status,
                    error=submission.error_message,
                    output_uri=submission.output_uri,
                ))
            def persist(project: CanvasProject, metadata: dict) -> tuple[None, dict]:
                """在同一项目事务中持久化生成结果和内部任务绑定。"""
                self._apply_generation_result(
                    project,
                    item["element_id"],
                    item["content_id"],
                    submission.status,
                    submission.output_uri,
                    submission.error_message,
                )
                detail = self._get_content_detail(metadata, item["element_id"], item["content_id"])
                self._set_content_detail(metadata, item["element_id"], item["content_id"], {
                    **detail,
                    "elementId": item["element_id"],
                    "source": "generated",
                    "retryCount": int(detail.get("retryCount", 0)),
                    "generationParameters": item.get("parameters") or {},
                    "providerTaskId": submission.provider_task_id,
                    "generationTaskId": submission.generation_task_id,
                    "generationStatus": submission.status,
                    "outputUri": submission.output_uri,
                    "errorMessage": submission.error_message,
                })
                return None, metadata

            try:
                await self.unit_of_work.transaction_with_sidecar(project_path, persist)
            except Exception as error:
                if not submission.generation_task_id:
                    raise
                if target is not None:
                    target["status"] = submission.status
                    target["persistence_warning"] = (
                        "The generation task was created, but its Canvas metadata could not be saved. "
                        "Keep the returned generation_task_id and call wait_canvas_generation."
                    )
                    target["persistence_error"] = "Canvas metadata persistence is temporarily unavailable."
        return result

    @staticmethod
    def _failed_generation_submission(execution_mode: str, error: Exception) -> GenerationSubmission:
        """把端口异常收敛为可持久化的失败结果。"""
        message = str(error).strip() or "Generation failed unexpectedly."
        return GenerationSubmission(execution_mode, "failed", error_message=message[:1000])

    @staticmethod
    def _get_content_detail(metadata: dict, element_id: str, content_id: str) -> dict[str, Any]:
        """读取 Content 级 sidecar；兼容早期顶层 contentDetails 形态。"""
        return ContentMetadataService.get(metadata, element_id, content_id)

    @staticmethod
    def _set_content_detail(metadata: dict, element_id: str, content_id: str, detail: dict[str, Any]) -> None:
        """按 Element -> Content 的标准 sidecar 结构写入内部详情。"""
        ContentMetadataService.set(metadata, element_id, content_id, detail)

    @staticmethod
    def _apply_generation_result(
        project: CanvasProject,
        element_id: str,
        content_id: str,
        status: str,
        output_uri: str | None,
        error_message: str | None,
    ) -> None:
        """兼容旧调用方，委托给独立结果回写器。"""
        CanvasGenerationResultApplier.apply(project, element_id, content_id, status, output_uri, error_message)

    def _build_content(self, data: dict[str, Any], element_type: str) -> CanvasContent:
        """把模型输入转换为主协议允许的 Content 字段。"""
        return self.content_strategies.build(data, element_type)

    async def _prepare_imported_content(self, project: CanvasProject, data: dict[str, Any]) -> None:
        """规范化 imported 素材路径并阻止同一素材重复登记。"""
        if data.get("source") != "imported":
            return
        asset_path = str(data.pop("asset_path", "") or "")
        normalized = await self.asset_gateway.normalize_existing_file(asset_path)
        existing_paths = {
            str(content.fields.get("src"))
            for element in project.canvas.iter_elements()
            for content in element.contents
            if content.fields.get("src")
        }
        if normalized in existing_paths:
            raise CanvasDomainError("ASSET_ALREADY_REGISTERED", f"Imported asset is already registered: {normalized}.")
        data["src"] = normalized

    @staticmethod
    def _new_content_detail(element_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """创建不进入主协议的 Content 来源与生成尝试详情。"""
        return ContentMetadataService.new_detail(element_id, data)

    @staticmethod
    def _validate_unique_item_refs(items: list[dict[str, Any]]) -> None:
        """保证批次关联标签唯一，避免同批引用产生歧义。"""
        AtomicBatchGuard.validate_item_refs(items)

    @staticmethod
    def _batch_error(
        items: list[dict[str, Any]],
        failed_item_ref: str | None,
        error: CanvasDomainError,
    ) -> CanvasDomainError:
        """把多项原子批量异常转换为逐项结果，单项保留原错误码。"""
        return AtomicBatchGuard.map_error(items, failed_item_ref, error)

    @staticmethod
    def _merge_generation_override(
        element_type: str,
        original: dict[str, Any],
        override: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """只允许覆盖指定生成能力公开的输入字段。"""
        return ContentMetadataService.merge_generation_override(element_type, original, override)

    @staticmethod
    def _start_retry_detail(
        element_id: str,
        detail: dict[str, Any],
        retry_count: int,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """归档上一次终态并创建不复用旧任务绑定的新重试详情。"""
        return ContentMetadataService.start_retry(element_id, detail, retry_count, parameters)

    @staticmethod
    def _element_details_dto(
        element: CanvasElement,
        details: dict[str, dict[str, Any]],
        connections: list[dict[str, Any]],
        tree: ElementTreeIndex,
    ) -> dict[str, Any]:
        """兼容旧调用方，委托给独立查询服务。"""
        return CanvasQueryService.element_details_dto(element, details, connections, tree)

    def _apply_layout(self, project: CanvasProject, element: CanvasElement, layout: dict[str, Any] | None, index: int) -> None:
        """执行最小布局策略集合。"""
        request = layout or {"strategy": "row_incremental"}
        self.layout_strategies.get(request["strategy"]).apply(project.canvas, element, request, index)

    @staticmethod
    def _get_connection(project: CanvasProject, connection_id: str) -> CanvasConnection | None:
        """按 Connection ID 查找关系。"""
        return next((item for item in project.canvas.connections if item.connection_id == connection_id), None)

    def _add_connection(self, project: CanvasProject, source: str, target: str) -> CanvasConnection:
        """校验并新增一条 Connection，重复边按幂等结果返回。"""
        if project.canvas.get_element(source) is None or project.canvas.get_element(target) is None:
            raise CanvasDomainError("ELEMENT_NOT_FOUND", "Connection endpoints must reference existing Elements.")
        if source == target:
            raise CanvasDomainError("INVALID_CONNECTION", "A Connection cannot point to the same Element.")
        existing = next((item for item in project.canvas.connections if item.source_element_id == source and item.target_element_id == target), None)
        if existing is not None:
            return existing
        return self.connection_strategies.add(project.canvas, source, target)
