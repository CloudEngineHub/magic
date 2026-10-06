"""旧 Canvas 生图入口的逐项进度反馈测试。"""

from unittest.mock import AsyncMock, patch

import pytest

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.presentation.generation_feedback import CanvasGenerationFeedback
from app.tools.design.tools.base_generate_canvas_elements import ElementDetail
from app.tools.design.tools.generate_canvas_images import (
    GenerateCanvasImages,
    ImageGenerationProgressState,
    ImageTaskSpec,
)


@pytest.mark.asyncio
async def test_progress_state_reports_each_item_timing_in_operation_list() -> None:
    """时间更新必须保留在可展开结果卡里，并按图片分别传给前端。"""
    tool = GenerateCanvasImages()
    context = ToolContext(arguments={"tasks": []})
    state = ImageGenerationProgressState(
        project_path="Canvas/Mock",
        placeholders=[
            ElementDetail("element-1", "image", "Hero", 0, 0, 1024, 1024, "content-1"),
            ElementDetail("element-2", "image", "Poster", 1024, 0, 1024, 1024, "content-2"),
        ],
        timing_by_index={
            0: ("2026-10-05T10:00:00+08:00", "2026-10-05T10:00:45+08:00"),
            1: ("2026-10-05T10:00:01+08:00", "2026-10-05T10:01:11+08:00"),
        },
    )

    with patch.object(CanvasGenerationFeedback, "report_pending_detail", new=AsyncMock()) as report:
        await tool._report_progress_state(context, state)

    detail = report.await_args.args[3]
    assert detail.type == "operation_result_list"
    assert detail.data.items[0].started_at == "2026-10-05T10:00:00+08:00"
    assert detail.data.items[0].expected_finished_at == "2026-10-05T10:00:45+08:00"
    assert detail.data.items[1].started_at == "2026-10-05T10:00:01+08:00"
    assert detail.data.items[1].expected_finished_at == "2026-10-05T10:01:11+08:00"


@pytest.mark.asyncio
async def test_canvas_generation_does_not_send_standalone_progress_detail(tmp_path) -> None:
    """Canvas 调用通用生图时关闭独立 generation_progress，避免覆盖下拉详情。"""
    tool = GenerateCanvasImages(base_dir=tmp_path)
    execute_purely = AsyncMock(return_value=type("Result", (), {"ok": False, "content": "failed", "extra_info": {}})())
    task = ImageTaskSpec(prompt="mock", name="Hero", size="1024x1024", reference_images=[])
    placeholder = ElementDetail("element-1", "image", "Hero", 0, 0, 1024, 1024, "content-1")

    with patch("app.tools.design.tools.generate_canvas_images.GenerateImages.execute_purely", new=execute_purely):
        await tool._generate_single(
            0,
            task,
            placeholder,
            "20261005100000",
            "Canvas/Mock/images",
            tmp_path,
            ToolContext(arguments={}),
            ImageGenerationProgressState(),
        )

    assert execute_purely.await_args.kwargs["report_progress"] is False
