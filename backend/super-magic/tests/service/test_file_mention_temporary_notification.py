"""文件 mention 临时路径提示单元测试。"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

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

    tip = await handler.get_tip(
        {"file_path": ".tmp/copied-image.png"},
        agent_context,
    )

    assert tip == ""
    horizon.push_notification.assert_called_once()
    source, notification = horizon.push_notification.call_args.args
    assert source == "temporary_file_mention"
    assert "temporary" in notification.lower()
    assert "will be deleted automatically" in notification
    assert "outside `.tmp`" in notification


@pytest.mark.asyncio
async def test_temporary_file_tip_falls_back_when_horizon_push_fails() -> None:
    """验证 Horizon 推送失败时仍通过普通 tip 告知模型临时文件语义。"""
    horizon = MagicMock()
    horizon.push_notification.side_effect = RuntimeError("mock horizon failure")
    agent_context = SimpleNamespace(horizon=horizon)
    handler = FileHandler()

    tip = await handler.get_tip(
        {"file_path": ".tmp/pasted-text-20260714-120000.txt"},
        agent_context,
    )

    assert "temporary" in tip.lower()
    assert "outside `.tmp`" in tip
    assert "Read and understand" in tip


@pytest.mark.asyncio
async def test_temporary_file_tip_falls_back_without_agent_context() -> None:
    """验证缺少 AgentContext 时直接返回可进入模型上下文的英文提示。"""
    handler = FileHandler()

    tip = await handler.get_tip({"file_path": ".tmp/copied-image.png"})

    assert "temporary" in tip.lower()
    assert "outside `.tmp`" in tip
