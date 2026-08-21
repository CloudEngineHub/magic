"""Canvas 生成反馈的纯 Mock 测试。"""

from __future__ import annotations

import pytest

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.i18n import I18nManager
from app.tools.canvas.presentation import CanvasGenerationFeedback
from app.tools.canvas.presentation import CanvasToolDetailBuilder, batch_tool_result, summarize_items
from app.tools.canvas.tools.add_canvas_contents import AddCanvasContents
from app.tools.canvas.tools.add_canvas_elements import AddCanvasElements


def _arguments(*contents: tuple[str, str, str]) -> dict[str, object]:
    """构造不依赖真实项目的批量生成参数。"""
    return {
        "project_path": "Canvas/Mock",
        "items": [
            {
                "item_ref": item_ref,
                "content": {"source": source, "content_type": content_type},
            }
            for item_ref, source, content_type in contents
        ],
    }


def _result(*items: tuple[str, str]) -> ToolResult:
    """构造不依赖真实生成服务的批量结果。"""
    return ToolResult(
        content="mock",
        data={
            "project_path": "Canvas/Mock",
            "items": [
                {"item_ref": item_ref, "status": status, "element_id": f"element-{item_ref}"}
                for item_ref, status in items
            ],
        },
    )


def test_generation_feedback_separates_image_statuses() -> None:
    """图片生成反馈应正确区分完成、处理中和失败。"""
    arguments = _arguments(
        ("image-1", "generated", "image"),
        ("image-2", "generated", "image"),
        ("image-3", "generated", "image"),
    )
    summary = CanvasGenerationFeedback.from_result(
        _result(("image-1", "completed"), ("image-2", "processing"), ("image-3", "failed")),
        arguments,
    )

    I18nManager.set_language("zh_CN")
    try:
        assert CanvasGenerationFeedback.action_key(summary) == "canvas.generate_image"
        assert CanvasGenerationFeedback.remark(summary) == "已生成 1 个图片；1 个图片生成中；1 个图片生成失败"
    finally:
        I18nManager.reset_language()


def test_generation_feedback_ignores_imported_media() -> None:
    """导入素材不能被误报成生成任务。"""
    arguments = _arguments(("import-1", "imported", "image"))
    summary = CanvasGenerationFeedback.from_arguments(arguments)

    assert not CanvasGenerationFeedback.is_pure_generated_batch(arguments)
    assert not summary.is_supported


def test_generation_feedback_describes_whole_batch_failure() -> None:
    """整批调用失败时仍应保留图片/视频语义。"""
    arguments = _arguments(("video-1", "generated", "video"))
    summary = CanvasGenerationFeedback.from_arguments(arguments)

    I18nManager.set_language("zh_CN")
    try:
        assert CanvasGenerationFeedback.failure_remark(summary) == "1 个视频生成失败"
    finally:
        I18nManager.reset_language()


def test_batch_status_preserves_processing_and_partial_semantics() -> None:
    """批量状态聚合不能把处理中误报成失败。"""
    assert summarize_items([{"status": "pending"}]).status == "processing"
    partial = summarize_items([{"status": "completed"}, {"status": "failed"}])
    assert partial.status == "partial"
    assert not partial.ok


def test_batch_tool_result_and_detail_use_the_same_status() -> None:
    """ToolResult 与详情必须共同使用逐项聚合状态。"""
    result = batch_tool_result(
        "mock",
        {"items": [{"item_ref": "a", "status": "completed"}, {"item_ref": "b", "status": "failed"}]},
    )
    assert result.ok is False
    detail = CanvasToolDetailBuilder("mock", "elements_added", result).build()
    assert "部分完成" in detail.data.content


@pytest.mark.asyncio
@pytest.mark.parametrize("tool_class", [AddCanvasElements, AddCanvasContents])
async def test_generation_tool_feedback_uses_specific_media_wording(tool_class: type) -> None:
    """新增节点和追加 Content 都应使用具体的图片生成反馈。"""
    arguments = _arguments(
        ("image-1", "generated", "image"),
        ("image-2", "generated", "image"),
    )
    tool = tool_class()
    context = ToolContext()

    I18nManager.set_language("zh_CN")
    try:
        before = await tool.get_before_tool_call_friendly_action_and_remark(tool.name, context, arguments)
        after = await tool.get_after_tool_call_friendly_action_and_remark(
            tool.name,
            context,
            _result(("image-1", "completed"), ("image-2", "completed")),
            0.1,
            arguments,
        )
    finally:
        I18nManager.reset_language()

    assert before["action"] == "正在生成图片"
    assert before["remark"] == "准备生成 2 个图片"
    assert after["action"] == "生成图片"
    assert after["remark"] == "已生成 2 个图片"
