"""文件 mention 临时路径提示单元测试。"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.service.mention.builder import MentionContextBuilder
from app.service.mention.handlers import file_handler as file_handler_module
from app.service.mention.handlers.file_handler import FileHandler, _is_temporary_workspace_path

MOCK_WORKSPACE_DIRECTORY = Path("/mock/.workspace")
MOCK_TEMPORARY_DIRECTORY = MOCK_WORKSPACE_DIRECTORY / ".tmp"


@pytest.fixture(autouse=True)
def mock_workspace_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """替换 PathManager 路径，避免测试访问真实工作区。"""
    monkeypatch.setattr(
        file_handler_module.PathManager,
        "get_workspace_dir",
        MagicMock(return_value=MOCK_WORKSPACE_DIRECTORY),
    )
    monkeypatch.setattr(
        file_handler_module.PathManager,
        "get_tmp_dir",
        MagicMock(return_value=MOCK_TEMPORARY_DIRECTORY),
    )
    monkeypatch.setattr(
        file_handler_module,
        "find_parent_canvas_project",
        AsyncMock(return_value=(None, None)),
    )


@pytest.mark.parametrize(
    ("file_path", "expected"),
    [
        (".tmp/pasted-text-20260714-120000.txt", True),
        (str(MOCK_TEMPORARY_DIRECTORY / "copied-image.png"), True),
        ("documents/copied-image.png", False),
        ("documents/.tmp/copied-image.png", False),
        (".tmp/../documents/copied-image.png", False),
    ],
)
def test_temporary_workspace_path_detection(
    file_path: str,
    expected: bool,
) -> None:
    """验证仅工作区根目录的 `.tmp` 路径被识别为临时路径。"""
    assert _is_temporary_workspace_path(file_path) is expected


@pytest.mark.asyncio
async def test_temporary_file_tip_is_pushed_to_horizon() -> None:
    """验证临时文件提示通过 Horizon 注入后不再重复追加普通 tip。"""
    horizon = MagicMock()
    agent_context = SimpleNamespace(horizon=horizon)
    handler = FileHandler()

    await handler.handle(
        {"file_path": ".tmp/copied-image.png"},
        1,
        agent_context,
    )
    tip = await handler.get_final_tip(agent_context)

    assert tip == ""
    horizon.push_notification.assert_called_once()
    source, notification = horizon.push_notification.call_args.args
    assert source == "temporary_file_mention"
    assert "temporary" in notification.lower()
    assert "will be deleted automatically" in notification
    assert "outside `.tmp`" in notification
    assert "- `.tmp/copied-image.png`" in notification


@pytest.mark.asyncio
async def test_temporary_file_tip_falls_back_when_horizon_push_fails() -> None:
    """验证 Horizon 推送失败时仍通过普通 tip 告知模型临时文件语义。"""
    horizon = MagicMock()
    horizon.push_notification.side_effect = RuntimeError("mock horizon failure")
    agent_context = SimpleNamespace(horizon=horizon)
    handler = FileHandler()

    await handler.handle(
        {"file_path": ".tmp/pasted-text-20260714-120000.txt"},
        1,
        agent_context,
    )
    tip = await handler.get_final_tip(agent_context)

    assert "temporary" in tip.lower()
    assert "outside `.tmp`" in tip
    assert "- `.tmp/pasted-text-20260714-120000.txt`" in tip
    assert "Read and understand" in tip


@pytest.mark.asyncio
async def test_multiple_temporary_files_share_one_horizon_notification() -> None:
    """验证同一轮引用多个临时文件时只生成一条 Horizon 通知。"""
    horizon = MagicMock()
    agent_context = SimpleNamespace(horizon=horizon)
    builder = MentionContextBuilder()

    mentions_context = await builder.build(
        [
            {"type": "project_file", "file_path": ".tmp/first-image.png"},
            {"type": "project_file", "file_path": ".tmp/second-image.png"},
            {"type": "project_file", "file_path": ".tmp/first-image.png"},
        ],
        agent_context,
    )

    horizon.push_notification.assert_called_once()
    source, notification = horizon.push_notification.call_args.args
    assert source == "temporary_file_mention"
    assert notification.count("- `.tmp/first-image.png`") == 1
    assert "- `.tmp/second-image.png`" in notification
    assert "[@file_path:.tmp/first-image.png]" in mentions_context
    assert "[@file_path:.tmp/second-image.png]" in mentions_context


@pytest.mark.asyncio
async def test_temporary_file_tip_falls_back_without_agent_context() -> None:
    """验证缺少 AgentContext 时直接返回可进入模型上下文的英文提示。"""
    handler = FileHandler()

    await handler.handle({"file_path": ".tmp/copied-image.png"}, 1)
    tip = await handler.get_final_tip()

    assert "temporary" in tip.lower()
    assert "outside `.tmp`" in tip
    assert "- `.tmp/copied-image.png`" in tip
