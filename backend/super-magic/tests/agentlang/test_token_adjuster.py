from agentlang.llms.utils.token_adjuster import MAX_MAX_TOKENS, adjust_max_tokens


def test_adjust_max_tokens_caps_large_request_when_context_allows():
    assert (
        adjust_max_tokens(
            requested_max_tokens=384_000,
            current_input_tokens=10_000,
            max_context_tokens=1_000_000,
            request_id="test",
        )
        == MAX_MAX_TOKENS
    )


def test_adjust_max_tokens_caps_large_available_context():
    assert (
        adjust_max_tokens(
            requested_max_tokens=384_000,
            current_input_tokens=900_000,
            max_context_tokens=1_000_000,
            request_id="test",
        )
        == MAX_MAX_TOKENS
    )
