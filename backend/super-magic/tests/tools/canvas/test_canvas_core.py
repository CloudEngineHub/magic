"""独立 Canvas 核心能力的 mock 测试。"""

from __future__ import annotations

import pytest

from app.tools.canvas.application import CanvasApplication
from app.tools.canvas.codec import CanvasCodec
from app.tools.canvas.domain.errors import CanvasDomainError, CanvasProtocolError
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasDocument, CanvasElement, CanvasProject
from app.tools.canvas.generation import (
    GenerationCapability,
    GenerationCapabilityRegistry,
    GenerationQueryResult,
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
