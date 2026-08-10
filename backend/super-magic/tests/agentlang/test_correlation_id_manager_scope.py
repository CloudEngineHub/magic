from agentlang.event.correlation_id_manager import CorrelationIdManager, EventPairType


def test_tool_call_correlation_is_isolated_by_scope():
    manager = CorrelationIdManager()

    parent_correlation_id = manager.generate_for_before_event(
        EventPairType.TOOL_CALL,
        "mock-parent-context",
    )
    child_correlation_id = manager.generate_for_before_event(
        EventPairType.TOOL_CALL,
        "mock-child-context",
    )

    assert child_correlation_id != parent_correlation_id
    assert manager.consume_for_after_event(EventPairType.TOOL_CALL, "mock-child-context") == child_correlation_id
    assert manager.consume_for_after_event(EventPairType.TOOL_CALL, "mock-parent-context") == parent_correlation_id


def test_correlation_manager_keeps_global_scope_compatibility():
    manager = CorrelationIdManager()

    first_correlation_id = manager.generate_for_before_event(EventPairType.TOOL_CALL)
    retried_correlation_id = manager.generate_for_before_event(EventPairType.TOOL_CALL)

    assert retried_correlation_id == first_correlation_id
    assert manager.consume_for_after_event(EventPairType.TOOL_CALL) == first_correlation_id


def test_stream_fallback_correlation_is_isolated_by_scope():
    """不同 AgentContext 应分别保存并消费自己的流式降级关联 ID。"""
    manager = CorrelationIdManager()

    manager.set_stream_fallback_cid("mock-fallback-a", "mock-context-a")
    manager.set_stream_fallback_cid("mock-fallback-b", "mock-context-b")

    assert manager.pop_stream_fallback_cid("mock-context-a") == "mock-fallback-a"
    assert manager.pop_stream_fallback_cid("mock-context-a") is None
    assert manager.pop_stream_fallback_cid("mock-context-b") == "mock-fallback-b"


def test_stream_fallback_keeps_global_scope_compatibility():
    """未传 scope 时继续使用全局兼容存储。"""
    manager = CorrelationIdManager()

    manager.set_stream_fallback_cid("mock-global-fallback")

    assert manager.pop_stream_fallback_cid() == "mock-global-fallback"
    assert manager.pop_stream_fallback_cid() is None
