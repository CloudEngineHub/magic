from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from agentlang.event.event import EventType
from app.service.agent_event.stream_listener_service import StreamListenerService


class MockToolContext:
    """提供消息发送服务所需扩展上下文契约。"""

    def __init__(self, agent_context):
        self._agent_context = agent_context

    def get_extension_typed(self, name, _extension_type):
        if name == "agent_context":
            return self._agent_context
        return None


@pytest.mark.asyncio
async def test_show_in_ui_false_message_is_saved_and_sent(monkeypatch):
    """show_in_ui 仅作为协议字段，不应阻断权威消息发送。"""
    stream = SimpleNamespace(
        should_ignore_event=lambda _event_type: False,
        write=AsyncMock(),
    )
    agent_context = SimpleNamespace(
        streams={"mock-stream": stream},
        get_non_human_options=lambda: None,
    )
    tool_context = MockToolContext(agent_context)
    task_message = SimpleNamespace(
        payload=SimpleNamespace(
            task_id="mock-task-id",
            seq_id=1,
            show_in_ui=False,
            message_id="mock-message-id",
        ),
        model_dump_json=lambda: "mock-message-json",
    )
    history_manager = SimpleNamespace(save_message=AsyncMock(return_value=True))
    monkeypatch.setattr(
        "app.service.message_history_service.get_message_history_service",
        lambda: history_manager,
    )

    await StreamListenerService._send_task_message(
        tool_context=tool_context,
        task_message=task_message,
        event=SimpleNamespace(event_type=EventType.BEFORE_TOOL_CALL),
    )

    history_manager.save_message.assert_awaited_once_with(task_message)
    stream.write.assert_awaited_once_with("mock-message-json")
