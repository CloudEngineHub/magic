from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from agentlang.context.tool_context import ToolContext
from agentlang.event.event import EventType
from app.core.context.agent_context import AgentContext
from app.core.context.pending_reply_state import PendingReplyState
from app.core.entity.factory.task_message_factory_v2 import TaskMessageFactoryV2
from app.core.entity.final_task_state import FinalTaskState, FinalTaskStateCode
from app.core.entity.message.server_message import TaskStatus
from app.tools.run_sdk_snippet import RunSdkSnippet


class MockAgentContext(AgentContext):
    """提供 V2 消息工厂所需最小契约的 AgentContext Mock。"""

    def __init__(self, final_task_state=None):
        self._final_task_state = final_task_state
        self._pending_reply_state = None

    def get_metadata(self):
        return {"topic_id": "mock_topic_id"}

    def get_task_id(self):
        return "mock_task_id"

    def get_sandbox_id(self):
        return "mock_sandbox_id"

    def get_final_task_state(self):
        return self._final_task_state

    def get_project_archive_info(self):
        return None

    def get_next_seq_id(self):
        return 1

    def get_pending_reply_state(self):
        return self._pending_reply_state

    def set_pending_reply_state(self, state):
        self._pending_reply_state = state


class MockTool:
    """提供消息工厂测试所需的最小 Tool Mock。"""

    def __init__(self, visible_in_ui=True):
        self._visible_in_ui = visible_in_ui

    def is_visible_in_ui(self):
        """返回 Mock 工具声明的前端展示标记。"""
        return self._visible_in_ui


def test_build_inner_message_includes_sandbox_id():
    message = TaskMessageFactoryV2._build_inner_message(
        MockAgentContext(),
        role="assistant",
        correlation_id="mock_correlation_id",
        content="mock content",
    )

    assert message["sandbox_id"] == "mock_sandbox_id"
    assert message["task_id"] == "mock_task_id"
    assert message["topic_id"] == "mock_topic_id"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("final_task_state", "agent_state", "expected_status", "expected_inner_content"),
    [
        (
            FinalTaskState(
                code=FinalTaskStateCode.MESSAGE_PROCESSING_FAILED,
                custom_message="The task failed.",
            ),
            TaskStatus.ERROR.value,
            TaskStatus.ERROR,
            "The task failed.",
        ),
        (
            FinalTaskState(
                code=FinalTaskStateCode.INSUFFICIENT_POINTS,
                custom_message="Insufficient points.",
            ),
            TaskStatus.SUSPENDED.value,
            TaskStatus.SUSPENDED,
            "Insufficient points.",
        ),
        (
            None,
            TaskStatus.FINISHED.value,
            TaskStatus.FINISHED,
            "",
        ),
    ],
)
async def test_after_main_agent_run_only_includes_error_or_suspended_content(
    monkeypatch,
    final_task_state,
    agent_state,
    expected_status,
    expected_inner_content,
):
    monkeypatch.setattr(
        "app.core.entity.factory.task_message_factory_v2.AttachmentSorter.get_processed_attachments",
        lambda _agent_context: [],
    )
    agent_context = MockAgentContext(final_task_state=final_task_state)
    event = SimpleNamespace(
        data=SimpleNamespace(
            agent_context=agent_context,
            agent_state=agent_state,
            correlation_id="mock_correlation_id",
        )
    )

    message = await TaskMessageFactoryV2.create_after_main_agent_run_message(event)

    inner_message = message.payload.raw_content["super_magic_message"]
    assert message.payload.status == expected_status
    assert inner_message["content"] == expected_inner_content


def test_agent_suspended_message_includes_inner_content(monkeypatch):
    monkeypatch.setattr(
        "app.core.entity.factory.task_message_factory_v2.render_final_task_state_message",
        lambda _final_task_state: "The task was suspended.",
    )
    agent_context = MockAgentContext()
    final_task_state = FinalTaskState(code=FinalTaskStateCode.USER_INTERRUPTED)

    message = TaskMessageFactoryV2.create_agent_suspended_message(
        agent_context,
        final_task_state,
    )

    inner_message = message.payload.raw_content["super_magic_message"]
    assert message.payload.status == TaskStatus.SUSPENDED
    assert inner_message["content"] == "The task was suspended."


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("content", "reasoning"),
    [
        ("", ""),
        ("mock content", ""),
        ("", "mock reasoning"),
    ],
)
async def test_tool_call_keeps_complete_authoritative_assistant(
    monkeypatch,
    content,
    reasoning,
):
    """后端应保留完整 Tool Call、文本和权威消息身份。"""
    agent_context = MockAgentContext()
    agent_context.set_pending_reply_state(PendingReplyState(
        content=content,
        reasoning=reasoning,
        correlation_id="mock-llm-correlation-id",
        message_id="mock-message-id",
        tool_calls=[{
            "id": "mock-tool-call-id",
            "type": "function",
            "function": {"name": "mock-hidden-tool", "arguments": "{}"},
        }],
    ))
    tool_context = ToolContext(tool_call_id="mock-tool-call-id", tool_name="mock-hidden-tool")
    tool_context.register_extension("agent_context", agent_context)
    tool = MockTool(visible_in_ui=False)
    event = SimpleNamespace(
        event_type=EventType.BEFORE_TOOL_CALL,
        data=SimpleNamespace(
            tool_context=tool_context,
            tool_instance=tool,
            tool_name="mock-hidden-tool",
            arguments={},
            tool_call=SimpleNamespace(id="mock-tool-call-id"),
            correlation_id="mock-tool-correlation-id",
        ),
    )
    monkeypatch.setattr(
        TaskMessageFactoryV2,
        "_build_running_tool_call_item",
        AsyncMock(return_value={
            "id": "mock-tool-call-id",
            "type": "function",
            "function": {"name": "mock-hidden-tool", "arguments": "{}", "label": ""},
            "tool": {"id": "mock-tool-call-id", "name": "mock-hidden-tool"},
        }),
    )

    message = await TaskMessageFactoryV2.create_before_tool_call_message(event)

    inner_message = message.payload.raw_content["super_magic_message"]
    assert message.payload.show_in_ui is False
    assert message.payload.message_id == "mock-message-id"
    assert inner_message["message_id"] == "mock-message-id"
    assert inner_message["super_message_id"] == "mock-message-id"
    assert inner_message["correlation_id"] == "mock-llm-correlation-id"
    assert [tool_call["function"]["name"] for tool_call in inner_message["tool_calls"]] == [
        "mock-hidden-tool"
    ]
    assert inner_message.get("content") == (content or None)
    assert inner_message.get("reasoning_content") == (reasoning or None)


@pytest.mark.asyncio
async def test_run_sdk_snippet_tool_only_reply_keeps_authoritative_message(monkeypatch):
    """纯 run_sdk_snippet Tool Call 也应发送同身份权威 Assistant。"""
    agent_context = MockAgentContext()
    agent_context.set_pending_reply_state(PendingReplyState(
        correlation_id="mock-llm-correlation-id",
        message_id="mock-message-id",
        tool_calls=[{
            "id": "mock-tool-call-id",
            "type": "function",
            "function": {"name": "run_sdk_snippet", "arguments": "{}"},
        }],
    ))
    tool_context = ToolContext(tool_call_id="mock-tool-call-id", tool_name="run_sdk_snippet")
    tool_context.register_extension("agent_context", agent_context)
    tool = RunSdkSnippet()
    event = SimpleNamespace(
        event_type=EventType.BEFORE_TOOL_CALL,
        data=SimpleNamespace(
            tool_context=tool_context,
            tool_instance=tool,
            tool_name="run_sdk_snippet",
            arguments={},
            tool_call=SimpleNamespace(id="mock-tool-call-id"),
            correlation_id="mock-tool-correlation-id",
        ),
    )
    monkeypatch.setattr(
        TaskMessageFactoryV2,
        "_build_running_tool_call_item",
        AsyncMock(return_value={
            "id": "mock-tool-call-id",
            "type": "function",
            "function": {"name": "run_sdk_snippet", "arguments": "{}", "label": ""},
            "tool": {"id": "mock-tool-call-id", "name": "run_sdk_snippet"},
        }),
    )

    message = await TaskMessageFactoryV2.create_before_tool_call_message(event)

    inner_message = message.payload.raw_content["super_magic_message"]
    assert message.payload.show_in_ui is False
    assert message.payload.message_id == "mock-message-id"
    assert inner_message["super_message_id"] == "mock-message-id"
    assert inner_message["correlation_id"] == "mock-llm-correlation-id"
    assert [tool_call["function"]["name"] for tool_call in inner_message["tool_calls"]] == [
        "run_sdk_snippet"
    ]


@pytest.mark.asyncio
async def test_batch_projection_keeps_all_tool_calls(monkeypatch):
    """批量 Tool 权威消息应保留全部调用并复用预生成消息身份。"""
    agent_context = MockAgentContext()
    agent_context.set_pending_reply_state(PendingReplyState(
        correlation_id="mock-llm-correlation-id",
        message_id="mock-message-id",
        tool_calls=[
            {
                "id": "mock-hidden-tool-call-id",
                "type": "function",
                "function": {"name": "mock-hidden-tool", "arguments": "{}"},
            },
            {
                "id": "mock-visible-tool-call-id",
                "type": "function",
                "function": {"name": "mock-visible-tool", "arguments": "{}"},
            },
        ],
    ))
    tool_context = ToolContext(tool_call_id="mock-hidden-tool-call-id", tool_name="mock-hidden-tool")
    tool_context.register_extension("agent_context", agent_context)
    first_tool = MockTool(visible_in_ui=False)
    second_tool = MockTool()
    event = SimpleNamespace(
        event_type=EventType.BEFORE_TOOL_CALL,
        data=SimpleNamespace(
            tool_context=tool_context,
            tool_instance=first_tool,
            tool_name="mock-hidden-tool",
            arguments={},
            tool_call=SimpleNamespace(id="mock-hidden-tool-call-id"),
            correlation_id="mock-tool-correlation-id",
        ),
    )

    async def build_running_tool_call_item(_tool, tool_name, _context, _arguments, tool_call_id):
        """构造与目标工具身份一致的 Mock 展示项。"""
        return {
            "id": tool_call_id,
            "type": "function",
            "function": {"name": tool_name, "arguments": "{}", "label": ""},
            "tool": {"id": tool_call_id, "name": tool_name},
        }

    monkeypatch.setattr(
        TaskMessageFactoryV2,
        "_build_running_tool_call_item",
        build_running_tool_call_item,
    )
    monkeypatch.setattr(
        "app.core.entity.factory.task_message_factory_v2.tool_executor.get_tool",
        lambda tool_name: second_tool if tool_name == "mock-visible-tool" else None,
    )

    message = await TaskMessageFactoryV2.create_before_tool_call_message(event)

    inner_message = message.payload.raw_content["super_magic_message"]
    assert message.payload.show_in_ui is True
    assert message.payload.message_id == "mock-message-id"
    assert [tool_call["id"] for tool_call in inner_message["tool_calls"]] == [
        "mock-hidden-tool-call-id",
        "mock-visible-tool-call-id"
    ]
