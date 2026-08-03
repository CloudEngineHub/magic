from types import SimpleNamespace

import pytest

from app.core.entity.factory.task_message_factory_v2 import TaskMessageFactoryV2
from app.core.entity.final_task_state import FinalTaskState, FinalTaskStateCode
from app.core.entity.message.server_message import TaskStatus


class MockAgentContext:
    def __init__(self, final_task_state=None):
        self._final_task_state = final_task_state

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
