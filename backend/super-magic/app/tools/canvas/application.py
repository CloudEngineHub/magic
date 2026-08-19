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
from app.tools.canvas.codec import SUPPORTED_ELEMENT_TYPES
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasElement, CanvasProject
from app.tools.canvas.generation import (
    AsynchronousGenerationStrategy,
    GenerationCapabilityRegistry,
    GenerationQueryRequest,
    GenerationRequest,
    GenerationSubmission,
    GenerationTask,
    GenerationTaskRepository,
    InMemoryGenerationTaskRepository,
    SynchronousGenerationStrategy,
)
from app.tools.canvas.repository import CanvasRepository
from app.tools.canvas.sidecar import ElementDetailsAdapter
from app.tools.canvas.strategies import ConnectionStrategyRegistry, ContentStrategyRegistry, LayoutStrategyRegistry

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
        self.layout_strategies = layout_strategies or LayoutStrategyRegistry()
        self.content_strategies = content_strategies or ContentStrategyRegistry()
        self.connection_strategies = connection_strategies or ConnectionStrategyRegistry()
        self.sidecar_adapter = ElementDetailsAdapter()
        self.generation_capabilities = generation_capabilities or GenerationCapabilityRegistry(workspace=repository.workspace)
        self.generation_tasks = generation_tasks or _default_generation_tasks
        self.asset_gateway = asset_gateway or WorkspaceAssetGateway(repository.workspace)
        self._sync_generation = SynchronousGenerationStrategy()
        self._async_generation = AsynchronousGenerationStrategy()

    async def initialize(self, project_path: str) -> dict[str, Any]:
        """创建或复用一个 Canvas 项目。"""
        path, created = await self.repository.initialize(project_path)
        return {"project_path": project_path, "project_name": path.name, "created": created}

    async def overview(self, project_path: str, page: int, limit: int) -> dict[str, Any]:
        """返回分页的轻量 Element 概览。"""
        project = await self.repository.read(project_path)
        elements = project.canvas.iter_elements()
        total = len(elements)
        start = (page - 1) * limit
        page_items = elements[start : start + limit]
        connection_map: dict[str, dict[str, list[str]]] = {
            element.element_id: {"incoming": [], "outgoing": []} for element in elements
        }
        for connection in project.canvas.connections:
            if connection.source_element_id in connection_map:
                connection_map[connection.source_element_id]["outgoing"].append(connection.target_element_id)
            if connection.target_element_id in connection_map:
                connection_map[connection.target_element_id]["incoming"].append(connection.source_element_id)
        return {
            "project_path": project_path,
            "project_name": project.name,
            "total_elements": total,
            "total_connections": len(project.canvas.connections),
            "page": page,
            "limit": limit,
            "has_more": start + limit < total,
            "elements": [
                {
                    "element_id": element.element_id,
                    "element_type": element.element_type,
                    "name": element.properties.get("name"),
                    "x": element.properties.get("x"),
                    "y": element.properties.get("y"),
                    "width": element.properties.get("width"),
                    "height": element.properties.get("height"),
                    "content_count": len(element.contents),
                    "active_content_id": element.active_content_id,
                    "main_content_id": element.main_content_id,
                    "status": (element.get_content(element.active_content_id) or CanvasContent("", {})).fields.get("status"),
                    **connection_map[element.element_id],
                }
                for element in page_items
            ],
        }

    async def elements(self, project_path: str, element_ids: list[str]) -> dict[str, Any]:
        """返回精确 Element 的模型友好业务 DTO 和关联连线。"""
        project = await self.repository.read(project_path)
        sidecar_warnings: list[str] = []
        try:
            baseline = await self.repository.read_sidecar(project_path, "element-details.json")
        except ValueError:
            baseline = {}
            sidecar_warnings.append("Some generated Content details are temporarily unavailable.")
        try:
            user = await self.repository.read_sidecar(project_path, "element-details-user.json")
        except ValueError:
            user = {}
            sidecar_warnings.append("Some user-provided Content details are temporarily unavailable.")
        merged_details = self.sidecar_adapter.merge(project, baseline, user)
        requested = []
        for element_id in element_ids:
            element = project.canvas.get_element(element_id)
            if element is None:
                raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {element_id} does not exist.")
            requested.append(element)
        selected = set(element_ids)
        connections = [
            {
                "connection_id": connection.connection_id,
                "source_element_id": connection.source_element_id,
                "target_element_id": connection.target_element_id,
            }
            for connection in project.canvas.connections
            if connection.source_element_id in selected or connection.target_element_id in selected
        ]
        return {
            "project_path": project_path,
            "details_complete": not sidecar_warnings,
            "elements": [self._element_details_dto(element, merged_details.get(element.element_id, {}), connections) for element in requested],
            "connections": connections,
            "warnings": sidecar_warnings,
        }

    async def add_elements(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        generated: list[dict[str, Any]] = []
        self._validate_unique_item_refs(items)

        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            created: dict[str, str] = {}
            results: list[dict[str, Any]] = []
            layout_requests: list[tuple[CanvasElement, dict[str, Any] | None]] = []
            for item in items:
                item_ref = item["item_ref"]
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
                generated_content_id = None
                if content:
                    content = dict(content)
                    self._prepare_imported_content(project, content)
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
                self._apply_layout(project, element, layout, index)
            return {"items": results, "created_element_ids": list(created.values())}, metadata

        result = await self.repository.transaction_with_sidecar(project_path, mutate)
        return await self._submit_generated(project_path, result, generated, tool_context)

    async def add_contents(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """向已有 Element 追加 Content 版本。"""
        generated: list[dict[str, Any]] = []
        self._validate_unique_item_refs(items)

        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            results = []
            for item in items:
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                content_data = dict(item["content"])
                self._prepare_imported_content(project, content_data)
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

        result = await self.repository.transaction_with_sidecar(project_path, mutate)
        return await self._submit_generated(project_path, result, generated, tool_context)

    async def select_main(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """只修改用户明确选择的 main Content 指针。"""
        self._validate_unique_item_refs(items)
        def mutate(project: CanvasProject) -> dict[str, Any]:
            results = []
            for item in items:
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
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

        return await self.repository.transaction(project_path, mutate)

    async def layout(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """按可插拔布局策略调整 Element 布局。"""
        self._validate_unique_item_refs(items)
        def mutate(project: CanvasProject) -> dict[str, Any]:
            results = []
            for index, item in enumerate(items):
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                self._apply_layout(project, element, item["layout"], index)
                results.append({"item_ref": item["item_ref"], "element_id": element.element_id, "strategy": item["layout"]["strategy"]})
            return {"items": results}

        return await self.repository.transaction(project_path, mutate)

    async def connections(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """新增、按 ID 删除或原子替换 Connection。"""
        self._validate_unique_item_refs(items)
        def mutate(project: CanvasProject) -> dict[str, Any]:
            results = []
            for item in items:
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
                    repeated_remove = not source and not target and not existing_old_connections
                    repeated_replace = replace and existing_new is not None and not existing_old_connections
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
                    results.append({"item_ref": item["item_ref"], "status": "removed", "removed_connection_ids": remove_ids})
            return {"items": results}

        return await self.repository.transaction(project_path, mutate)

    async def retry_content(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """校验失败 Content 的受控重试边界；生成提交由后续 Port 接入。"""
        self._validate_unique_item_refs(items)

        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            results = []
            for item in items:
                element = project.canvas.get_element(item["element_id"])
                content = element.get_content(item["content_id"]) if element else None
                if element is None or content is None:
                    raise CanvasDomainError("CONTENT_NOT_FOUND", "The requested Content does not exist.")
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

        result = await self.repository.transaction_with_sidecar(project_path, mutate)
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
        deadline = time.monotonic() + max_wait_seconds
        results = await asyncio.gather(
            *(self._wait_one_safely(project_path, task_id, deadline, tool_context) for task_id in task_ids)
        )
        return {"items": results}

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
        capability = self.generation_capabilities.get(record.element_type)
        if capability.query_port is None:
            return {"generation_task_id": task_id, "status": "processing", "timed_out": True}
        while True:
            query_result = await capability.query_port.query(
                GenerationQueryRequest(
                    provider_task_id=record.provider_task_id,
                    project_path=record.project_path,
                    element_id=record.element_id,
                    content_id=record.content_id,
                ),
                tool_context,
            )
            if query_result.status in {"completed", "failed"}:
                break
            if time.monotonic() >= deadline:
                return {
                    "generation_task_id": task_id,
                    "element_id": record.element_id,
                    "content_id": record.content_id,
                    "status": query_result.status,
                    "timed_out": True,
                    "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
                }
            await asyncio.sleep(min(1.0, max(0.05, deadline - time.monotonic())))

        final_status = query_result.status

        def finalize(project: CanvasProject, metadata: dict) -> tuple[None, dict]:
            """在同一项目事务中完成异步结果和任务元数据回写。"""
            self._apply_generation_result(
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

        await self.repository.transaction_with_sidecar(project_path, finalize)
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
            strategy = self._sync_generation if capability.execution_mode == "sync" else self._async_generation
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
                await self.repository.transaction_with_sidecar(project_path, persist)
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
        elements = metadata.get("elements") if isinstance(metadata, dict) else None
        if isinstance(elements, dict):
            element = elements.get(element_id)
            if isinstance(element, dict):
                details = element.get("contentDetails")
                if isinstance(details, dict) and isinstance(details.get(content_id), dict):
                    return dict(details[content_id])
        legacy = metadata.get("contentDetails") if isinstance(metadata, dict) else None
        if isinstance(legacy, dict) and isinstance(legacy.get(content_id), dict):
            return dict(legacy[content_id])
        return {}

    @staticmethod
    def _set_content_detail(metadata: dict, element_id: str, content_id: str, detail: dict[str, Any]) -> None:
        """按 Element -> Content 的标准 sidecar 结构写入内部详情。"""
        metadata.setdefault("version", "2.0.0")
        elements = metadata.setdefault("elements", {})
        element = elements.setdefault(element_id, {})
        element.setdefault("contentDetails", {})[content_id] = detail
        legacy = metadata.get("contentDetails")
        if isinstance(legacy, dict):
            legacy.pop(content_id, None)
            if not legacy:
                metadata.pop("contentDetails", None)

    @staticmethod
    def _apply_generation_result(
        project: CanvasProject,
        element_id: str,
        content_id: str,
        status: str,
        output_uri: str | None,
        error_message: str | None,
    ) -> None:
        """只回写程序托管的生成状态和结果字段。"""
        element = project.canvas.get_element(element_id)
        content = element.get_content(content_id) if element else None
        if content is None:
            raise CanvasDomainError("CONTENT_NOT_FOUND", "Generated Content no longer exists.")
        content.fields["status"] = status
        if output_uri:
            content.fields["src"] = output_uri
        if error_message:
            content.fields["errorMessage"] = error_message
        else:
            content.fields.pop("errorMessage", None)

    def _build_content(self, data: dict[str, Any], element_type: str) -> CanvasContent:
        """把模型输入转换为主协议允许的 Content 字段。"""
        return self.content_strategies.build(data, element_type)

    def _prepare_imported_content(self, project: CanvasProject, data: dict[str, Any]) -> None:
        """规范化 imported 素材路径并阻止同一素材重复登记。"""
        if data.get("source") != "imported":
            return
        asset_path = str(data.pop("asset_path", "") or "")
        normalized = self.asset_gateway.normalize_existing_file(asset_path)
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
        detail: dict[str, Any] = {
            "elementId": element_id,
            "source": data.get("source", "user"),
        }
        if data.get("source") == "generated":
            detail.update({
                "retryCount": 0,
                "generationStatus": "pending",
                "generationParameters": dict(data),
            })
        elif data.get("source") == "imported":
            detail["assetPath"] = data.get("src")
        return detail

    @staticmethod
    def _validate_unique_item_refs(items: list[dict[str, Any]]) -> None:
        """保证批次关联标签唯一，避免同批引用产生歧义。"""
        refs = [str(item.get("item_ref") or "") for item in items]
        if any(not item_ref for item_ref in refs) or len(refs) != len(set(refs)):
            raise CanvasDomainError("ITEM_REF_INVALID", "item_ref values must be non-empty and unique within a batch.")

    @staticmethod
    def _merge_generation_override(
        element_type: str,
        original: dict[str, Any],
        override: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """只允许覆盖指定生成能力公开的输入字段。"""
        allowed = {
            "image": {"prompt", "size", "model_id", "name", "reference_images"},
            "video": {
                "prompt", "model_id", "name", "reference_image_paths", "reference_video_paths",
                "reference_audio_paths", "frame_start_path", "frame_end_path", "size",
                "duration_seconds", "aspect_ratio", "resolution", "fps", "seed", "watermark", "extensions",
            },
        }.get(element_type)
        if allowed is None:
            raise CanvasDomainError("GENERATION_NOT_CONFIGURED", f"No retry capability is configured for {element_type}.")
        values = dict(override or {})
        unexpected = set(values) - allowed
        if unexpected:
            raise CanvasDomainError(
                "CONTENT_FIELD_MANAGED_INTERNAL",
                f"Generation override contains unsupported fields: {', '.join(sorted(unexpected))}.",
            )
        return {**dict(original or {}), **values}

    @staticmethod
    def _start_retry_detail(
        element_id: str,
        detail: dict[str, Any],
        retry_count: int,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """归档上一次终态并创建不复用旧任务绑定的新重试详情。"""
        updated = dict(detail)
        history = list(updated.get("attemptHistory") or [])
        if updated.get("generationStatus") in {"completed", "failed"}:
            history.append({
                "generationTaskId": updated.get("generationTaskId"),
                "generationStatus": updated.get("generationStatus"),
                "outputUri": updated.get("outputUri"),
                "errorMessage": updated.get("errorMessage"),
            })
        for key in ("providerTaskId", "generationTaskId", "outputUri", "errorMessage"):
            updated.pop(key, None)
        updated.update({
            "elementId": element_id,
            "source": "generated",
            "retryCount": retry_count,
            "generationStatus": "pending",
            "generationParameters": parameters,
            "attemptHistory": history,
        })
        return updated

    @staticmethod
    def _element_details_dto(
        element: CanvasElement,
        details: dict[str, dict[str, Any]],
        connections: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """把持久化字段和内部详情转换为稳定的 Tool DTO。"""
        layout_keys = {
            "x": "x", "y": "y", "width": "width", "height": "height",
            "scaleX": "scale_x", "scaleY": "scale_y", "zIndex": "z_index",
        }
        layout = {
            public_key: element.properties[stored_key]
            for stored_key, public_key in layout_keys.items()
            if stored_key in element.properties
        }
        contents = []
        for content in element.contents:
            detail = details.get(content.content_id, {})
            payload = {
                key: value
                for key, value in content.fields.items()
                if key not in {
                    "src", "status", "errorMessage", "generateImageRequest", "generateVideoRequest",
                    "imageGenerationTaskMeta", "videoGenerationResultMeta",
                }
            }
            item = {
                "content_id": content.content_id,
                "status": content.fields.get("status"),
                "asset_path": content.fields.get("src"),
                "error_message": (
                    "Generation failed; ask the user whether to retry."
                    if content.fields.get("errorMessage")
                    else None
                ),
                "source": detail.get("source"),
                "retry_count": int(detail.get("retryCount", 0)),
                "generation_task_id": detail.get("generationTaskId"),
                "generation_parameters": detail.get("generationParameters"),
                "payload": payload or None,
            }
            contents.append({key: value for key, value in item.items() if value is not None})
        return {
            "element_id": element.element_id,
            "element_type": element.element_type,
            "name": element.properties.get("name"),
            "visible": element.properties.get("visible"),
            "locked": element.properties.get("locked"),
            "opacity": element.properties.get("opacity"),
            "layout": layout,
            "active_content_id": element.active_content_id,
            "main_content_id": element.main_content_id,
            "contents": contents,
            "connections": [
                connection
                for connection in connections
                if connection["source_element_id"] == element.element_id
                or connection["target_element_id"] == element.element_id
            ],
        }

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
