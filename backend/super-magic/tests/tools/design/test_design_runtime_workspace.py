"""Design 工具运行时工作区解析测试。"""

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from agentlang.context.tool_context import ToolContext
from app.tools.design.codec.v3_codec import V3CanvasCodec
from app.tools.design.tools.create_canvas import CreateCanvas, CreateCanvasParams
from app.utils.async_file_utils import async_read_text


class _RuntimeAgentContext:
    """提供单次工具调用使用的隔离工作区。"""

    def __init__(self, workspace_dir: Path) -> None:
        """保存模拟运行时工作区。"""
        self._workspace_dir = workspace_dir

    def get_workspace_dir(self) -> str:
        """返回模拟 AgentContext 的工作区路径。"""
        return str(self._workspace_dir)


@pytest.mark.asyncio
async def test_create_canvas_prefers_runtime_agent_workspace(tmp_path: Path):
    """SDK 隔离上下文应覆盖工具实例启动时固化的 base_dir。"""
    default_workspace = tmp_path / "default-workspace"
    runtime_workspace = tmp_path / "runtime-workspace"
    default_workspace.mkdir()
    runtime_workspace.mkdir()

    tool = CreateCanvas(base_dir=str(default_workspace))
    tool._dispatch_file_event = AsyncMock()
    tool_context = ToolContext()
    tool_context.register_extension(
        "agent_context",
        _RuntimeAgentContext(runtime_workspace),
    )

    result = await tool.execute(
        tool_context,
        CreateCanvasParams(project_path="runtime-project"),
    )

    assert result.ok
    runtime_file = runtime_workspace / "runtime-project" / "magic.project.js"
    assert runtime_file.exists()
    assert not (default_workspace / "runtime-project").exists()
    assert V3CanvasCodec.decode(await async_read_text(runtime_file)).version == "3.0.0"


def test_design_tool_falls_back_to_configured_base_dir(tmp_path: Path):
    """缺少运行时上下文时继续使用工具实例配置的 base_dir。"""
    tool = CreateCanvas(base_dir=str(tmp_path))

    assert tool._get_runtime_workspace_dir(ToolContext()) == tmp_path
