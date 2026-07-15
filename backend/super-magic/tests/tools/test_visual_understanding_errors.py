import pytest

from app.tools.visual_understanding import VisualUnderstanding
from app.tools.visual_understanding_utils.models import BatchImageProcessingResults


@pytest.mark.asyncio
async def test_visual_understanding_reports_request_entity_too_large(monkeypatch):
    async def fake_call_with_fallback(*args, **kwargs):
        raise RuntimeError("413 Request Entity Too Large")

    monkeypatch.setattr(
        "app.tools.visual_understanding.LLMRequestHandler.call_with_fallback",
        fake_call_with_fallback,
    )
    tool = VisualUnderstanding()

    result = await tool._call_llm_for_visual_understanding(
        query="分析图片",
        batch_results=BatchImageProcessingResults(),
        model_id="qwen3.5-flash",
        images=["page-1.png", "page-2.png"],
    )

    assert not result.ok
    assert "请求体过大" in result.content
    assert "减少图片数量" in result.content
