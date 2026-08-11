"""视频生产增量布局服务测试。"""

from agentlang.context.tool_context import ToolContext
from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.video_production.service.video_production_layout_service import (
    VideoProductionLayoutService,
)


def _element(
    element_id: str,
    element_type: str,
    *,
    fields: dict | None = None,
    x: float = 9000,
    y: float = 9000,
    width: float | None = 320,
    height: float | None = 180,
    z_index: int = 1,
) -> CanvasElementV3:
    """构造只包含模拟字段的单 Content 节点。"""
    content_id = f"{element_id}-content-1"
    properties = {
        "name": element_id,
        "x": x,
        "y": y,
        "zIndex": z_index,
    }
    if width is not None:
        properties["width"] = width
    if height is not None:
        properties["height"] = height
    return CanvasElementV3(
        id=element_id,
        type=element_type,
        properties=properties,
        contents=[ElementContent(content_id=content_id, fields=fields or {})],
        active_content_id=content_id,
        main_content_id=content_id,
    )


def test_video_production_layout_only_moves_new_elements():
    """新增分镜及输出图时保留已有素材和无关节点的手工坐标。"""
    visual_anchor = _element(
        "visual-anchor",
        "image",
        x=120,
        y=80,
        z_index=7,
    )
    manual_note = _element(
        "manual-note",
        "text",
        x=-400,
        y=300,
        z_index=2,
    )
    storyboard = _element(
        "storyboard-1",
        "storyboard",
        fields={
            "shots": [
                {"id": "S01", "outputImageElementId": "shot-image-1"},
                {"id": "S02", "outputImageElementId": "shot-image-2"},
            ]
        },
        width=None,
        height=None,
    )
    shot_image_one = _element("shot-image-1", "image")
    shot_image_two = _element("shot-image-2", "image")
    connections = [
        CanvasConnection(
            "connection-anchor",
            visual_anchor.id,
            storyboard.id,
            locked=True,
        ),
        CanvasConnection(
            "connection-shot-1",
            storyboard.id,
            shot_image_one.id,
            locked=True,
        ),
        CanvasConnection(
            "connection-shot-2",
            storyboard.id,
            shot_image_two.id,
            locked=True,
        ),
    ]
    canvas = CanvasDocumentV3(
        elements=[
            visual_anchor,
            manual_note,
            storyboard,
            shot_image_one,
            shot_image_two,
        ],
        connections=list(connections),
    )

    VideoProductionLayoutService.layout_new_elements(
        canvas,
        {storyboard.id, shot_image_one.id, shot_image_two.id},
    )

    assert (visual_anchor.x, visual_anchor.y, visual_anchor.zIndex) == (120.0, 80.0, 7)
    assert (manual_note.x, manual_note.y, manual_note.zIndex) == (-400.0, 300.0, 2)
    assert (storyboard.x, storyboard.y, storyboard.width, storyboard.height) == (
        1000.0,
        80.0,
        960.0,
        1360.0,
    )
    assert (shot_image_one.x, shot_image_one.y) == (2520.0, 80.0)
    assert (shot_image_two.x, shot_image_two.y) == (2520.0, 500.0)
    assert (storyboard.zIndex, shot_image_one.zIndex, shot_image_two.zIndex) == (
        8,
        9,
        10,
    )
    assert canvas.connections == connections


def test_video_production_layout_appends_new_item_below_existing_stage():
    """同阶段已有节点存在时，只把本批新节点追加到该阶段下方。"""
    storyboard = _element(
        "storyboard-1",
        "storyboard",
        fields={
            "shots": [
                {"id": "S01", "outputImageElementId": "shot-image-1"},
                {"id": "S02", "outputImageElementId": "shot-image-2"},
            ]
        },
        x=1500,
        y=300,
        width=960,
        height=1360,
        z_index=3,
    )
    existing_shot = _element(
        "shot-image-1",
        "image",
        x=3020,
        y=500,
        z_index=4,
    )
    new_shot = _element("shot-image-2", "image")
    canvas = CanvasDocumentV3(
        elements=[storyboard, existing_shot, new_shot],
        connections=[
            CanvasConnection(
                "connection-shot-1",
                storyboard.id,
                existing_shot.id,
                locked=True,
            ),
            CanvasConnection(
                "connection-shot-2",
                storyboard.id,
                new_shot.id,
                locked=True,
            ),
        ],
    )

    VideoProductionLayoutService.layout_new_elements(canvas, [new_shot.id])

    assert (storyboard.x, storyboard.y, storyboard.zIndex) == (1500.0, 300.0, 3)
    assert (existing_shot.x, existing_shot.y, existing_shot.zIndex) == (
        3020.0,
        500.0,
        4,
    )
    assert (new_shot.x, new_shot.y, new_shot.zIndex) == (3020.0, 920.0, 5)


def test_video_production_layout_without_new_ids_is_noop():
    """调用方未声明新增节点时不允许布局服务修改画布。"""
    storyboard = _element(
        "storyboard-1",
        "storyboard",
        x=345,
        y=678,
        width=None,
        height=None,
        z_index=9,
    )
    canvas = CanvasDocumentV3(elements=[storyboard])

    VideoProductionLayoutService.layout(canvas)

    assert (storyboard.x, storyboard.y, storyboard.width, storyboard.height) == (
        345.0,
        678.0,
        None,
        None,
    )
    assert storyboard.zIndex == 9


def test_video_production_agent_detection_is_explicit():
    """只有视频制作专家名称才启用首次素材导入的专用布局。"""
    tool_context = ToolContext()
    tool_context.register_extension(
        "agent_context",
        type("MockAgentContext", (), {"agent_name": "video-production"})(),
    )
    assert BaseVideoProductionTool._is_video_production_agent(tool_context)

    tool_context.get_extension("agent_context").agent_name = "design"
    assert not BaseVideoProductionTool._is_video_production_agent(tool_context)
