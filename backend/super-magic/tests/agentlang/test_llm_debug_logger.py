from agentlang.llms.utils.debug_logger import _sanitize_request_params


def test_llm_debug_log_sanitizes_sensitive_request_params():
    sanitized = _sanitize_request_params({
        "model": "mock-model",
        "extra_headers": {
            "Magic-Authorization": "magic-secret",
            "User-Authorization": "user-secret",
            "Magic-Task-Id": "task-id",
        },
        "extra_body": {
            "api_key": "body-secret",
        },
    })

    assert sanitized["extra_headers"]["Magic-Authorization"] == "<redacted>"
    assert sanitized["extra_headers"]["User-Authorization"] == "<redacted>"
    assert sanitized["extra_headers"]["Magic-Task-Id"] == "task-id"
    assert sanitized["extra_body"]["api_key"] == "<redacted>"
