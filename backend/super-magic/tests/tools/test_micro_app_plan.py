from app.tools.plan import MicroAppPlanTool


def test_micro_app_plan_uses_domain_specific_tool_name():
    tool = MicroAppPlanTool()

    assert tool.name == "micro_app_plan"
    assert tool.to_param()["function"]["name"] == "micro_app_plan"
    assert "call micro_app_plan again" in tool.get_prompt_hint()
