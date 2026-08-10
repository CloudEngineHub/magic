from copy import deepcopy

import pytest
import yaml

from agentlang.config.config import config
from agentlang.config.models.model_config import ModelConfig
from agentlang.config.models.model_config_manager import model_config_manager
from agentlang.config.models.providers.config_yaml_provider import ConfigYamlProvider
from app.api.routes.models import _append_local_text_models
from app.core.model_providers.model_filter import should_skip_model


def _write_yaml(path, data):
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _provider_config(models, api_key="default-key", base_url="https://example.com/v1"):
    return {
        "client_type": "openai_chat_completions",
        "base_url": base_url,
        "api_key": api_key,
        "models": models,
    }


def _provider_model(api_model, profile=None):
    return {
        "api_model": api_model,
        "profile": profile or api_model,
    }


def _model_profile(max_context_tokens=8192, max_output_tokens=4096):
    return {
        "max_context_tokens": max_context_tokens,
        "max_output_tokens": max_output_tokens,
    }


def _model_config(name, api_key="default-key", api_base_url="https://example.com/v1"):
    return {
        "name": name,
        "provider": "openai",
        "api_key": api_key,
        "api_base_url": api_base_url,
        "type": "llm",
        "supports_tool_use": True,
        "max_output_tokens": 4096,
        "max_context_tokens": 8192,
        "temperature": 0.7,
    }


@pytest.fixture(autouse=True)
def restore_config_state():
    saved_state = {
        "_config": deepcopy(config._config),
        "_raw_config": deepcopy(config._raw_config),
        "_model": config._model,
        "_config_loaded": config._config_loaded,
        "_config_path": config._config_path,
        "_manager_models": deepcopy(model_config_manager._models),
    }

    yield

    config._config = saved_state["_config"]
    config._raw_config = saved_state["_raw_config"]
    config._model = saved_state["_model"]
    config._config_loaded = saved_state["_config_loaded"]
    config._config_path = saved_state["_config_path"]
    model_config_manager._models = saved_state["_manager_models"]


def test_load_config_without_local_file_keeps_default_providers(tmp_path):
    config_path = tmp_path / "config.yaml"
    _write_yaml(
        config_path,
        {
            "providers": {
                "custom": _provider_config(
                    {
                        "default-model": _provider_model("default-model"),
                    }
                ),
            },
            "model_profiles": {
                "default-model": _model_profile(),
            },
        },
    )

    config.load_config(str(config_path))

    assert config._config_path == str(config_path)
    assert set(config.get("providers").keys()) == {"custom"}
    assert config.get("providers.custom.models.default-model.api_model") == "default-model"


def test_load_config_merges_local_providers_and_overrides_same_model_id(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_MODEL_NAME", "secret-local-model")
    config_path = tmp_path / "config.yaml"
    local_config_path = tmp_path / "config.local.yaml"

    _write_yaml(
        config_path,
        {
            "providers": {
                "custom": _provider_config(
                    {
                        "default-model": _provider_model("default-model"),
                        "shared-model": _provider_model("default-shared"),
                    },
                    api_key="default-key",
                    base_url="https://default.example.com/v1",
                ),
            },
            "model_profiles": {
                "default-model": _model_profile(),
                "default-shared": _model_profile(),
            },
        },
    )
    _write_yaml(
        local_config_path,
        {
            "providers": {
                "custom": {
                    "models": {
                        "local-model": _provider_model("${LOCAL_MODEL_NAME}"),
                        "shared-model": _provider_model("local-shared"),
                    },
                },
            },
            "model_profiles": {
                "secret-local-model": _model_profile(max_context_tokens=1000000),
                "local-shared": _model_profile(max_context_tokens=128000),
            },
        },
    )

    config.load_config(str(config_path))

    custom_provider = config.get("providers.custom")
    assert custom_provider["api_key"] == "default-key"
    assert custom_provider["base_url"] == "https://default.example.com/v1"
    assert set(custom_provider["models"].keys()) == {"default-model", "local-model", "shared-model"}
    assert custom_provider["models"]["local-model"]["api_model"] == "secret-local-model"
    assert custom_provider["models"]["shared-model"]["api_model"] == "local-shared"
    assert config.get("model_profiles.secret-local-model.max_context_tokens") == 1000000


def test_load_config_merges_local_default_model(tmp_path):
    config_path = tmp_path / "config.yaml"
    local_config_path = tmp_path / "config.local.yaml"

    _write_yaml(
        config_path,
        {
            "default_model": "default-model",
            "providers": {
                "custom": _provider_config(
                    {
                        "default-model": _provider_model("default-model"),
                        "local-model": _provider_model("local-model"),
                    }
                ),
            },
            "model_profiles": {
                "default-model": _model_profile(),
                "local-model": _model_profile(),
            },
        },
    )
    _write_yaml(
        local_config_path,
        {
            "default_model": "local-model",
        },
    )

    config.load_config(str(config_path))

    assert config.get("default_model") == "local-model"


def test_load_config_ignores_invalid_local_config(tmp_path):
    config_path = tmp_path / "config.yaml"
    local_config_path = tmp_path / "config.local.yaml"

    _write_yaml(
        config_path,
        {
            "providers": {
                "custom": _provider_config(
                    {
                        "default-model": _provider_model("default-model"),
                    }
                ),
            },
            "model_profiles": {
                "default-model": _model_profile(),
            },
        },
    )
    local_config_path.write_text("providers:\n  custom: [broken", encoding="utf-8")

    config.load_config(str(config_path))

    assert set(config.get("providers.custom.models").keys()) == {"default-model"}


@pytest.mark.asyncio
async def test_config_yaml_provider_reads_merged_local_models(tmp_path):
    config_path = tmp_path / "config.yaml"
    local_config_path = tmp_path / "config.local.yaml"

    _write_yaml(
        config_path,
        {
            "providers": {
                "custom": _provider_config({"default-model": _provider_model("default-model")}),
            },
            "model_profiles": {"default-model": _model_profile()},
        },
    )
    _write_yaml(
        local_config_path,
        {
            "providers": {
                "custom": {
                    "models": {
                        "local-model": _provider_model("local-model"),
                    },
                },
            },
            "model_profiles": {"local-model": _model_profile(max_context_tokens=128000)},
        },
    )

    config.load_config(str(config_path))

    models = await ConfigYamlProvider().load()
    by_id = {model.model_id: model for model in models}

    assert set(by_id.keys()) == {"default-model", "local-model"}
    assert by_id["local-model"].name == "local-model"
    assert by_id["local-model"].api_key == "default-key"
    assert by_id["local-model"].provider_source == "config.yaml"


def test_models_route_appends_local_text_models_without_credentials():
    model_config_manager._models = {
        "remote-model": ModelConfig.from_dict(
            "remote-model",
            _model_config("local-remote-model", api_key="secret", api_base_url="https://local.example.com/v1"),
            provider_source="config.yaml",
        ),
        "local-model": ModelConfig.from_dict(
            "local-model",
            _model_config("local-model", api_key="secret", api_base_url="https://local.example.com/v1"),
            provider_source="config.yaml",
        ),
        "local-embedding": ModelConfig.from_dict(
            "local-embedding",
            {
                **_model_config("local-embedding", api_key="secret"),
                "type": "embedding",
            },
            provider_source="config.yaml",
        ),
    }

    remote_models = [
        {
            "id": "remote-model",
            "object": "model",
            "info": {
                "options": {
                    "chat": True,
                    "function_call": True,
                },
            },
        },
        {
            "id": "remote-image",
            "object": "image",
        },
    ]

    models = _append_local_text_models(remote_models)
    by_id = {item["id"]: item for item in models}

    assert list(by_id.keys()) == ["remote-model", "remote-image", "local-model"]
    assert by_id["remote-model"] is remote_models[0]
    assert by_id["local-model"]["object"] == "model"
    assert by_id["local-model"]["info"]["options"]["chat"] is True
    assert by_id["local-model"]["info"]["options"]["function_call"] is True
    assert "api_key" not in str(by_id["local-model"])
    assert "api_base_url" not in str(by_id["local-model"])


def test_model_filter_skips_local_models_without_runtime_credentials():
    missing_api_key = ModelConfig.from_dict(
        "missing-api-key",
        _model_config("missing-api-key", api_key=None),
        provider_source="config.yaml",
    )
    missing_api_base_url = ModelConfig.from_dict(
        "missing-api-base-url",
        _model_config("missing-api-base-url", api_base_url=""),
        provider_source="config.yaml",
    )
    valid_model = ModelConfig.from_dict(
        "valid-model",
        _model_config("valid-model", api_key="mock-key", api_base_url="https://mock.example.com/v1"),
        provider_source="config.yaml",
    )

    assert should_skip_model(missing_api_key) is True
    assert should_skip_model(missing_api_base_url) is True
    assert should_skip_model(valid_model) is False


def test_model_filter_keeps_magic_service_static_model_entries(monkeypatch):
    monkeypatch.setenv("MAGIC_API_BASE_URL", "https://magic.example.com/v1")
    qwen_model = ModelConfig.from_dict(
        "qwen3.7-plus",
        _model_config("qwen3.7-plus", api_base_url="https://magic.example.com/v1"),
        provider_source="config.yaml",
    )

    assert should_skip_model(qwen_model) is False
