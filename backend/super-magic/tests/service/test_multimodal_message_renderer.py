from __future__ import annotations

import base64
from pathlib import Path

import pytest
from PIL import Image

from agentlang.chat_history.chat_history_models import UserMessage, UserMessageContentPart
from app.service.multimodal_message_renderer import LLMMessageRenderer


class _URLFileService:
    calls = []

    async def get_workspace_file_url(self, file_path: Path, **kwargs) -> str:
        self.calls.append((file_path, kwargs))
        return f"https://workspace.example/{len(self.calls)}.png"


@pytest.mark.asyncio
async def test_renderer_keeps_only_first_five_images_and_falls_back_for_remaining_refs(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    for index in range(6):
        (workspace / f"image-{index}.png").write_bytes(b"image")

    async def fake_base64(self, *args, **kwargs):
        return "data:image/png;base64," + base64.b64encode(b"image").decode()

    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    parts = [UserMessageContentPart.text_part("Inspect these images.")]
    parts.extend(UserMessageContentPart.image_ref(f"image-{index}.png") for index in range(6))
    renderer = LLMMessageRenderer(workspace_dir=workspace, max_native_image_refs=5)

    rendered = await renderer.render_messages(
        [UserMessage(content="Inspect these images.", content_parts=parts)],
        supports_multimodal=True,
    )

    content = rendered[0]["content"]
    assert sum(item["type"] == "image_url" for item in content) == 5
    assert content[1]["type"] == "image_url"
    assert "only the first 5 images" in content[6]["text"]
    assert "visual_understanding" in content[6]["text"]


@pytest.mark.asyncio
async def test_renderer_falls_back_when_image_is_missing(tmp_path):
    renderer = LLMMessageRenderer(workspace_dir=tmp_path)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("removed.png")])],
        supports_multimodal=True,
    )

    assert isinstance(rendered[0]["content"], str)
    assert "image file was removed" in rendered[0]["content"]


@pytest.mark.asyncio
async def test_renderer_uses_text_path_for_non_multimodal_models(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "image.png").write_bytes(b"image")
    renderer = LLMMessageRenderer(workspace_dir=workspace)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("image.png")])],
        supports_multimodal=False,
    )

    assert isinstance(rendered[0]["content"], str)
    assert "visual_understanding" in rendered[0]["content"]


@pytest.mark.asyncio
async def test_renderer_drops_native_visual_instruction_when_falling_back(tmp_path):
    """非多模态模型回退时应保留用户问题，移除原生视觉专用提示。"""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "image.png").write_bytes(b"image")
    parts = [
        UserMessageContentPart.text_part("Read it"),
        UserMessageContentPart.text_part(
            "Answer directly from the native image.",
            include_in_fallback=False,
        ),
        UserMessageContentPart.image_ref("image.png"),
    ]
    renderer = LLMMessageRenderer(workspace_dir=workspace)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=parts)],
        supports_multimodal=False,
    )

    assert rendered[0]["content"].startswith("Read it\n\n")
    assert "Answer directly from the native image." not in rendered[0]["content"]
    assert "visual_understanding" in rendered[0]["content"]


@pytest.mark.asyncio
async def test_renderer_keeps_native_visual_instruction_when_an_image_is_rendered(tmp_path, monkeypatch):
    """至少一张图片成功使用原生视觉时应保留原生视觉专用提示。"""
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"image")
    async def fake_base64(self, *args, **kwargs):
        return "data:image/webp;base64,aW1hZ2U="

    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    parts = [
        UserMessageContentPart.text_part("Read it"),
        UserMessageContentPart.text_part(
            "Answer directly from the native image.",
            include_in_fallback=False,
        ),
        UserMessageContentPart.image_ref(str(image_path)),
    ]
    renderer = LLMMessageRenderer(workspace_dir=tmp_path)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=parts)],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["text"] == "Read it"
    assert rendered[0]["content"][1]["text"] == "Answer directly from the native image."
    assert rendered[0]["content"][2]["type"] == "image_url"


@pytest.mark.asyncio
async def test_renderer_downgrades_when_budget_is_exceeded(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "a.png").write_bytes(b"a")
    (workspace / "b.png").write_bytes(b"b")

    budget = 10 * 1024 * 1024

    async def fake_base64(self, path, *args, **kwargs):
        return "data:image/webp;base64," + ("x" * (budget - 100))

    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    parts = [
        UserMessageContentPart.image_ref("a.png"),
        UserMessageContentPart.image_ref("b.png"),
    ]
    renderer = LLMMessageRenderer(
        workspace_dir=workspace,
        max_native_image_bytes=budget,
    )

    rendered = await renderer.render_messages(
        [UserMessage(content="Read them", content_parts=parts)],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["type"] == "image_url"
    assert rendered[0]["content"][1]["type"] == "text"
    assert "image budget" in rendered[0]["content"][1]["text"]


@pytest.mark.asyncio
async def test_renderer_uses_webp_base64_for_workspace_image(tmp_path, monkeypatch):
    """工作区图片应直接使用 WebP Base64，不调用工作区 URL。"""
    _URLFileService.calls = []
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"image")
    base64_calls = []

    async def fake_base64(self, *args, **kwargs):
        base64_calls.append(args[0])
        return "data:image/webp;base64,aW1hZ2U="

    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    monkeypatch.setattr(
        "app.service.file_service.FileService",
        _URLFileService,
    )
    renderer = LLMMessageRenderer(workspace_dir=tmp_path)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("image.png")])],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["image_url"]["url"].startswith("data:image/webp")
    assert base64_calls == [str(image_path)]
    assert _URLFileService.calls == []


@pytest.mark.asyncio
async def test_renderer_uses_webp_base64_for_large_workspace_image(tmp_path, monkeypatch):
    """工作区大图应通过 WebP Base64 缩放后传输。"""
    _URLFileService.calls = []
    image_path = tmp_path / "large.png"
    image = Image.new("RGB", (4000, 3000), color="white")
    image.save(image_path, format="PNG")
    image.close()

    renderer = LLMMessageRenderer(workspace_dir=tmp_path)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("large.png")])],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["type"] == "image_url"
    assert rendered[0]["content"][0]["image_url"]["url"].startswith("data:image/webp")
    assert _URLFileService.calls == []


@pytest.mark.asyncio
async def test_renderer_uses_webp_base64_without_workspace_url(tmp_path, monkeypatch):
    """工作区 URL 不可用时也不应影响 WebP Base64 传输。"""
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"image")

    async def fake_base64(self, *args, **kwargs):
        return "data:image/webp;base64,aW1hZ2U="

    class _FailingURLFileService:
        async def get_workspace_file_url(self, file_path: Path) -> str:
            raise RuntimeError("mock url failure")

    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    monkeypatch.setattr(
        "app.service.file_service.FileService",
        _FailingURLFileService,
    )
    renderer = LLMMessageRenderer(workspace_dir=tmp_path)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("image.png")])],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["image_url"]["url"].startswith("data:image/webp")


@pytest.mark.asyncio
async def test_renderer_uses_base64_for_external_file_even_when_url_mode_enabled(tmp_path, monkeypatch):
    """工作区外绝对路径不能生成 URL，应直接使用 base64。"""
    _URLFileService.calls = []
    external_image = tmp_path / "external.png"
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    external_image.write_bytes(b"image")

    async def fake_base64(self, *args, **kwargs):
        return "data:image/webp;base64,aW1hZ2U="

    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    monkeypatch.setattr(
        "app.service.file_service.FileService",
        _URLFileService,
    )
    renderer = LLMMessageRenderer(workspace_dir=workspace)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref(str(external_image))])],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["image_url"]["url"].startswith("data:image/webp")
    assert _URLFileService.calls == []


@pytest.mark.asyncio
async def test_renderer_disables_url_mode_with_environment_variable(tmp_path, monkeypatch):
    """VISUAL_URL_MODE_ENABLED=false 时工作区图片直接使用 base64。"""
    _URLFileService.calls = []
    image_path = tmp_path / "image.png"
    image_path.write_bytes(b"image")

    async def fake_base64(self, *args, **kwargs):
        return "data:image/webp;base64,aW1hZ2U="

    monkeypatch.setenv("VISUAL_URL_MODE_ENABLED", "false")
    monkeypatch.setattr(
        "app.service.multimodal_message_renderer.ImageCompressionService.get_base64",
        fake_base64,
    )
    monkeypatch.setattr(
        "app.service.file_service.FileService",
        _URLFileService,
    )
    renderer = LLMMessageRenderer(workspace_dir=tmp_path)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("image.png")])],
        supports_multimodal=True,
    )

    assert rendered[0]["content"][0]["image_url"]["url"].startswith("data:image/webp")
    assert _URLFileService.calls == []


@pytest.mark.asyncio
async def test_renderer_rejects_relative_path_escape(tmp_path):
    """相对图片引用不能借助父目录跳出工作区。"""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (tmp_path / "external.png").write_bytes(b"image")
    renderer = LLMMessageRenderer(workspace_dir=workspace)

    rendered = await renderer.render_messages(
        [UserMessage(content="Read it", content_parts=[UserMessageContentPart.image_ref("../external.png")])],
        supports_multimodal=True,
    )

    assert isinstance(rendered[0]["content"], str)
    assert "outside the workspace" in rendered[0]["content"]


def test_user_message_positional_arguments_remain_compatible():
    message = UserMessage("content", "user", "2026-09-01 00:00:00", True, "legacy")
    assert message.source == "legacy"
    assert message.content_parts is None


def test_default_processing_limit_keeps_bounded_expanded_caches():
    """默认只处理前 10 张图片，内存缓存仍应保持扩大的硬上限。"""
    assert LLMMessageRenderer.MAX_NATIVE_IMAGE_REFS == 10
    assert LLMMessageRenderer.MAX_NATIVE_IMAGE_BYTES == -1
    assert LLMMessageRenderer.MAX_CACHE_ENTRIES == 32
    assert LLMMessageRenderer.MAX_CACHE_BYTES == 128 * 1024 * 1024
