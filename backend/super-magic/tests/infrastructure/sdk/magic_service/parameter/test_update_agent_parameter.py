from app.infrastructure.sdk.magic_service.parameter.update_agent_parameter import UpdateAgentParameter


def test_update_agent_parameter_serializes_image_icon_with_value():
    parameter = UpdateAgentParameter(
        code="SMA-test",
        name_i18n={"default": "测试员工"},
        icon={"type": "image", "value": "https://example.com/agent-logo.png"},
        icon_type=2,
    )

    assert parameter.to_body() == {
        "name_i18n": {"default": "测试员工"},
        "icon": {"type": "image", "value": "https://example.com/agent-logo.png"},
        "icon_type": 2,
    }


def test_update_agent_parameter_omits_unset_optional_fields():
    parameter = UpdateAgentParameter(code="SMA-test")

    assert parameter.to_body() == {}