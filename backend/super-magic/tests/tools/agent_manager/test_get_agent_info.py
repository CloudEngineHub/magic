import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from agentlang.context.tool_context import ToolContext
from app.core.context.agent_context import AgentContext
from app.path_manager import PathManager
from app.tools.agent_manager.get_agent_info import GetAgentInfo, GetAgentInfoParams


@pytest.mark.asyncio
async def test_get_agent_info_does_not_write_agent_json(tmp_path):
    workspace_dir = tmp_path / "workspace"
    magic_dir = workspace_dir / ".magic"
    magic_dir.mkdir(parents=True, exist_ok=True)

    mock_agent_context = MagicMock(spec=AgentContext)
    mock_agent_context.get_agent_code.return_value = "TEST_AGENT_001"

    tool_context = MagicMock(spec=ToolContext)
    tool_context.get_extension_typed.return_value = mock_agent_context

    mock_result = MagicMock()
    mock_result.code = "TEST_AGENT_001"
    mock_result.name_i18n = {"zh_CN": "测试员工"}
    mock_result.role_i18n = {"zh_CN": ["测试角色"]}
    mock_result.description_i18n = {"zh_CN": "测试描述"}
    mock_result.get_prompt_string.return_value = "You are a test agent."
    mock_result.icon = {"type": "Image", "value": "https://example.com/icon.png"}
    mock_result.icon_type = 2
    mock_result.skills = []

    mock_sdk = MagicMock()
    mock_sdk.agent.get_agent_by_code.return_value = mock_result

    with patch.object(PathManager, "get_workspace_dir", return_value=workspace_dir), \
         patch.object(PathManager, "get_magic_dir", return_value=magic_dir), \
         patch("app.infrastructure.sdk.magic_service.factory.get_magic_service_sdk", return_value=mock_sdk):

        tool = GetAgentInfo()
        result = await tool.execute(tool_context, GetAgentInfoParams())

        assert result.ok is True
        assert "TEST_AGENT_001" in result.content
        assert "测试员工" in result.content

        # 核心断言：绝对不能在 .magic 目录下创建 agent.json
        assert not (magic_dir / "agent.json").exists()
        assert not (workspace_dir / "agent.json").exists()
