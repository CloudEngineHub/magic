"""Canvas V3 codec、Content 和 Connection 契约测试。"""

import pytest

from app.tools.design.codec.envelope_codec import CanvasEnvelopeCodec
from app.tools.design.codec.v3_codec import MAGIC_PROJECT_VERSION_V3, V3CanvasCodec
from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.services.connection_service import ConnectionService
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.utils.magic_project_compression import (
    compress_canvas_data,
    decompress_canvas_data,
)


def _build_v3_config() -> MagicProjectConfigV3:
    """构造包含多 Content、分镜、编辑节点和连接的 mock V3 配置。"""
    image = CanvasElementV3(
        id="image-1",
        type="image",
        properties={"name": "模拟首帧", "width": 720, "height": 1280},
        contents=[
            ElementContent(
                content_id="image-1-content-1",
                fields={"src": "./images/mock-a.png", "status": "completed"},
            ),
            ElementContent(
                content_id="image-1-content-2",
                fields={"src": "./images/mock-b.png", "status": "completed"},
            ),
        ],
        active_content_id="image-1-content-2",
        main_content_id="image-1-content-1",
    )
    storyboard = CanvasElementV3(
        id="storyboard-1",
        type="storyboard",
        properties={"name": "模拟分镜"},
        contents=[
            ElementContent(
                content_id="storyboard-1-content-1",
                fields={
                    "shots": [
                        {
                            "id": "shot-1",
                            "durationSeconds": 4,
                            "description": "模拟镜头",
                            "outputImageElementId": "image-1",
                        }
                    ]
                },
            )
        ],
        active_content_id="storyboard-1-content-1",
        main_content_id="storyboard-1-content-1",
    )
    video_edit = CanvasElementV3(
        id="video-edit-1",
        type="video-edit",
        properties={"name": "模拟成片"},
        contents=[
            ElementContent(
                content_id="video-edit-1-content-1",
                fields={
                    "videoSequence": [],
                    "audioSequence": [],
                    "output": {"aspectRatio": "9:16", "resolution": "1080P", "format": "mp4"},
                },
            )
        ],
        active_content_id="video-edit-1-content-1",
        main_content_id="video-edit-1-content-1",
    )
    return MagicProjectConfigV3(
        version=MAGIC_PROJECT_VERSION_V3,
        type="design",
        name="V3 模拟项目",
        canvas=CanvasDocumentV3(
            elements=[storyboard, image, video_edit],
            connections=[
                CanvasConnection(
                    id="connection-1",
                    source_element_id="storyboard-1",
                    target_element_id="image-1",
                    locked=True,
                )
            ],
            extra_data={"frontendState": {"selected": "image-1"}},
        ),
        extra_data={"projectMeta": {"source": "mock"}},
    )


def test_v3_codec_round_trip_keeps_content_and_connections():
    """V3 codec 往返保持内嵌 Content、active/main 和 Element 级 Connection。"""
    encoded = V3CanvasCodec.encode(_build_v3_config())
    decoded = V3CanvasCodec.decode(encoded)

    image = decoded.canvas.get_element("image-1")
    assert image is not None
    assert image.active_content_id == "image-1-content-2"
    assert image.main_content_id == "image-1-content-1"
    assert image.get_main_content().fields["src"] == "./images/mock-a.png"
    assert decoded.canvas.connections[0].source_element_id == "storyboard-1"
    assert decoded.canvas.connections[0].target_element_id == "image-1"
    assert decoded.extra_data == {"projectMeta": {"source": "mock"}}
    assert decoded.canvas.extra_data == {"frontendState": {"selected": "image-1"}}

    envelope = CanvasEnvelopeCodec.decode(encoded)
    assert envelope["version"] == "3.0.0"
    canvas_data = decompress_canvas_data(envelope["canvas"])
    assert "contents" in canvas_data["elements"][1]
    assert "src" not in canvas_data["elements"][1]


def test_v3_codec_accepts_video_edit_without_audio_sequence():
    """Video Edit 未配置外部音频时允许省略 audioSequence。"""
    config = _build_v3_config()
    video_edit = config.canvas.get_element("video-edit-1")
    assert video_edit is not None
    content = video_edit.get_main_content()
    assert content is not None
    content.fields.pop("audioSequence")

    decoded = V3CanvasCodec.decode(V3CanvasCodec.encode(config))

    decoded_video_edit = decoded.canvas.get_element("video-edit-1")
    assert decoded_video_edit is not None
    decoded_content = decoded_video_edit.get_main_content()
    assert decoded_content is not None
    assert "audioSequence" not in decoded_content.fields


def test_v3_codec_rejects_business_fields_on_element_shell():
    """V3 codec 拒绝把图片业务字段残留在 Element 外壳。"""
    config = _build_v3_config()
    canvas_data = config.canvas.to_dict()
    canvas_data["elements"][1]["src"] = "./images/invalid.png"
    envelope = {
        "version": "3.0.0",
        "type": "design",
        "name": "非法模拟项目",
        "canvas": compress_canvas_data(canvas_data),
    }

    with pytest.raises(ValueError, match="unsupported fields"):
        V3CanvasCodec.decode(CanvasEnvelopeCodec.encode(envelope))


def test_content_service_preserves_connection_independent_content_switching():
    """Content 切换只修改 Element 指针，不改变 Connection。"""
    config = _build_v3_config()
    image = config.canvas.get_element("image-1")
    assert image is not None
    original_connections = [connection.to_dict() for connection in config.canvas.connections]

    ContentService.switch_active_content(image, "image-1-content-1")
    ContentService.set_main_content(image, "image-1-content-2")

    assert image.active_content_id == "image-1-content-1"
    assert image.main_content_id == "image-1-content-2"
    assert [connection.to_dict() for connection in config.canvas.connections] == original_connections


def test_connection_service_rejects_reverse_duplicate_and_cleans_deleted_element():
    """Connection 服务拒绝反向重复，并可按 Element 清理关联边。"""
    config = _build_v3_config()
    with pytest.raises(ValueError, match="reverse duplicate"):
        ConnectionService.add_connection(
            config.canvas,
            CanvasConnection(
                id="connection-2",
                source_element_id="image-1",
                target_element_id="storyboard-1",
            ),
        )

    assert ConnectionService.remove_for_element(config.canvas, "image-1") == 1
    assert config.canvas.connections == []
