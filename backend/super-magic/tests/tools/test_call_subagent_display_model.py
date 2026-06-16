from types import SimpleNamespace

from app.tools.call_subagent import _resolve_subagent_display_model_id


class _FakeToolContext:
    def __init__(self, parent):
        self.parent = parent

    def get_extension(self, name: str):
        return self.parent if name == "agent_context" else None


def test_subagent_display_model_uses_parent_entry_model_before_runtime_model():
    parent = SimpleNamespace(
        get_runtime_model_id=lambda: "mock-runtime-text",
        model_context=SimpleNamespace(current_text_model_id="mock-context-text"),
    )

    assert _resolve_subagent_display_model_id(_FakeToolContext(parent), None) == "mock-context-text"
