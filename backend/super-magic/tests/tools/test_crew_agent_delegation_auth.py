from app.core.subagent_delegation import is_custom_agent_code


def test_only_sma_codes_are_treated_as_custom_agents():
    assert is_custom_agent_code("SMA-data") is True
    assert is_custom_agent_code("SMA_data") is True
    assert is_custom_agent_code("explore") is False
    assert is_custom_agent_code("magic") is False
    assert is_custom_agent_code("data-analyst") is False
