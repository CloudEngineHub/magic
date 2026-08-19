"""Canvas 模型调用契约、批量错误和 sidecar 边界测试。"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.domain.errors import CanvasBatchError, CanvasDomainError
from app.tools.canvas.domain.models import CanvasElement
from app.tools.canvas.generation import (
    GenerationCapability,
    GenerationCapabilityRegistry,
    GenerationQueryResult,
    GenerationSubmission,
    InMemoryGenerationTaskRepository,
)
from app.tools.canvas.presentation.model_content import elements_content, items_content
from app.tools.canvas.repository import CanvasRepository
from app.tools.canvas.tools import (
    AddCanvasElements,
    ContentInput,
    QueryCanvasElementDetails,
    QueryCanvasOverview,
    WaitCanvasGeneration,
    _error_result,
)
from agentlang.tools.tool_result import ToolResult


def test_content_input_exposes_one_stable_model_schema() -> None:
    """Content Schema 不应把多个联合分支同时暴露给大模型。"""
    schema = AddCanvasElements.Params.model_json_schema()["$defs"]["ContentInput"]

    assert "anyOf" not in schema
    assert "oneOf" not in schema
    assert schema["required"] == ["source", "content_type"]
    assert schema["examples"][0] == {
        "source": "user",
        "content_type": "text",
        "content": "标题文本",
    }


def test_content_input_accepts_text_and_rejects_incomplete_generation() -> None:
    """文本使用 content 字段，生成内容必须提供 prompt。"""
    text = ContentInput(source="user", content_type="text", content="mock text")
    assert text.content == "mock text"

    with pytest.raises(ValidationError, match="source=generated requires prompt"):
        ContentInput(source="generated", content_type="image")


def test_wait_schema_uses_tasks_with_generation_task_id() -> None:
    """等待工具保持技术方案约定的 tasks 结构。"""
    schema = WaitCanvasGeneration.Params.model_json_schema()

    assert schema["required"] == ["project_path", "tasks"]
    assert schema["properties"]["tasks"]["items"]["$ref"].endswith("/$defs/WaitTask")


@pytest.mark.asyncio
async def test_atomic_batch_error_preserves_each_item_and_rolls_back(tmp_path) -> None:
    """批量预检失败时返回逐项状态，并且不留下半完成节点。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")

    with pytest.raises(CanvasBatchError) as raised:
        await application.add_elements(
            "mock-project",
            [
                {"item_ref": "valid", "element_type": "text"},
                {"item_ref": "invalid", "element_type": "unsupported"},
            ],
        )

    assert raised.value.items[0]["item_ref"] == "valid"
    assert raised.value.items[0]["status"] == "not_applied"
    assert raised.value.items[1]["item_ref"] == "invalid"
    assert raised.value.items[1]["status"] == "failed"
    assert raised.value.items[1]["error_code"] == "INVALID_ELEMENT"
    assert (await application.overview("mock-project", 1, 50))["total_elements"] == 0


def test_batch_error_content_is_model_actionable() -> None:
    """批量错误的 ToolResult.content 必须包含逐项定位和下一步动作。"""
    result = _error_result(CanvasBatchError([
        {
            "item_ref": "valid",
            "status": "not_applied",
            "error_code": "BATCH_VALIDATION_FAILED",
            "reason": "Atomic batch not written.",
        },
        {
            "item_ref": "invalid",
            "status": "failed",
            "error_code": "INVALID_ELEMENT",
            "reason": "Unsupported Element type.",
        },
    ]))

    assert result.ok is False
    assert "item_ref=valid | status=not_applied" in result.content
    assert "item_ref=invalid | status=failed | error_code=INVALID_ELEMENT" in result.content
    assert "correct only the failed items" in result.content


def test_model_content_contains_follow_up_and_specific_error_action() -> None:
    """模型结果必须包含可串联的下一步和稳定错误处理建议。"""
    success = items_content(
        "Canvas Elements added successfully.",
        {"items": [{"item_ref": "text", "status": "completed", "element_id": "element-1"}]},
        "call query_canvas_element_details with the returned element_id",
    )
    assert "Next: call query_canvas_element_details" in success

    failed = _error_result(CanvasDomainError("CONTENT_NOT_FOUND", "Content content-1 does not exist."))
    assert "content-1" in failed.content
    assert "Action:" in failed.content


@pytest.mark.asyncio
async def test_invalid_user_sidecar_is_visible_and_blocks_writes(tmp_path) -> None:
    """不支持的 user sidecar 不能被静默忽略或在写操作中覆盖。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [{"item_ref": "text", "element_type": "text"}],
    )
    element_id = created["items"][0]["element_id"]
    user_sidecar = tmp_path / "mock-project" / "element-details-user.json"
    user_sidecar.write_text(json.dumps({"elements": []}), encoding="utf-8")

    details = await application.elements("mock-project", [element_id])
    assert details["details_complete"] is False
    assert details["warnings"] == ["Some user-provided Content details are temporarily unavailable."]

    with pytest.raises(ValueError, match="UNSUPPORTED_ELEMENT_DETAILS_STRUCTURE"):
        await application.add_contents(
            "mock-project",
            [{
                "item_ref": "append",
                "element_id": element_id,
                "content": {"source": "user", "content_type": "text", "content": "new"},
            }],
        )

    assert user_sidecar.read_text(encoding="utf-8") == json.dumps({"elements": []})


@pytest.mark.asyncio
async def test_invalid_user_sidecar_blocks_layout_and_frame_writes(tmp_path) -> None:
    """所有 Canvas 结构写操作都必须尊重损坏 user sidecar 的保护边界。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [
            {"item_ref": "one", "element_type": "text"},
            {"item_ref": "two", "element_type": "text"},
        ],
    )
    ids = created["created_element_ids"]
    user_sidecar = tmp_path / "mock-project" / "element-details-user.json"
    user_sidecar.write_text(json.dumps({"elements": []}), encoding="utf-8")

    with pytest.raises(ValueError, match="UNSUPPORTED_ELEMENT_DETAILS_STRUCTURE"):
        await application.layout(
            "mock-project",
            [{"item_ref": "layout", "element_id": ids[0], "layout": {"strategy": "row_incremental"}}],
        )
    with pytest.raises(ValueError, match="UNSUPPORTED_ELEMENT_DETAILS_STRUCTURE"):
        await application.frame_elements(
            "mock-project",
            [{"item_ref": "frame", "element_ids": ids}],
        )

    assert user_sidecar.read_text(encoding="utf-8") == json.dumps({"elements": []})


@pytest.mark.asyncio
async def test_single_item_keeps_specific_error_code(tmp_path) -> None:
    """单项工具错误保留稳定业务码，不被批量汇总码覆盖。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")

    with pytest.raises(CanvasDomainError) as raised:
        await application.add_elements(
            "mock-project",
            [{"item_ref": "invalid", "element_type": "unsupported"}],
        )

    assert raised.value.code == "INVALID_ELEMENT"


def test_element_details_content_does_not_dump_raw_element_dto() -> None:
    """详情 content 应提供可读摘要，而不是把内部 DTO 原样注入模型上下文。"""
    content = elements_content(
        {
            "project_path": "Canvas/Demo",
            "details_complete": True,
            "elements": [
                {
                    "element_id": "element-1",
                    "element_type": "text",
                    "name": "Title",
                    "parent_element_id": None,
                    "depth": 0,
                    "layout": {"x": 1, "y": 2},
                    "child_element_ids": [],
                    "active_content_id": "content-1",
                    "main_content_id": "content-1",
                    "contents": [
                        {
                            "content_id": "content-1",
                            "status": "completed",
                            "source": "user",
                            "payload": {"content": "Hello"},
                        }
                    ],
                    "children": [],
                    "connections": [],
                }
            ],
            "connections": [],
        }
    )

    assert "Element element-1:" in content
    assert "content=Hello" in content
    assert '"element_id"' not in content
    assert '"contents"' not in content


@pytest.mark.asyncio
async def test_sidecar_write_validation_rolls_back_main_file(tmp_path) -> None:
    """sidecar 写后校验失败时，主文件不能留下半完成的修改。"""
    repository = CanvasRepository(tmp_path)
    await repository.initialize("mock-project")

    def mutate(project, metadata):
        project.canvas.elements.append(CanvasElement("temporary", "text"))
        return {"ok": True}, {"elements": []}

    with pytest.raises(ValueError, match="UNSUPPORTED_ELEMENT_DETAILS_STRUCTURE"):
        await repository.transaction_with_sidecar("mock-project", mutate)

    project = await repository.read("mock-project")
    assert project.canvas.get_element("temporary") is None


class RecoverableVideoPort:
    """用于验证新 Application 实例从 sidecar 恢复异步任务的 mock。"""

    execution_mode = "async"

    async def submit(self, request, tool_context):
        """返回固定的 Canvas 和 provider 任务标识。"""
        return GenerationSubmission(
            "async",
            "processing",
            generation_task_id="recoverable-canvas-task",
            provider_task_id="recoverable-provider-task",
        )

    async def query(self, request, tool_context):
        """返回固定完成结果。"""
        return GenerationQueryResult("completed", output_uri="mock/videos/recovered.mp4")


class FailingTaskRepository:
    """用于验证任务仓储失败时仍可从 Canvas sidecar 恢复的 mock。"""

    async def put(self, task):
        """模拟任务绑定写入失败。"""
        raise RuntimeError("mock task repository failure")

    async def get(self, generation_task_id):
        """该仓储不提供运行期任务记录。"""
        return None

    async def update(self, task):
        """模拟更新不可用。"""
        raise RuntimeError("mock task repository failure")


@pytest.mark.asyncio
async def test_async_generation_recovers_between_application_instances(tmp_path) -> None:
    """新的 Application 实例应能仅凭 sidecar 任务绑定继续等待。"""
    port = RecoverableVideoPort()
    registry = GenerationCapabilityRegistry([
        GenerationCapability("recoverable-video", "video", "async", port, port),
    ])
    repository = CanvasRepository(tmp_path)
    first = CanvasApplication(
        repository,
        generation_capabilities=registry,
        generation_tasks=InMemoryGenerationTaskRepository(),
    )
    await first.initialize("mock-project")
    created = await first.add_elements(
        "mock-project",
        [{
            "item_ref": "video",
            "element_type": "video",
            "content": {"source": "generated", "content_type": "video", "prompt": "mock"},
        }],
    )
    assert created["items"][0]["generation_task_id"] == "recoverable-canvas-task"

    second = CanvasApplication(
        repository,
        generation_capabilities=registry,
        generation_tasks=InMemoryGenerationTaskRepository(),
    )
    waited = await second.wait("mock-project", ["recoverable-canvas-task"], max_wait_seconds=1)

    assert waited["items"][0]["status"] == "completed"
    assert waited["items"][0]["output_uri"] == "mock/videos/recovered.mp4"


@pytest.mark.asyncio
async def test_async_generation_recovers_when_task_repository_write_fails(tmp_path) -> None:
    """任务仓储写失败时，sidecar 绑定仍应支持后续等待恢复。"""
    port = RecoverableVideoPort()
    registry = GenerationCapabilityRegistry([
        GenerationCapability("recoverable-video", "video", "async", port, port),
    ])
    repository = CanvasRepository(tmp_path)
    first = CanvasApplication(
        repository,
        generation_capabilities=registry,
        generation_tasks=FailingTaskRepository(),
    )
    await first.initialize("mock-project")
    created = await first.add_elements(
        "mock-project",
        [{
            "item_ref": "video",
            "element_type": "video",
            "content": {"source": "generated", "content_type": "video", "prompt": "mock"},
        }],
    )
    assert created["items"][0]["generation_task_id"] == "recoverable-canvas-task"
    assert created["items"][0]["persistence_warning"]

    second = CanvasApplication(
        repository,
        generation_capabilities=registry,
        generation_tasks=InMemoryGenerationTaskRepository(),
    )
    waited = await second.wait("mock-project", ["recoverable-canvas-task"], max_wait_seconds=1)

    assert waited["items"][0]["status"] == "completed"


def test_feedback_and_content_are_separate_channels() -> None:
    """模型 content 只保留语义摘要，结构化 ID 留在 data 中。"""
    result = ToolResult(
        content="Canvas Elements added successfully.\n- item_ref=image | status=completed",
        data={"items": [{"item_ref": "image", "status": "completed", "element_id": "element-1"}]},
    )
    assert result.content.startswith("Canvas Elements added successfully.")
    assert "element-1" not in result.content
    assert result.data["items"][0]["element_id"] == "element-1"


@pytest.mark.asyncio
async def test_user_feedback_changes_with_query_targets_and_wait_state() -> None:
    """用户界面反馈应包含查询目标，并区分等待完成和超时。"""
    context = ToolContext()
    overview = QueryCanvasOverview()
    overview_feedback = await overview.get_before_tool_call_friendly_action_and_remark(
        overview.name,
        context,
        {"project_path": "Canvas/Demo", "page": 2, "limit": 7},
    )
    assert "第 2 页" in overview_feedback["remark"]
    assert "7" in overview_feedback["remark"]

    details = QueryCanvasElementDetails()
    details_feedback = await details.get_before_tool_call_friendly_action_and_remark(
        details.name,
        context,
        {"project_path": "Canvas/Demo", "element_ids": ["element-1", "element-2"]},
    )
    assert "element-1" in details_feedback["remark"]
    assert "element-2" in details_feedback["remark"]

    wait = WaitCanvasGeneration()
    wait_args = {
        "project_path": "Canvas/Demo",
        "tasks": [{"generation_task_id": "task-1"}],
        "max_wait_seconds": 5,
    }
    completed = await wait.get_after_tool_call_friendly_action_and_remark(
        wait.name,
        context,
        ToolResult(content="ok", data={"items": [{"status": "completed"}]}),
        0.1,
        wait_args,
    )
    timed_out = await wait.get_after_tool_call_friendly_action_and_remark(
        wait.name,
        context,
        ToolResult(content="ok", data={"items": [{"status": "processing", "timed_out": True}]}),
        0.1,
        wait_args,
    )
    assert completed["action"] != timed_out["action"]
