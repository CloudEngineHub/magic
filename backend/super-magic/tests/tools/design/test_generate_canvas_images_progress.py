"""旧 Canvas 生图入口的逐项进度反馈测试。"""

from unittest.mock import AsyncMock, patch

import pytest

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.presentation.generation_feedback import CanvasGenerationFeedback
from app.tools.design.tools.base_generate_canvas_elements import ElementDetail, TaskExecutionResult
from app.tools.design.tools.generate_canvas_images import (
    GenerateCanvasImages,
    ImageGenerationProgressState,
    ImagePlaceholderUpdate,
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
    assert all(item.is_processing is True for item in detail.data.items)


@pytest.mark.asyncio
async def test_completed_item_updates_agent_row_without_waiting_for_batch(tmp_path) -> None:
    """一张图写入画布后应立即结束对应 Agent 行，其他图片继续显示生成中。"""
    tool = GenerateCanvasImages()
    context = ToolContext(arguments={"tasks": []})
    placeholders = [
        ElementDetail("element-1", "image", "Hero", 0, 0, 1024, 1024, "content-1"),
        ElementDetail("element-2", "image", "Poster", 1024, 0, 1024, 1024, "content-2"),
    ]
    state = ImageGenerationProgressState(project_path="Canvas/Mock", placeholders=placeholders)
    result = TaskExecutionResult(
        index=1,
        success=True,
        placeholder_update=ImagePlaceholderUpdate(status="completed", src="./poster.png"),
        metadata={"progress_state": state},
    )

    with patch.object(CanvasGenerationFeedback, "report_pending_detail", new=AsyncMock()) as report:
        await tool._after_placeholder_updated(
            result,
            ImageTaskSpec(prompt="poster", name="Poster", size="1024x1024", reference_images=[]),
            placeholders[1],
            context,
            tmp_path,
        )

    detail = report.await_args.args[3]
    assert detail.data.items[0].is_processing is True
    assert detail.data.items[1].is_processing is False
    assert detail.data.items[1].status == "success"


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


@pytest.mark.asyncio
async def test_provider_retry_keeps_first_generation_timing(tmp_path) -> None:
    """同一图片的 provider 自动重试不能用新任务时间重置百分比。"""
    tool = GenerateCanvasImages(base_dir=tmp_path)
    state = ImageGenerationProgressState()

    async def execute_purely(*_args, **kwargs):
        callback = kwargs["on_task_created"]
        await callback(
            "provider-task-1",
            "2026-10-05T10:01:30+08:00",
            "2026-10-05T10:00:00+08:00",
        )
        await callback(
            "provider-task-2",
            "2026-10-05T10:03:00+08:00",
            "2026-10-05T10:01:30+08:00",
        )
        return type("Result", (), {"ok": False, "content": "failed", "extra_info": {}})()

    with (
        patch(
            "app.tools.design.tools.generate_canvas_images.GenerateImages.execute_purely",
            new=execute_purely,
        ),
        patch(
            "app.tools.design.tools.generate_canvas_images.get_canvas_manager",
            new=AsyncMock(side_effect=RuntimeError("mock persistence failure")),
        ),
        patch.object(CanvasGenerationFeedback, "report_pending_detail", new=AsyncMock()),
    ):
        await tool._generate_single(
            0,
            ImageTaskSpec(prompt="mock", name="Hero", size="1024x1024", reference_images=[]),
            ElementDetail("element-1", "image", "Hero", 0, 0, 1024, 1024, "content-1"),
            "20261005100000",
            "Canvas/Mock/images",
            tmp_path,
            ToolContext(arguments={}),
            state,
        )

    assert state.timing_by_index[0] == (
        "2026-10-05T10:00:00+08:00",
        "2026-10-05T10:01:30+08:00",
    )
