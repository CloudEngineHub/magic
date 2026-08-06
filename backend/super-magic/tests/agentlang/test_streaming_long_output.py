from agentlang.llms.processors.streaming_util import StreamingState


def test_streaming_state_allows_content_below_safety_limit():
    state = StreamingState()
    state.content_text = "x" * (state.STREAM_CONTENT_MAX_CHARS - 1)

    assert state.is_content_degenerate() is False


def test_streaming_state_still_detects_degenerate_output():
    state = StreamingState()
    state.content_text = "x" * state.STREAM_CONTENT_MAX_CHARS

    assert state.is_content_degenerate() is True
