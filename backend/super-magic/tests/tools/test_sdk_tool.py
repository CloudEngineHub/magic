import json
from unittest.mock import patch

from sdk.tool import ToolSDK


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_tool_sdk_does_not_set_http_timeout(monkeypatch):
    monkeypatch.setenv("SUPER_MAGIC_AGENT_CONTEXT_ID", "agent-context-1")
    monkeypatch.setenv("SUPER_MAGIC_SDK_EXECUTION_ID", "sdk-execution-1")
    sdk = ToolSDK()
    recorded = {"called": False}

    def _fake_urlopen(req):
        recorded["called"] = True
        return _FakeResponse(
            {
                "code": 1000,
                "data": {
                    "ok": True,
                    "content": "ok",
                    "tool_call_id": "call_123",
                    "name": "create_canvas",
                },
            }
        )

    with patch("sdk.tool.urllib.request.urlopen", side_effect=_fake_urlopen):
        result = sdk.call("create_canvas", {"project_path": "demo"})

    assert result.ok is True
    assert recorded["called"] is True


def test_tool_sdk_requires_agent_context_id(monkeypatch):
    monkeypatch.delenv("SUPER_MAGIC_AGENT_CONTEXT_ID", raising=False)
    sdk = ToolSDK()

    with patch("sdk.tool.urllib.request.urlopen", side_effect=AssertionError("urlopen should not be called")):
        result = sdk.call("create_canvas", {"project_path": "demo"})

    assert result.ok is False
    assert "SUPER_MAGIC_AGENT_CONTEXT_ID is not set" in result.content
