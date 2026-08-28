"""视频制作显式关系与增量流式布局服务测试。"""

from agentlang.context.tool_context import ToolContext
from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.domain.generation_initializer import (
    CanvasGenerationInitializationContext,
)
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.video_production.service.explicit_source_generation_initializer import (
    ExplicitSourceGenerationInitializer,
)
from app.tools.design.video_production.service.video_production_flow_layout_service import (
    VideoProductionFlowLayoutService,
)
from app.tools.design.video_production.service.video_production_relation_service import (
    VideoProductionRelationService,
)


def _element(
    element_id: str,
    element_type: str,
    *,
    x: float | None = None,
    y: float | None = None,
    width: float = 320,
    height: float = 180,
    z_index: int | None = None,
) -> CanvasElementV3:
    """构造只包含模拟字段的单 Content 节点。"""
    content_id = f"{element_id}-content-1"
    properties = {
        "name": element_id,
        "width": width,
        "height": height,
    }
    if x is not None:
        properties["x"] = x
    if y is not None:
        properties["y"] = y
    if z_index is not None:
        properties["zIndex"] = z_index
    return CanvasElementV3(
        id=element_id,
        type=element_type,
        properties=properties,
        contents=[ElementContent(content_id=content_id, fields={})],
        active_content_id=content_id,
        main_content_id=content_id,
    )


def test_flow_layout_places_new_targets_to_the_right_without_moving_existing_elements():
    """同一来源的新节点按任务顺序纵向排列，已有节点保持原坐标。"""
    source = _element("source", "storyboard", x=120, y=80, z_index=7)
    manual = _element("manual", "text", x=-400, y=300, z_index=2)
    target_one = _element("target-one", "image")
    target_two = _element("target-two", "image")
    canvas = CanvasDocumentV3(elements=[source, manual, target_one, target_two])

    VideoProductionFlowLayoutService.layout_targets(
        canvas,
        {
            target_one.id: [source.id],
            target_two.id: [source.id],
        },
        [target_one.id, target_two.id],
    )

    assert (source.x, source.y, source.zIndex) == (120.0, 80.0, 7)
    assert (manual.x, manual.y, manual.zIndex) == (-400.0, 300.0, 2)
    assert (target_one.x, target_one.y, target_one.zIndex) == (1000.0, 80.0, 8)
    assert (target_two.x, target_two.y, target_two.zIndex) == (1000.0, 500.0, 9)


def test_flow_layout_uses_rightmost_source_and_primary_source_y():
    """多来源布局使用最右来源计算 X，并使用首个来源的 Y。"""
    primary = _element("primary", "image", x=100, y=700, width=300, z_index=1)
    rightmost = _element("rightmost", "image", x=900, y=100, width=500, z_index=2)
    target = _element("target", "storyboard")
    canvas = CanvasDocumentV3(elements=[primary, rightmost, target])

    VideoProductionFlowLayoutService.layout_targets(
        canvas,
        {target.id: [primary.id, rightmost.id]},
        [target.id],
    )

    assert (target.x, target.y, target.zIndex) == (1960.0, 700.0, 3)


def test_flow_layout_resolves_collision_by_moving_down_only():
    """首选位置冲突时保持目标列不变，只向下寻找空位。"""
    source = _element("source", "image", x=0, y=100, z_index=1)
    occupied = _element("occupied", "image", x=880, y=100, height=300, z_index=2)
    target = _element("target", "video")
    canvas = CanvasDocumentV3(elements=[source, occupied, target])

    VideoProductionFlowLayoutService.layout_targets(
        canvas,
        {target.id: [source.id]},
        [target.id],
    )

    assert (target.x, target.y, target.zIndex) == (880.0, 640.0, 3)


def test_flow_layout_appends_new_roots_without_relaying_existing_roots():
    """导入根素材时只把新节点追加到根列下方。"""
    existing_root = _element("existing-root", "image", x=0, y=40, height=200, z_index=4)
    unrelated = _element("unrelated", "text", x=900, y=10, z_index=2)
    new_root = _element("new-root", "audio")
    canvas = CanvasDocumentV3(elements=[existing_root, unrelated, new_root])

    VideoProductionFlowLayoutService.layout_roots(canvas, [new_root.id])

    assert (existing_root.x, existing_root.y, existing_root.zIndex) == (0.0, 40.0, 4)
    assert (unrelated.x, unrelated.y, unrelated.zIndex) == (900.0, 10.0, 2)
    assert (new_root.x, new_root.y, new_root.zIndex) == (0.0, 480.0, 5)


def test_relation_service_reconciles_locked_incoming_and_preserves_manual_edges():
    """显式来源替换旧锁定入边，同时保留用户未锁定关系。"""
    old_source = _element("old-source", "image", x=0, y=0)
    new_source = _element("new-source", "storyboard", x=0, y=300)
    manual_source = _element("manual-source", "text", x=0, y=600)
    target = _element("target", "video", x=900, y=0)
    manual_connection = CanvasConnection(
        "manual-connection",
        manual_source.id,
        target.id,
        locked=False,
    )
    canvas = CanvasDocumentV3(
        elements=[old_source, new_source, manual_source, target],
        connections=[
            CanvasConnection("old-connection", old_source.id, target.id, locked=True),
            manual_connection,
        ],
    )

    connections = VideoProductionRelationService.synchronize_incoming(
        canvas,
        target.id,
        [new_source.id],
    )

    assert [(item.source_element_id, item.target_element_id) for item in connections] == [
        (new_source.id, target.id)
    ]
    assert manual_connection in canvas.connections
    assert not any(item.id == "old-connection" for item in canvas.connections)


async def test_explicit_source_initializer_distinguishes_omit_clear_and_replace():
    """来源省略、清空和替换分别执行保留、删除和同步语义。"""
    old_source = _element("old-source", "image", x=0, y=0, z_index=1)
    new_source = _element("new-source", "image", x=0, y=400, z_index=2)
    preserve_target = _element("preserve-target", "video", x=900, y=0, z_index=3)
    clear_target = _element("clear-target", "video", x=900, y=400, z_index=4)
    replace_target = _element("replace-target", "video", x=900, y=800, z_index=5)
    canvas = CanvasDocumentV3(
        elements=[
            old_source,
            new_source,
            preserve_target,
            clear_target,
            replace_target,
        ],
        connections=[
            CanvasConnection("preserve-old", old_source.id, preserve_target.id, locked=True),
            CanvasConnection("clear-old", old_source.id, clear_target.id, locked=True),
            CanvasConnection("replace-old", old_source.id, replace_target.id, locked=True),
        ],
    )
    config = type("MockConfig", (), {"canvas": canvas})()
    initializer = ExplicitSourceGenerationInitializer(
        [None, [], [new_source.id]],
    )

    await initializer.apply_batch(
        config,
        [
            CanvasGenerationInitializationContext(0, preserve_target.id, None, False),
            CanvasGenerationInitializationContext(1, clear_target.id, None, False),
            CanvasGenerationInitializationContext(2, replace_target.id, None, False),
        ],
    )

    assert {
        (connection.source_element_id, connection.target_element_id)
        for connection in canvas.connections
        if connection.locked
    } == {
        (old_source.id, preserve_target.id),
        (new_source.id, replace_target.id),
    }


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
