import pytest
from pydantic import ValidationError

from agentlang.tools.tool_result import ToolResult
from app.i18n import I18nManager
from app.service.cli_manager import CliManagerError, CliManagerService
from app.tools.cli_manager.apply import CliManagerApply, CliManagerApplyParams
from app.tools.cli_manager.list import CliManagerList, CliManagerListParams
from app.tools.cli_manager.remove import CliManagerRemove


@pytest.fixture(autouse=True)
def reset_i18n_language():
    """每个测试后重置语言，避免影响其他工具展示测试。"""
    I18nManager.reset_language()
    yield
    I18nManager.reset_language()


def test_cli_manager_apply_params_only_expose_model_inputs():
    """验证 apply 工具只暴露模型需要编排的参数。"""
    assert set(CliManagerApplyParams.model_fields) == {
        "name",
        "mode",
        "install_command",
        "commands",
        "config_dirs",
        "env_keys",
        "confirmed",
    }
    with pytest.raises(ValidationError):
        CliManagerApplyParams.model_validate(
            {
                "name": "mock-cli",
                "mode": "install",
                "install_command": "mock-install",
                "commands": ["mock-cli"],
                "confirmed": True,
                "resolution": "install_with_prefix",
            }
        )


@pytest.mark.asyncio
async def test_cli_manager_list_scopes_empty_result_to_user_managed_cli(monkeypatch):
    """验证空注册表不会被描述成运行时 CLI 未持久化。"""

    async def mock_list_items(self, *, validate=False):
        """返回隔离的空用户注册表。"""
        return {"count": 0, "items": []}

    monkeypatch.setattr(CliManagerService, "list_items", mock_list_items)

    result = await CliManagerList().execute(None, CliManagerListParams(validate=False))

    assert result.ok is True
    assert "No user-managed persisted CLIs found." in result.content
    assert "Runtime-provided CLIs" in result.content


@pytest.mark.asyncio
async def test_cli_manager_tools_are_code_mode_only_and_have_display_hooks():
    """验证 CLI 管理工具都具备用户展示钩子，且不回显安装命令。"""
    tools = [
        (
            CliManagerApply(),
            "cli_manager_apply",
            {
                "name": "mock-cli",
                "mode": "install",
                "install_command": "mock-install --token=mock-secret-token",
                "commands": ["mock-cli"],
            },
            ToolResult(
                content="CLI persisted: mock-cli (mock-cli).",
                extra_info={
                    "name": "mock-cli",
                    "commands": ["mock-cli"],
                    "strategy": "prefix",
                    "package_manager": "npm",
                    "status": "active",
                    "write_paths": {
                        "bin_dir": "/mock/.magic/cli/bin",
                        "registry_file": "/mock/.magic/cli/registry.json",
                    },
                    "validation": {
                        "ok": True,
                        "commands": [
                            {
                                "command": "mock-cli",
                                "shim_path": "/mock/.magic/cli/bin/mock-cli",
                                "target": "/mock/.magic/cli/prefixes/mock-cli/bin/mock-cli",
                                "ok": True,
                            }
                        ],
                    },
                    "app_links": [],
                    "config_dirs": [],
                    "env_keys": ["MOCK_API_KEY"],
                },
            ),
        ),
        (
            CliManagerList(),
            "cli_manager_list",
            {"validate": True},
            ToolResult(
                content="User-managed persisted CLIs: mock-cli.",
                extra_info={
                    "count": 1,
                    "items": [
                        {
                            "name": "mock-cli",
                            "commands": ["mock-cli"],
                            "status": "active",
                            "validation": {"ok": True, "commands": []},
                        }
                    ],
                },
            ),
        ),
        (
            CliManagerRemove(),
            "cli_manager_remove",
            {"name": "mock-cli", "remove_state": False},
            ToolResult(
                content="CLI persistence removed: mock-cli.",
                extra_info={
                    "name": "mock-cli",
                    "removed_paths": ["/mock/.magic/cli/bin/mock-cli"],
                    "remove_state": False,
                    "status": "removed",
                },
            ),
        ),
    ]

    for tool, tool_name, arguments, result in tools:
        assert tool.code_mode_only is True
        before = await tool.get_before_tool_call_friendly_action_and_remark(tool_name, None, arguments)
        after = await tool.get_after_tool_call_friendly_action_and_remark(tool_name, None, result, 0.1, arguments)
        detail = await tool.get_tool_detail(None, result, arguments)

        assert before["action"]
        assert before["remark"]
        assert after["action"]
        assert after["remark"]
        assert detail is not None
        assert "mock-secret-token" not in before["remark"]
        assert "mock-secret-token" not in after["remark"]
        assert "mock-secret-token" not in detail.data.content


@pytest.mark.asyncio
async def test_cli_manager_tool_action_and_remark_are_i18n():
    """验证 CLI 管理工具用户展示文案使用 i18n。"""
    I18nManager.set_language("en_US")

    before = await CliManagerApply().get_before_tool_call_friendly_action_and_remark(
        "cli_manager_apply",
        None,
        {"name": "mock-cli", "mode": "adopt"},
    )
    after = await CliManagerList().get_after_tool_call_friendly_action_and_remark(
        "cli_manager_list",
        None,
        ToolResult(content="ok", extra_info={"count": 2}),
        0.1,
        {"validate": True},
    )

    assert before["action"] == "Persist CLI"
    assert before["remark"] == 'Persisting CLI "mock-cli" with adopt mode'
    assert after["action"] == "List user-managed persisted CLIs"
    assert after["remark"] == "Found 2 user-managed persisted CLI(s)"

    I18nManager.set_language("zh_CN")
    remove_before = await CliManagerRemove().get_before_tool_call_friendly_action_and_remark(
        "cli_manager_remove",
        None,
        {"name": "mock-cli"},
    )

    assert remove_before["action"] == "移除持久化 CLI"
    assert remove_before["remark"] == "正在移除持久化 CLI「mock-cli」"


@pytest.mark.asyncio
async def test_cli_manager_failure_detail_uses_error_context_not_model_content():
    """验证失败详情使用结构化错误信息，而不是模型 content。"""
    result = ToolResult.error(
        "model-only failure content with mock-secret-token",
        extra_info={
            "operation": "apply",
            "error_code": "command_not_found_after_install",
            "error_context": {"command": "mock-cli"},
            "arguments": {"name": "mock-cli"},
        },
    )

    detail = await CliManagerApply().get_tool_detail(
        None,
        result,
        {"name": "mock-cli", "install_command": "mock-install --token=mock-secret-token"},
    )

    assert detail is not None
    assert "安装后未找到命令" in detail.data.content
    assert "model-only failure content" not in detail.data.content
    assert "mock-secret-token" not in detail.data.content


def test_cli_manager_error_content_includes_actionable_context():
    """验证模型只看 result.content 也能获得冲突处理上下文。"""
    result = CliManagerApply.error_result(
        "apply",
        CliManagerError(
            "cannot_move_install_root",
            "Refusing to move broad or system install root for command: mock-cli",
            command="mock-cli",
            existing_path="/mock/.local/bin/mock-cli",
            inferred_root="/mock/.local",
            suggested_prefix_bin_dir="/mock/.magic/cli/prefixes/mock-cli/bin",
            resolution_options=["install_with_prefix", "rename_command", "cancel"],
        ),
        {"install_command": "mock-install --token=mock-secret-token"},
    )

    assert result.ok is False
    assert "error_code: cannot_move_install_root" in result.content
    assert "suggested_prefix_bin_dir: /mock/.magic/cli/prefixes/mock-cli/bin" in result.content
    assert "next_steps:" in result.content
    assert "mode=\"install\"" in result.content
    assert "resolution_options:" not in result.content
    assert "do_not_pass: resolution or resolution_options" in result.content
    assert "mock-secret-token" not in result.content


def test_cli_manager_error_content_guides_path_conflict_adopt_without_resolution_param():
    """验证 PATH 冲突时只提示现有工具调用方式，不诱导传入 resolution。"""
    result = CliManagerApply.error_result(
        "apply",
        CliManagerError(
            "command_path_conflict",
            "Command already exists on PATH: mock-cli",
            conflict_type="path_command",
            command="mock-cli",
            existing_path="/mock/.local/bin/mock-cli",
            requested_path="/mock/.magic/cli/bin/mock-cli",
            resolution_options=["adopt_existing", "rename_command", "cancel"],
        ),
        {"install_command": "mock-install --token=mock-secret-token"},
    )

    assert result.ok is False
    assert "error_code: command_path_conflict" in result.content
    assert "existing_path: /mock/.local/bin/mock-cli" in result.content
    assert 'mode="adopt"' in result.content
    assert 'commands=["mock-cli"]' in result.content
    assert "resolution_options:" not in result.content
    assert "do_not_pass: resolution or resolution_options" in result.content
    assert "mock-secret-token" not in result.content


def test_cli_manager_apply_content_distinguishes_entry_and_target():
    """验证模型结果明确区分稳定命令入口和真实安装目标。"""
    content = CliManagerApply._build_model_content(
        {
            "name": "mock-cli",
            "commands": ["mock-cli"],
            "strategy": "shell_prefix",
            "package_manager": "shell",
            "steps": [],
            "write_paths": {
                "root_dir": "/mock/.magic/cli",
                "bin_dir": "/mock/.magic/cli/bin",
                "app_dir": "/mock/.magic/cli/prefixes/mock-cli",
                "registry_file": "/mock/.magic/cli/registry.json",
            },
            "command_targets": {"mock-cli": "/mock/.magic/cli/prefixes/mock-cli/bin/mock-cli"},
            "app_links": [],
            "config_dirs": [],
            "env_keys": [],
            "status": "active",
            "validation": {
                "ok": True,
                "commands": [
                    {
                        "command": "mock-cli",
                        "shim_path": "/mock/.magic/cli/bin/mock-cli",
                        "target": "/mock/.magic/cli/prefixes/mock-cli/bin/mock-cli",
                        "ok": True,
                    }
                ],
            },
        }
    )

    assert "command_entries: mock-cli=/mock/.magic/cli/bin/mock-cli" in content
    assert "install_targets: mock-cli=/mock/.magic/cli/prefixes/mock-cli/bin/mock-cli" in content
    assert "expose_path: /mock/.magic/cli/bin" in content
