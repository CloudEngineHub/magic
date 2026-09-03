from types import SimpleNamespace

import pytest
from PIL import Image

from agentlang.chat_history.chat_history_models import UserMessage
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
    assert "request too large" in result.content
    assert "reduce the image count" in result.content


@pytest.mark.asyncio
async def test_native_visual_instruction_includes_image_metadata(tmp_path, monkeypatch):
    """原生视觉注入提示应包含与 visual_understanding 一致的图片元数据。"""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    image_path = workspace / "chart.png"
    image = Image.new("RGB", (100, 50), color="blue")
    image.save(image_path, format="PNG")
    image.close()

    messages = []
    agent_context = SimpleNamespace(
        model_context=SimpleNamespace(
            resolve_text_model=lambda: SimpleNamespace(
                config=SimpleNamespace(supports_multimodal=True),
            )
        ),
        horizon=SimpleNamespace(push_user_message=messages.append),
    )
    tool_context = SimpleNamespace(get_extension=lambda name: agent_context)
    monkeypatch.setattr(
        "app.tools.visual_understanding.PathManager.get_workspace_dir",
        classmethod(lambda cls: workspace),
    )

    tool = VisualUnderstanding.__new__(VisualUnderstanding)
    injected = await tool._inject_native_visual_user_message(
        tool_context,
        ["chart.png"],
        "分析图表",
        provide_native_visual=True,
    )

    assert injected is True
    assert len(messages) == 1
    message = messages[0]
    assert isinstance(message, UserMessage)
    assert "Image dimensions" in message.content_parts[1].text
    assert "100×50 pixels" in message.content_parts[1].text
    assert "file size" in message.content_parts[1].text
