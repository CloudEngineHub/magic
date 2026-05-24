from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    MessageScheduleParameter,
    TimeConfig,
)


def test_message_schedule_parameter_includes_topic_pattern():
    parameter = MessageScheduleParameter(
        task_name="AI Card",
        message_content="Update the AI card",
        time_config=TimeConfig(schedule_type="daily_repeat", time="9:00"),
        topic_id="123",
        model_id="model-1",
        topic_pattern="ip-manager",
    )

    assert parameter.to_body()["topic_pattern"] == "ip-manager"


def test_message_schedule_parameter_includes_agent_code():
    parameter = MessageScheduleParameter(
        task_name="Custom Agent Task",
        message_content="Update with custom agent",
        time_config=TimeConfig(schedule_type="daily_repeat", time="9:00"),
        topic_id="123",
        model_id="model-1",
        topic_pattern="custom_agent",
        agent_code="SMA-custom-agent",
    )

    assert parameter.to_body()["agent_code"] == "SMA-custom-agent"
