from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    MessageScheduleParameter,
    UpdateMessageScheduleParameter,
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


def test_message_schedule_parameter_preserves_json_content_for_rich_text():
    message_content = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "attrs": {
                            "id": "file-1",
                            "label": "magic.project.js",
                            "type": "project_file",
                        },
                    },
                    {"type": "text", "text": " 更新 AI 卡片"},
                ],
            },
        ],
    }

    parameter = MessageScheduleParameter(
        task_name="AI Card",
        message_content=message_content,
        time_config=TimeConfig(schedule_type="daily_repeat", time="9:00"),
        topic_id="123",
        model_id="model-1",
        topic_pattern="ip-manager",
    )

    body = parameter.to_body()

    assert body["message_content"] is message_content
    assert body["message_content"]["content"][0]["content"][0]["type"] == "mention"
    assert body["message_type"] == "rich_text"


def test_update_message_schedule_parameter_preserves_json_content_for_rich_text():
    message_content = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "attrs": {
                            "id": "file-2",
                            "label": "review.html",
                            "type": "project_file",
                        },
                    },
                    {"type": "text", "text": " 更新复盘报告"},
                ],
            }
        ],
    }

    parameter = UpdateMessageScheduleParameter(
        schedule_id="schedule-1",
        message_content=message_content,
        message_type="rich_text",
    )

    body = parameter.to_body()

    assert body["message_content"] is message_content
    assert body["message_content"]["content"][0]["content"][0]["attrs"]["label"] == "review.html"

