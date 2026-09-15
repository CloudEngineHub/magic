from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from agentlang.event.correlation_id_manager import CorrelationIdManager
from agentlang.llms.processors.regular_call_processor import RegularCallProcessor


class MockAgentContext:
    """提供非流式事件分发所需最小上下文契约。"""

    def __init__(self, message_version="v2", context_id="mock-context"):
        self._message_version = message_version
        self.context_id = context_id

    def get_message_version(self):
        return self._message_version


def build_mock_response(reasoning=None, content=None, has_tool_calls=False):
    """构造字段契约与 ChatCompletion 一致的 Mock 响应。"""
    message = SimpleNamespace(
        reasoning_content=reasoning,
        content=content,
        tool_calls=[SimpleNamespace(id="mock-tool-call-id")] if has_tool_calls else None,
    )
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reasoning", "content", "has_tool_calls", "expected_before_think", "expected_after_think"),
    [
        ("mock reasoning", None, False, 1, 1),
        (None, "mock content", False, 0, 1),
        (None, None, True, 0, 0),
        ("mock reasoning", None, True, 1, 0),
        (None, "mock content", True, 0, 1),
        ("mock reasoning", "mock content", False, 1, 1),
        ("mock reasoning", "mock content", True, 1, 1),
    ],
)
async def test_v2_response_triggers_one_atomic_reply(
    monkeypatch,
    reasoning,
    content,
    has_tool_calls,
    expected_before_think,
    expected_after_think,
):
    """V2 七种响应字段组合都只触发一次原子回复完成事件。"""
    response = build_mock_response(reasoning, content, has_tool_calls)
    context = MockAgentContext()
    correlation_manager = CorrelationIdManager()
    before_think = AsyncMock()
    after_think = AsyncMock()
    before_reply = AsyncMock()
    after_reply = AsyncMock()

    monkeypatch.setattr("agentlang.event.get_correlation_manager", lambda: correlation_manager)
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ThinkEventManager.trigger_before_think",
        before_think,
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ThinkEventManager.trigger_after_think",
        after_think,
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ReplyEventManager.trigger_before_reply",
        before_reply,
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ReplyEventManager.trigger_after_reply",
        after_reply,
    )

    await RegularCallProcessor._trigger_response_events(
        response=response,
        agent_context=context,
        model_id="mock-model-id",
        model_name="mock-model-name",
        request_id="mock-request-id",
        elapsed_time=10.0,
    )

    assert before_reply.await_count == 0
    assert after_reply.await_count == 1
    assert before_think.await_count == expected_before_think
    assert after_think.await_count == expected_after_think
    assert after_reply.await_args.kwargs["response"] is response
    assert after_reply.await_args.kwargs["correlation_id"] == "mock-request-id"


@pytest.mark.asyncio
async def test_v2_fallback_uses_current_scope_correlation(monkeypatch):
    """V2 非流式降级只消费当前上下文保存的关联 ID。"""
    response = build_mock_response(content="mock content")
    context = MockAgentContext(context_id="mock-context-a")
    correlation_manager = CorrelationIdManager()
    correlation_manager.set_stream_fallback_cid("mock-fallback-a", "mock-context-a")
    correlation_manager.set_stream_fallback_cid("mock-fallback-b", "mock-context-b")
    after_reply = AsyncMock()

    monkeypatch.setattr("agentlang.event.get_correlation_manager", lambda: correlation_manager)
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ThinkEventManager.trigger_after_think",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ReplyEventManager.trigger_after_reply",
        after_reply,
    )

    await RegularCallProcessor._trigger_response_events(
        response=response,
        agent_context=context,
        model_id="mock-model-id",
        model_name="mock-model-name",
        request_id="mock-request-id",
        elapsed_time=10.0,
    )

    assert after_reply.await_args.kwargs["correlation_id"] == "mock-fallback-a"
    assert correlation_manager.pop_stream_fallback_cid("mock-context-b") == "mock-fallback-b"


@pytest.mark.asyncio
async def test_v1_keeps_phased_reply_events(monkeypatch):
    """V1 继续分别触发 reasoning 和 content 的阶段事件。"""
    response = build_mock_response(reasoning="mock reasoning", content="mock content")
    context = MockAgentContext(message_version="v1")
    before_reply = AsyncMock()
    after_reply = AsyncMock()

    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ThinkEventManager.trigger_before_think",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ThinkEventManager.trigger_after_think",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ReplyEventManager.trigger_before_reply",
        before_reply,
    )
    monkeypatch.setattr(
        "agentlang.llms.processors.regular_call_processor.ReplyEventManager.trigger_after_reply",
        after_reply,
    )

    await RegularCallProcessor._trigger_response_events(
        response=response,
        agent_context=context,
        model_id="mock-model-id",
        model_name="mock-model-name",
        request_id="mock-request-id",
        elapsed_time=10.0,
    )

    assert before_reply.await_count == 2
    assert after_reply.await_count == 2
    assert before_reply.await_args_list[0].kwargs["content_type"] == "reasoning"
    assert before_reply.await_args_list[1].kwargs["content_type"] == "content"
    assert after_reply.await_args_list[0].kwargs["content_type"] == "reasoning"
    assert after_reply.await_args_list[1].kwargs["content_type"] == "content"
