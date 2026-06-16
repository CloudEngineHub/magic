from agentlang.llms.factory import LLMFactory
from agentlang.llms.token_usage.pricing import ModelPricing


def test_model_config_manager_pricing_sync_removes_stale_models():
    from agentlang.config.models.model_config import ModelConfig
    from agentlang.config.models.model_config_manager import model_config_manager

    saved_models = dict(model_config_manager._models)
    saved_pricing = LLMFactory.pricing
    try:
        LLMFactory.pricing = ModelPricing()
        LLMFactory.pricing.add_model_pricing(
            "stale-model",
            {
                "input_price": 9.0,
                "output_price": 9.0,
                "currency": "USD",
            },
        )
        model_config_manager._models = {
            "fresh-model": ModelConfig.from_dict(
                "fresh-model",
                {
                    "name": "fresh-model",
                    "provider": "openai",
                    "api_key": "mock-key",
                    "api_base_url": "https://llm.example.com/v1",
                    "type": "llm",
                    "pricing": {
                        "input_price": 1.0,
                        "output_price": 2.0,
                        "currency": "USD",
                    },
                },
                provider_source="config.yaml",
            )
        }

        model_config_manager._sync_pricing()

        assert "fresh-model" in LLMFactory.pricing.pricing
        assert "stale-model" not in LLMFactory.pricing.pricing
        assert "default" in LLMFactory.pricing.pricing
    finally:
        model_config_manager._models = saved_models
        LLMFactory.pricing = saved_pricing


def test_model_config_manager_pricing_sync_registers_model_aliases():
    from agentlang.config.models.model_config import ModelConfig
    from agentlang.config.models.model_config_manager import model_config_manager

    saved_models = dict(model_config_manager._models)
    saved_pricing = LLMFactory.pricing
    try:
        LLMFactory.pricing = ModelPricing()
        pricing = {
            "input_price": 1.0,
            "output_price": 2.0,
            "currency": "USD",
        }
        model_config_manager._models = {
            "auto": ModelConfig.from_dict(
                "auto",
                {
                    "name": "deepseek-v4-flash",
                    "provider": "openai",
                    "api_key": "mock-key",
                    "api_base_url": "https://llm.example.com/v1",
                    "type": "llm",
                    "resolved_model_id": "deepseek-v4-flash-routed",
                    "metadata": {"api_model": "deepseek-v4-flash-api"},
                    "pricing": pricing,
                },
                provider_source="config.yaml",
            )
        }

        model_config_manager._sync_pricing()

        assert LLMFactory.pricing.get_model_pricing("auto") == pricing
        assert LLMFactory.pricing.get_model_pricing("deepseek-v4-flash") == pricing
        assert LLMFactory.pricing.get_model_pricing("deepseek-v4-flash-routed") == pricing
        assert LLMFactory.pricing.get_model_pricing("deepseek-v4-flash-api") == pricing
    finally:
        model_config_manager._models = saved_models
        LLMFactory.pricing = saved_pricing


def test_model_config_manager_does_not_warn_missing_pricing_for_config_yaml_only():
    from agentlang.config.models.model_config import ModelConfig
    from agentlang.config.models.model_config_manager import model_config_manager

    saved_models = dict(model_config_manager._models)
    saved_provider_types = set(model_config_manager._loaded_provider_types)
    saved_pricing = LLMFactory.pricing
    try:
        LLMFactory.pricing = ModelPricing()
        model_config_manager._loaded_provider_types = {"config.yaml"}
        model_config_manager._models = {
            "auto": ModelConfig.from_dict(
                "auto",
                {
                    "name": "deepseek-v4-flash",
                    "provider": "openai",
                    "api_key": "mock-key",
                    "api_base_url": "https://llm.example.com/v1",
                    "type": "llm",
                },
                provider_source="config.yaml",
            )
        }

        assert model_config_manager._should_warn_missing_pricing(0) is False
        model_config_manager._sync_pricing()

        assert "default" in LLMFactory.pricing.pricing
    finally:
        model_config_manager._models = saved_models
        model_config_manager._loaded_provider_types = saved_provider_types
        LLMFactory.pricing = saved_pricing


def test_model_config_manager_warns_missing_pricing_after_dynamic_provider():
    from agentlang.config.models.model_config import ModelConfig
    from agentlang.config.models.model_config_manager import model_config_manager

    saved_models = dict(model_config_manager._models)
    saved_provider_types = set(model_config_manager._loaded_provider_types)
    saved_pricing = LLMFactory.pricing
    try:
        LLMFactory.pricing = ModelPricing()
        model_config_manager._loaded_provider_types = {"config.yaml", "magic-service"}
        model_config_manager._models = {
            "auto": ModelConfig.from_dict(
                "auto",
                {
                    "name": "deepseek-v4-flash",
                    "provider": "openai",
                    "api_key": "mock-key",
                    "api_base_url": "https://llm.example.com/v1",
                    "type": "llm",
                },
                provider_source="magic-service",
            )
        }

        assert model_config_manager._should_warn_missing_pricing(0) is True
        model_config_manager._sync_pricing()

        assert "default" in LLMFactory.pricing.pricing
    finally:
        model_config_manager._models = saved_models
        model_config_manager._loaded_provider_types = saved_provider_types
        LLMFactory.pricing = saved_pricing


def test_openai_integration_uses_synced_factory_pricing(monkeypatch):
    from app.infrastructure.observability import openai_integration

    pricing = object()
    monkeypatch.setattr(LLMFactory, "pricing", pricing)
    monkeypatch.setattr(openai_integration, "_model_pricing", None)
    monkeypatch.setattr(openai_integration, "TOKEN_TRACKING_AVAILABLE", True)

    assert openai_integration._get_model_pricing() is pricing


def test_llm_cost_tracking_uses_synced_factory_pricing(monkeypatch):
    from app.infrastructure.observability import llm_cost_tracking

    pricing = object()
    monkeypatch.setattr(LLMFactory, "pricing", pricing)
    monkeypatch.setattr(llm_cost_tracking, "_model_pricing", None)

    assert llm_cost_tracking._get_model_pricing() is pricing


def test_model_pricing_uses_longest_prefix_match():
    pricing = ModelPricing()
    broad = {"input_price": 1.0, "output_price": 1.0, "currency": "USD"}
    specific = {"input_price": 2.0, "output_price": 2.0, "currency": "USD"}
    pricing.pricing = {
        "default": {"input_price": 0.1, "output_price": 0.1, "currency": "USD"},
        "deepseek-v4": broad,
        "deepseek-v4-flash": specific,
    }

    assert pricing.get_model_pricing("deepseek-v4-flash-202606") == specific
