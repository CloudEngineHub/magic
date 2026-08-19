"""独立 Canvas 核心能力的 mock 测试。"""

from __future__ import annotations

import pytest

from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.codec import CanvasCodec
from app.tools.canvas.domain.errors import CanvasBatchError, CanvasDomainError, CanvasProtocolError
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasDocument, CanvasElement, CanvasProject
from app.tools.canvas.generation import (
    AsynchronousGenerationStrategy,
    GenerationCapability,
    GenerationCapabilityRegistry,
    GenerationQueryResult,
    GenerationRequest,
    GenerationSubmission,
)
from app.tools.canvas.repository import CanvasRepository
from app.tools.canvas.tools import AddCanvasConnections, ConnectionInput


def test_codec_round_trip_preserves_nested_content_and_connection() -> None:
    """验证主协议编码和解码不会丢失 Element、Content 与 Connection。"""
    project = CanvasProject(
        version="3.0.0",
        project_type="design",
        name="mock-project",
        canvas=CanvasDocument(
            elements=[
                CanvasElement(
                    element_id="text-1",
                    element_type="text",
                    contents=[CanvasContent("text-content-1", {"content": [{"text": "mock"}]})],
                    active_content_id="text-content-1",
                    main_content_id="text-content-1",
                ),
                CanvasElement(
                    element_id="image-1",
                    element_type="image",
                    contents=[CanvasContent("image-content-1", {"src": "images/mock.png", "status": "completed"})],
                    active_content_id="image-content-1",
                    main_content_id="image-content-1",
                ),
            ],
        ),
    )
    project.canvas.connections.append(CanvasConnection("connection-1", "text-1", "image-1"))

    decoded = CanvasCodec.decode(CanvasCodec.encode(project))

    assert decoded.canvas.get_element("text-1").contents[0].fields["content"][0]["text"] == "mock"
    assert decoded.canvas.connections[0].target_element_id == "image-1"


def test_codec_rejects_unsupported_version() -> None:
    """协议入口必须拒绝不支持的版本。"""
    encoded = CanvasCodec.encode(CanvasCodec.empty_project("mock-project"))
    legacy = encoded.replace('"version":"3.0.0"', '"version":"2.0.0"', 1)

    with pytest.raises(CanvasProtocolError) as error:
        CanvasCodec.decode(legacy)

    assert error.value.code == "UNSUPPORTED_CANVAS_VERSION"


@pytest.mark.asyncio
async def test_connection_replacement_is_atomic_and_idempotent(tmp_path) -> None:
    """替换连线时旧线和新线在同一事务内完成，重复新增不产生重复边。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    await application.add_elements(
        "mock-project",
        [
            {"item_ref": "a", "element_type": "text"},
            {"item_ref": "b", "element_type": "text"},
            {"item_ref": "c", "element_type": "text"},
        ],
    )
    project = await repository.read("mock-project")
    ids = [element.element_id for element in project.canvas.iter_elements()]
    added = await application.connections(
        "mock-project",
        [{"item_ref": "add", "source_element_id": ids[0], "target_element_id": ids[1]}],
    )
    connection_id = added["items"][0]["connection_id"]
    await application.connections(
        "mock-project",
        [{
            "item_ref": "replace",
            "source_element_id": ids[0],
            "target_element_id": ids[2],
            "replace_existing_connections": True,
            "remove_connection_ids": [connection_id],
        }],
    )
    current = await repository.read("mock-project")

    assert len(current.canvas.connections) == 1
    assert current.canvas.connections[0].target_element_id == ids[2]
    assert ConnectionInput(item_ref="remove", remove_connection_ids=[current.canvas.connections[0].connection_id])
    assert AddCanvasConnections.code_mode_only is True


@pytest.mark.asyncio
async def test_connection_removal_rejects_unknown_ids_and_replays_known_deletions(tmp_path) -> None:
    """连线删除必须拒绝未知 ID，并允许已成功删除的精确 ID 幂等重放。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    await application.add_elements(
        "mock-project",
        [{"item_ref": "a", "element_type": "text"}, {"item_ref": "b", "element_type": "text"}],
    )
    project = await repository.read("mock-project")
    element_ids = [element.element_id for element in project.canvas.elements]
    added = await application.connections(
        "mock-project",
        [{"item_ref": "add", "source_element_id": element_ids[0], "target_element_id": element_ids[1]}],
    )
    connection_id = added["items"][0]["connection_id"]

    removed = await application.connections(
        "mock-project",
        [{"item_ref": "remove", "remove_connection_ids": [connection_id]}],
    )
    assert removed["items"][0]["status"] == "removed"

    replayed = await application.connections(
        "mock-project",
        [{"item_ref": "replay", "remove_connection_ids": [connection_id]}],
    )
    assert replayed["items"][0]["status"] == "already_removed"

    with pytest.raises(CanvasDomainError) as unknown:
        await application.connections(
            "mock-project",
            [{"item_ref": "unknown", "remove_connection_ids": ["connection-unknown"]}],
        )
    assert unknown.value.code == "CONNECTION_NOT_FOUND"


@pytest.mark.asyncio
async def test_initial_connections_use_each_current_item_as_anchor(tmp_path) -> None:
    """同批初始连线必须锚定各自 item，而不是批次最后一个 Element。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [
            {"item_ref": "a", "element_type": "text", "connections": [{"target_item_ref": "b"}]},
            {"item_ref": "b", "element_type": "text"},
            {"item_ref": "c", "element_type": "text", "connections": [{"source_item_ref": "b"}]},
        ],
    )
    ids = dict(zip(["a", "b", "c"], created["created_element_ids"], strict=True))
    project = await repository.read("mock-project")
    pairs = {(item.source_element_id, item.target_element_id) for item in project.canvas.connections}

    assert pairs == {(ids["a"], ids["b"]), (ids["b"], ids["c"])}


class MockSynchronousGenerationPort:
    """用于验证同步生成回写的 mock 端口。"""

    execution_mode = "sync"

    async def submit(self, request, tool_context):
        """返回固定的工作区相对图片路径。"""
        return GenerationSubmission("sync", "completed", output_uri="mock/images/result.png")


class MockAsynchronousGenerationPort:
    """用于验证异步任务串联的 mock 端口。"""

    execution_mode = "async"

    def __init__(self):
        """初始化查询次数。"""
        self.query_count = 0

    async def submit(self, request, tool_context):
        """返回稳定的 Canvas 与 provider 任务 ID。"""
        return GenerationSubmission(
            "async",
            "processing",
            generation_task_id="canvas-task-1",
            provider_task_id="provider-task-1",
        )

    async def query(self, request, tool_context):
        """返回固定完成状态和视频路径。"""
        self.query_count += 1
        return GenerationQueryResult("completed", output_uri="mock/videos/result.mp4")


class MockFailedGenerationPort:
    """用于验证失败 Content 重试上限的 mock 端口。"""

    execution_mode = "sync"

    async def submit(self, request, tool_context):
        """始终返回失败结果。"""
        return GenerationSubmission("sync", "failed", error_message="mock generation failure")


class MockIncompleteAsynchronousGenerationPort:
    """用于验证异步提交必须同时返回两类任务标识的 mock 端口。"""

    execution_mode = "async"

    async def submit(self, request, tool_context):
        """只返回 provider 标识，模拟不完整的异步响应。"""
        return GenerationSubmission("async", "processing", provider_task_id="provider-only")


@pytest.mark.asyncio
async def test_generation_strategies_write_sync_result_and_wait_async_result(tmp_path) -> None:
    """同步结果直接回写，异步结果通过同一任务 ID 等待后回写。"""
    image_port = MockSynchronousGenerationPort()
    video_port = MockAsynchronousGenerationPort()
    registry = GenerationCapabilityRegistry([
        GenerationCapability("mock-image", "image", "sync", image_port),
        GenerationCapability("mock-video", "video", "async", video_port, video_port),
    ])
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository, generation_capabilities=registry)
    await application.initialize("mock-project")

    image_result = await application.add_elements(
        "mock-project",
        [{"item_ref": "image", "element_type": "image", "content": {"source": "generated", "content_type": "image", "prompt": "mock"}}],
    )
    video_result = await application.add_elements(
        "mock-project",
        [{"item_ref": "video", "element_type": "video", "content": {"source": "generated", "content_type": "video", "prompt": "mock"}}],
    )
    waited = await application.wait("mock-project", ["canvas-task-1"], max_wait_seconds=1)
    waited_again = await application.wait("mock-project", ["canvas-task-1"], max_wait_seconds=1)
    project = await repository.read("mock-project")

    image = project.canvas.get_element(image_result["items"][0]["element_id"])
    video = project.canvas.get_element(video_result["items"][0]["element_id"])
    assert image.get_content(image.active_content_id).fields["src"] == "mock/images/result.png"
    assert video_result["items"][0]["generation_task_id"] == "canvas-task-1"
    assert waited["items"][0]["status"] == "completed"
    assert waited_again["items"][0]["already_finalized"] is True
    assert video_port.query_count == 1
    assert video.get_content(video.active_content_id).fields["src"] == "mock/videos/result.mp4"


@pytest.mark.asyncio
async def test_async_generation_requires_canvas_and_provider_task_ids() -> None:
    """异步任务缺少任一任务标识时必须拒绝，避免模型无法继续等待。"""
    capability = GenerationCapability(
        "incomplete",
        "video",
        "async",
        MockIncompleteAsynchronousGenerationPort(),
        MockIncompleteAsynchronousGenerationPort(),
    )

    with pytest.raises(CanvasDomainError) as error:
        await AsynchronousGenerationStrategy().execute(
            capability,
            GenerationRequest("mock-project", "video-1", "content-1", "video"),
            None,
        )

    assert error.value.code == "GENERATION_TASK_ID_MISSING"


@pytest.mark.asyncio
async def test_add_first_content_to_empty_element_initializes_content_pointers(tmp_path) -> None:
    """空 Element 首次追加 Content 时应初始化 active 和 main 指针。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [{"item_ref": "empty", "element_type": "text"}],
    )
    element_id = created["items"][0]["element_id"]

    result = await application.add_contents(
        "mock-project",
        [{
            "item_ref": "first-content",
            "element_id": element_id,
            "content": {"source": "user", "content_type": "text", "content": [{"text": "mock"}]},
        }],
    )
    project = await repository.read("mock-project")
    element = project.canvas.get_element(element_id)
    content_id = result["items"][0]["content_id"]

    assert element.active_content_id == content_id
    assert element.main_content_id == content_id


@pytest.mark.asyncio
async def test_imported_asset_is_normalized_and_cannot_be_registered_twice(tmp_path) -> None:
    """imported Content 只能登记真实工作区文件，并按规范路径去重。"""
    asset = tmp_path / "mock-project" / "images" / "mock.png"
    asset.parent.mkdir(parents=True)
    asset.write_bytes(b"mock")
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")

    await application.add_elements(
        "mock-project",
        [{
            "item_ref": "asset-one",
            "element_type": "image",
            "content": {
                "source": "imported",
                "content_type": "image",
                "asset_path": "mock-project/images/mock.png",
            },
        }],
    )

    with pytest.raises(CanvasDomainError) as error:
        await application.add_elements(
            "mock-project",
            [{
                "item_ref": "asset-two",
                "element_type": "image",
                "content": {
                    "source": "imported",
                    "content_type": "image",
                    "asset_path": "mock-project/images/mock.png",
                },
            }],
        )

    assert error.value.code == "ASSET_ALREADY_REGISTERED"


@pytest.mark.asyncio
async def test_generated_content_retry_is_limited_and_reuses_content_id(tmp_path) -> None:
    """失败 generated Content 最多重试两次，且始终复用原 Content ID。"""
    failed_port = MockFailedGenerationPort()
    registry = GenerationCapabilityRegistry([
        GenerationCapability("mock-image", "image", "sync", failed_port),
    ])
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository, generation_capabilities=registry)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [{
            "item_ref": "image",
            "element_type": "image",
            "content": {"source": "generated", "content_type": "image", "prompt": "mock"},
        }],
    )
    element_id = created["items"][0]["element_id"]
    content_id = created["items"][0]["content_id"]

    for retry_index in range(2):
        result = await application.retry_content(
            "mock-project",
            [{
                "item_ref": f"retry-{retry_index}",
                "element_id": element_id,
                "content_id": content_id,
                "generation_override": {"prompt": f"mock-{retry_index}"},
            }],
        )
        assert result["items"][0]["content_id"] == content_id
        assert result["items"][0]["status"] == "failed"

    with pytest.raises(CanvasDomainError) as error:
        await application.retry_content(
            "mock-project",
            [{"item_ref": "retry-limit", "element_id": element_id, "content_id": content_id}],
        )

    assert error.value.code == "CONTENT_RETRY_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_element_details_use_public_names_when_sidecar_is_damaged(tmp_path) -> None:
    """详情查询在扩展详情损坏时仍返回公开 DTO，不泄露内部文件名。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [{
            "item_ref": "text",
            "element_type": "text",
            "content": {"source": "user", "content_type": "text", "content": [{"text": "mock"}]},
        }],
    )
    (tmp_path / "mock-project" / "element-details.json").write_text("not-json", encoding="utf-8")

    details = await application.elements("mock-project", [created["items"][0]["element_id"]])

    assert details["details_complete"] is False
    assert details["elements"][0]["element_id"] == created["items"][0]["element_id"]
    assert details["elements"][0]["contents"][0]["content_id"] == created["items"][0]["content_id"]
    assert all("element-details" not in warning for warning in details["warnings"])


async def _create_positioned_elements(tmp_path):
    """创建带有 mock 几何信息的根级 Element。"""
    repository = CanvasRepository(tmp_path)
    application = CanvasApplication(repository)
    await application.initialize("mock-project")
    created = await application.add_elements(
        "mock-project",
        [
            {"item_ref": "first", "element_type": "image"},
            {"item_ref": "second", "element_type": "image"},
            {"item_ref": "third", "element_type": "image"},
        ],
    )
    ids = dict(zip(("first", "second", "third"), created["created_element_ids"], strict=True))

    def set_geometry(project):
        """写入测试专用的几何字段。"""
        values = {
            ids["first"]: {"x": 100, "y": 200, "width": 100, "height": 80, "zIndex": 1},
            ids["second"]: {"x": 300, "y": 260, "width": 120, "height": 90, "zIndex": 2},
            ids["third"]: {"x": 600, "y": 100, "width": 80, "height": 80, "zIndex": 3},
        }
        for element in project.canvas.elements:
            element.properties.update(values[element.element_id])
        content = CanvasContent("first-content", {"src": "./images/mock.png", "status": "completed"})
        project.canvas.get_element(ids["first"]).contents.append(content)
        project.canvas.get_element(ids["first"]).active_content_id = content.content_id
        project.canvas.get_element(ids["first"]).main_content_id = content.content_id

    await repository.transaction("mock-project", set_geometry)
    return repository, application, ids


@pytest.mark.asyncio
async def test_frame_selection_preserves_ids_connections_and_converts_to_local_coordinates(tmp_path) -> None:
    """框选应保留 Element/Content/Connection 标识，并转换为 Frame 局部坐标。"""
    repository, application, ids = await _create_positioned_elements(tmp_path)
    connection = await application.connections(
        "mock-project",
        [{"item_ref": "link", "source_element_id": ids["first"], "target_element_id": ids["third"]}],
    )
    connection_id = connection["items"][0]["connection_id"]
    before = await repository.read("mock-project")
    first_content_id = before.canvas.get_element(ids["first"]).active_content_id

    framed = await application.frame_elements(
        "mock-project",
        [{"item_ref": "frame", "element_ids": [ids["first"], ids["second"]]}],
    )
    frame_id = framed["items"][0]["frame_element_id"]
    frame = (await repository.read("mock-project")).canvas.get_element(frame_id)
    first = frame.children[0]
    second = frame.children[1]

    assert framed["items"][0]["child_element_ids"] == [ids["first"], ids["second"]]
    assert frame.element_type == "frame"
    assert frame.active_content_id == framed["items"][0]["content_id"]
    assert first.element_id == ids["first"]
    assert second.element_id == ids["second"]
    assert first.properties["x"] == pytest.approx(100 / 1 - frame.properties["x"])
    assert second.properties["y"] == pytest.approx(260 - frame.properties["y"])
    assert first.contents[0].content_id == first_content_id
    assert any(
        item.connection_id == connection_id
        and item.source_element_id == ids["first"]
        and item.target_element_id == ids["third"]
        for item in (await repository.read("mock-project")).canvas.connections
    )

    details = await application.elements("mock-project", [frame_id, ids["first"]])
    frame_detail = details["elements"][0]
    child_detail = details["elements"][1]
    assert frame_detail["parent_element_id"] is None
    assert frame_detail["depth"] == 0
    assert frame_detail["child_element_ids"] == [ids["first"], ids["second"]]
    assert child_detail["parent_element_id"] == frame_id
    assert child_detail["depth"] == 1


@pytest.mark.asyncio
async def test_frame_selection_uses_explicit_and_default_padding(tmp_path) -> None:
    """默认 padding 和显式 padding 都必须写入稳定的 Frame 几何结果。"""
    _, application, ids = await _create_positioned_elements(tmp_path)

    default_result = await application.frame_elements(
        "mock-project",
        [{"item_ref": "default", "element_ids": [ids["first"], ids["second"]]}],
    )
    default_padding = default_result["items"][0]["padding"]
    assert default_padding == pytest.approx(320 / 18)

    _, application, ids = await _create_positioned_elements(tmp_path / "explicit")
    explicit_result = await application.frame_elements(
        "mock-project",
        [{"item_ref": "explicit", "element_ids": [ids["first"], ids["second"]], "padding": 12.5}],
    )
    assert explicit_result["items"][0]["padding"] == pytest.approx(12.5)


@pytest.mark.asyncio
async def test_frame_selection_rejects_nested_and_mixed_batch_items(tmp_path) -> None:
    """已嵌套节点、重复选区和混合批次必须整体拒绝。"""
    _, application, ids = await _create_positioned_elements(tmp_path)
    framed = await application.frame_elements(
        "mock-project",
        [{"item_ref": "frame", "element_ids": [ids["first"], ids["second"]]}],
    )
    frame_id = framed["items"][0]["frame_element_id"]

    with pytest.raises(CanvasDomainError) as nested_error:
        await application.frame_elements(
            "mock-project",
            [{"item_ref": "nested", "element_ids": [ids["first"], ids["third"]]}],
        )
    assert nested_error.value.code == "FRAME_SELECTION_ALREADY_NESTED"

    with pytest.raises(CanvasBatchError) as overlap_error:
        await application.frame_elements(
            "mock-project",
            [
                {"item_ref": "one", "element_ids": [ids["third"]]},
                {"item_ref": "two", "element_ids": [ids["third"]]},
            ],
        )
    assert overlap_error.value.code == "BATCH_VALIDATION_FAILED"
    assert overlap_error.value.items == [
        {
            "item_ref": "one",
            "status": "not_applied",
            "error_code": "BATCH_VALIDATION_FAILED",
            "reason": "The atomic batch was not written because another item failed validation.",
        },
        {
            "item_ref": "two",
            "status": "failed",
            "error_code": "FRAME_SELECTION_OVERLAP",
            "reason": "Frame selections in one batch cannot overlap.",
        },
    ]
    assert (await application.elements("mock-project", [frame_id]))["elements"][0]["child_element_ids"] == [ids["first"], ids["second"]]


@pytest.mark.asyncio
async def test_layout_uses_direct_parent_local_coordinates_and_rejects_cross_container_flow(tmp_path) -> None:
    """布局只使用直接父级兄弟节点，并拒绝跨容器依赖流程。"""
    repository, application, ids = await _create_positioned_elements(tmp_path)
    framed = await application.frame_elements(
        "mock-project",
        [{"item_ref": "frame", "element_ids": [ids["first"], ids["second"]]}],
    )
    frame_id = framed["items"][0]["frame_element_id"]

    def add_local_child(project):
        """添加一个测试用的 Frame 子节点，坐标使用局部空间。"""
        frame = project.canvas.get_element(frame_id)
        frame.children.append(CanvasElement("local-target", "image", {"width": 100, "height": 80}))

    await repository.transaction("mock-project", add_local_child)
    result = await application.layout(
        "mock-project",
        [{"item_ref": "local", "element_id": "local-target", "layout": {"strategy": "row_incremental"}}],
    )
    assert result["items"][0]["element_id"] == "local-target"
    local_target = (await repository.read("mock-project")).canvas.get_element("local-target")
    assert local_target.properties["x"] == pytest.approx(300 + 120 + 200 - (100 - 320 / 18))

    await application.connections(
        "mock-project",
        [{"item_ref": "cross", "source_element_id": ids["third"], "target_element_id": "local-target"}],
    )
    with pytest.raises(CanvasDomainError) as cross_error:
        await application.layout(
            "mock-project",
            [{"item_ref": "flow", "element_id": "local-target", "layout": {"strategy": "dependency_flow"}}],
        )
    assert cross_error.value.code == "LAYOUT_CROSS_CONTAINER_UNSUPPORTED"


@pytest.mark.asyncio
async def test_frame_tools_reject_content_main_and_retry_but_allow_connections(tmp_path) -> None:
    """Frame 只允许结构相关操作，普通 Content 和生成操作必须有明确门禁。"""
    _, application, ids = await _create_positioned_elements(tmp_path)
    framed = await application.frame_elements(
        "mock-project",
        [{"item_ref": "frame", "element_ids": [ids["first"], ids["second"]]}],
    )
    frame_id = framed["items"][0]["frame_element_id"]
    frame_content_id = framed["items"][0]["content_id"]

    with pytest.raises(CanvasDomainError) as content_error:
        await application.add_contents(
            "mock-project",
            [{"item_ref": "content", "element_id": frame_id, "content": {"source": "user", "content_type": "text", "content": [{"text": "no"}]}}],
        )
    assert content_error.value.code == "FRAME_CONTENT_MANAGED_INTERNAL"

    with pytest.raises(CanvasDomainError) as retry_error:
        await application.retry_content(
            "mock-project",
            [{"item_ref": "retry", "element_id": frame_id, "content_id": frame_content_id}],
        )
    assert retry_error.value.code == "CONTENT_RETRY_NOT_ALLOWED"

    with pytest.raises(CanvasDomainError) as main_error:
        await application.select_main(
            "mock-project",
            [{"item_ref": "main", "element_id": frame_id, "content_id": frame_content_id}],
        )
    assert main_error.value.code == "FRAME_CONTENT_MANAGED_INTERNAL"

    connection = await application.connections(
        "mock-project",
        [{"item_ref": "frame-link", "source_element_id": frame_id, "target_element_id": ids["third"]}],
    )
    assert connection["items"][0]["status"] == "added"
