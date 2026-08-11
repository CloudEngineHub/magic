"""Canvas V3 manager 与 Content sidecar 测试。"""

import json

import pytest

from agentlang.path_manager import PathManager
from app.tools.design.codec.envelope_codec import (
    CanvasEnvelopeCodec,
    UnsupportedCanvasVersionError,
)
from app.tools.design.codec.v3_codec import MAGIC_PROJECT_VERSION_V3
from app.tools.design.domain.canvas_document import (
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.manager.canvas_manager_v3 import (
    CanvasManagerV3,
    write_magic_project_js_v3,
)
from app.tools.design.utils.magic_project_compression import decompress_canvas_data
from app.tools.design.utils.magic_project_design_parser import ImageElement
from app.utils.async_file_utils import async_mkdir, async_read_json, async_read_text, async_write_text


def _build_config_with_heavy_fields() -> MagicProjectConfigV3:
    """构造包含 Content 重字段的 mock V3 配置。"""
    content_id = "image-1-content-1"
    return MagicProjectConfigV3(
        version=MAGIC_PROJECT_VERSION_V3,
        type="design",
        name="V3 manager 模拟项目",
        canvas=CanvasDocumentV3(
            elements=[
                CanvasElementV3(
                    id="image-1",
                    type="image",
                    properties={
                        "name": "模拟图片",
                        "x": 0,
                        "y": 0,
                        "width": 320,
                        "height": 180,
                        "zIndex": 1,
                    },
                    contents=[
                        ElementContent(
                            content_id=content_id,
                            fields={"src": "./images/mock.png", "status": "completed"},
                        )
                    ],
                    active_content_id=content_id,
                    main_content_id=content_id,
                )
            ]
        ),
    )


@pytest.mark.asyncio
async def test_v3_manager_writes_content_details_and_rehydrates(monkeypatch, tmp_path):
    """V3 manager 把重字段写入 Content sidecar，并在读取时合并回来。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    await async_mkdir(tmp_path / "v3-project", parents=True, exist_ok=True)
    await write_magic_project_js_v3("v3-project", _build_config_with_heavy_fields())
    manager = await get_canvas_manager("v3-project")
    assert isinstance(manager, CanvasManagerV3)

    async def add_heavy_fields(config: MagicProjectConfigV3) -> str:
        """向 active Content 写入 mock 重字段。"""
        image = config.canvas.get_element("image-1")
        assert image is not None
        content = image.get_active_content()
        assert content is not None
        content.fields["generateImageRequest"] = {"image_id": "mock-task"}
        content.fields["visualUnderstanding"] = {"summary": "mock summary"}
        return content.content_id

    await manager.run_write_transaction(add_heavy_fields)

    raw_content = await async_read_text(tmp_path / "v3-project" / "magic.project.js")
    envelope = CanvasEnvelopeCodec.decode(raw_content)
    canvas_data = decompress_canvas_data(envelope["canvas"])
    persisted_content = canvas_data["elements"][0]["contents"][0]
    assert "generateImageRequest" not in persisted_content
    assert "visualUnderstanding" not in persisted_content

    sidecar = await async_read_json(tmp_path / "v3-project" / "element-details.json")
    content_details = sidecar["elements"]["image-1"]["contentDetails"]["image-1-content-1"]
    assert content_details["generateImageRequest"] == {"image_id": "mock-task"}
    assert content_details["visualUnderstanding"] == {"summary": "mock summary"}

    hydrated = await manager.read_current_canvas()
    hydrated_content = hydrated.canvas.get_element("image-1").get_active_content()
    assert hydrated_content.fields["generateImageRequest"] == {"image_id": "mock-task"}
    assert hydrated_content.fields["visualUnderstanding"] == {"summary": "mock summary"}


@pytest.mark.asyncio
async def test_v3_manager_reads_user_sidecar_without_overwriting_it(monkeypatch, tmp_path):
    """V3 manager 读取 user sidecar 的优先值，但持久化时不改写该文件。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    await async_mkdir(tmp_path / "v3-user-project", parents=True, exist_ok=True)
    await write_magic_project_js_v3("v3-user-project", _build_config_with_heavy_fields())
    user_sidecar = {
        "version": "2.0.0",
        "elements": {
            "image-1": {
                "source": "user",
                "contentDetails": {
                    "image-1-content-1": {
                        "visualUnderstanding": {"summary": "user mock summary"}
                    }
                },
            }
        },
    }
    user_path = tmp_path / "v3-user-project" / "element-details-user.json"
    original_user_content = json.dumps(user_sidecar, ensure_ascii=False, indent=2)
    await async_write_text(user_path, original_user_content)

    manager = CanvasManagerV3("v3-user-project")
    config = await manager.read_current_canvas()
    content = config.canvas.get_element("image-1").get_active_content()
    assert content.fields["visualUnderstanding"] == {"summary": "user mock summary"}

    await manager.run_write_transaction(lambda current: current.name)
    assert await async_read_text(user_path) == original_user_content


@pytest.mark.asyncio
async def test_canvas_manager_factory_rejects_unknown_version(monkeypatch, tmp_path):
    """版本工厂对未知顶层版本 fail-closed，不再回退 V1。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    project_dir = tmp_path / "unknown-project"
    await async_mkdir(project_dir, parents=True, exist_ok=True)
    unknown_content = CanvasEnvelopeCodec.encode(
        {"version": "9.9.9", "type": "design", "name": "未知版本", "canvas": None}
    )
    await async_write_text(project_dir / "magic.project.js", unknown_content)

    with pytest.raises(UnsupportedCanvasVersionError, match="9.9.9"):
        await get_canvas_manager("unknown-project")


@pytest.mark.asyncio
async def test_v3_manager_persists_internal_layout_for_new_elements(monkeypatch, tmp_path):
    """V3 manager 为事务中新建节点补齐坐标和图层，且不移动已有节点。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    await async_mkdir(tmp_path / "v3-layout-project", parents=True, exist_ok=True)
    await write_magic_project_js_v3("v3-layout-project", _build_config_with_heavy_fields())
    manager = CanvasManagerV3("v3-layout-project")

    def append_storyboard(config: MagicProjectConfigV3) -> str:
        """模拟新工具直接追加一个未指定布局的业务节点。"""
        element = CanvasElementV3(
            id="storyboard-1",
            type="storyboard",
            properties={"name": "模拟分镜"},
            contents=[
                ElementContent(
                    content_id="storyboard-1-content-1",
                    fields={"shots": []},
                )
            ],
            active_content_id="storyboard-1-content-1",
            main_content_id="storyboard-1-content-1",
        )
        config.canvas.elements.append(element)
        return element.id

    await manager.run_write_transaction(append_storyboard)
    config = await manager.read_current_canvas()
    existing = config.canvas.get_element("image-1")
    storyboard = config.canvas.get_element("storyboard-1")

    assert existing is not None
    assert existing.properties["x"] == 0
    assert existing.properties["y"] == 0
    assert existing.properties["zIndex"] == 1
    assert storyboard is not None
    assert storyboard.properties["x"] == 520.0
    assert storyboard.properties["y"] == 0.0
    assert storyboard.properties["zIndex"] == 2


@pytest.mark.asyncio
async def test_v3_manager_keeps_generated_element_size_and_assigns_layout(monkeypatch, tmp_path):
    """V3 manager 转换生成工具节点时保留尺寸，并在内部补齐布局。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    await async_mkdir(tmp_path / "v3-generated-project", parents=True, exist_ok=True)
    await write_magic_project_js_v3("v3-generated-project", _build_config_with_heavy_fields())
    manager = CanvasManagerV3("v3-generated-project")

    async def add_generated_image(config: MagicProjectConfigV3) -> str:
        """模拟生图工具通过 manager 新建一个未指定坐标的占位节点。"""
        element = ImageElement(
            id="generated-image-1",
            type="image",
            name="模拟生成图片",
            width=640,
            height=360,
            status="processing",
        )
        await manager.add_element(element, config=config)
        return element.id

    await manager.run_write_transaction(add_generated_image)
    config = await manager.read_current_canvas()
    generated = config.canvas.get_element("generated-image-1")

    assert generated is not None
    assert generated.properties["x"] == 520.0
    assert generated.properties["y"] == 0.0
    assert generated.properties["width"] == 640
    assert generated.properties["height"] == 360
    assert generated.properties["zIndex"] == 2
