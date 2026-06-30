import json
from types import SimpleNamespace

import pytest

from app.core.entity.message.server_message import DisplayType
from app.core.entity.tool.tool_result_types import TerminalToolResult
from app.tools.shell_exec import ShellExec, ShellExecParams
from app.tools.shell_exec_utils.tool_detail_marker import (
    DISPLAY_OVERRIDE_KEY,
    apply_tool_detail_markers,
)


def _marker(payload):
    return f"<super-magic-tool-detail>{json.dumps(payload, ensure_ascii=False)}</super-magic-tool-detail>"


class _FakeToolContext:
    def __init__(self, current_model_id: str | None = None) -> None:
        self._agent_context = SimpleNamespace(
            model_context=SimpleNamespace(current_text_model_id=current_model_id),
        )

    def get_extension(self, name: str):
        if name == "agent_context":
            return self._agent_context
        return None


def test_shell_exec_marker_removes_valid_payload_and_stores_override():
    payload = {
        "after": {
            "action": "生成报告",
            "remark": "报告已生成",
        },
        "tool_detail": {
            "type": "md",
            "data": {
                "file_name": "report.md",
                "content": "# Mock Report\n\nDone.",
            },
        },
    }
    output = f"start\n{_marker(payload)}\nend"
    result = TerminalToolResult(
        command="python mock_script.py",
        content=output,
        ok=True,
        extra_info={
            "stdout": output,
            "stderr": "",
            "exit_code": 0,
        },
    )

    apply_tool_detail_markers(result)

    assert "<super-magic-tool-detail>" not in result.content
    assert "<super-magic-tool-detail>" not in result.extra_info["stdout"]
    assert result.content == "start\n\nend"
    override = result.extra_info[DISPLAY_OVERRIDE_KEY]
    assert override["after"] == {
        "action": "生成报告",
        "remark": "报告已生成",
    }
    assert override["tool_detail"]["type"] == "md"
    assert override["tool_detail"]["data"]["content"] == "# Mock Report\n\nDone."


@pytest.mark.asyncio
async def test_shell_exec_execute_applies_marker_before_return(monkeypatch, tmp_path):
    payload = {
        "after": {
            "remark": "Mock script completed",
        },
        "tool_detail": "Mock detail content",
    }
    output = f"stdout before marker\n{_marker(payload)}"

    async def fake_execute_command(*args, **kwargs):
        return TerminalToolResult(
            command="python mock_script.py",
            content=output,
            ok=True,
            exit_code=0,
            extra_info={
                "stdout": output,
                "stderr": "",
                "exit_code": 0,
            },
        )

    monkeypatch.setattr(
        "app.tools.shell_exec.ProcessExecutor.execute_command",
        fake_execute_command,
    )

    tool = ShellExec(base_dir=tmp_path)
    result = await tool.execute(
        None,
        ShellExecParams(command="python mock_script.py"),
    )

    assert "<super-magic-tool-detail>" not in result.content
    assert "<super-magic-tool-detail>" not in result.extra_info["stdout"]
    assert result.extra_info[DISPLAY_OVERRIDE_KEY]["after"]["remark"] == "Mock script completed"
    assert result.extra_info[DISPLAY_OVERRIDE_KEY]["tool_detail"]["data"]["content"] == "Mock detail content"


@pytest.mark.asyncio
async def test_shell_exec_injects_current_model_env(monkeypatch, tmp_path):
    captured_kwargs = {}

    async def fake_execute_command(*args, **kwargs):
        captured_kwargs.update(kwargs)
        return TerminalToolResult(
            command="python mock_script.py",
            content="ok",
            ok=True,
            exit_code=0,
            extra_info={
                "stdout": "ok",
                "stderr": "",
                "exit_code": 0,
            },
        )

    monkeypatch.setattr(
        "app.tools.shell_exec.ProcessExecutor.execute_command",
        fake_execute_command,
    )

    tool = ShellExec(base_dir=tmp_path)
    result = await tool.execute(
        _FakeToolContext(current_model_id="mock-current-model"),
        ShellExecParams(command="python mock_script.py"),
    )

    assert result.ok is True
    assert captured_kwargs["extra_env"]["SUPER_MAGIC_CURRENT_MODEL_ID"] == "mock-current-model"


@pytest.mark.asyncio
async def test_shell_exec_uses_marker_override_for_after_and_detail():
    payload = {
        "after": {
            "remark": "Mock task finished",
        },
        "tool_detail": {
            "file_name": "mock_result.md",
            "markdown": "## Result\n\nThe mock script finished.",
        },
    }
    result = TerminalToolResult(
        command="python mock_script.py",
        content=f"normal output\n{_marker(payload)}",
        ok=True,
        extra_info={
            "stdout": f"normal output\n{_marker(payload)}",
            "stderr": "",
            "exit_code": 0,
        },
    )
    apply_tool_detail_markers(result)

    tool = ShellExec()
    after = await tool.get_after_tool_call_friendly_action_and_remark(
        "shell_exec",
        None,
        result,
        0.1,
        {"command": "python mock_script.py"},
    )
    detail = await tool.get_tool_detail(
        None,
        result,
        {"command": "python mock_script.py"},
    )

    assert after["remark"] == "Mock task finished"
    assert after["tool_name"] == "shell_exec"
    assert detail.type == DisplayType.MD
    assert detail.data.file_name == "mock_result.md"
    assert detail.data.content == "## Result\n\nThe mock script finished."


def test_shell_exec_marker_keeps_invalid_json_visible():
    output = "before\n<super-magic-tool-detail>{invalid}</super-magic-tool-detail>\nafter"
    result = TerminalToolResult(
        command="python mock_script.py",
        content=output,
        ok=True,
        extra_info={
            "stdout": output,
            "stderr": "",
            "exit_code": 0,
        },
    )

    apply_tool_detail_markers(result)

    assert result.content == output
    assert result.extra_info["stdout"] == output
    assert DISPLAY_OVERRIDE_KEY not in result.extra_info
