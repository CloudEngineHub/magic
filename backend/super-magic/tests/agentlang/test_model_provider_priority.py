from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from agentlang.config.config import config
from agentlang.config.models.model_config import ModelConfig
from agentlang.config.models.model_config_manager import model_config_manager
from agentlang.config.models.provider_interface import ModelProvider
from agentlang.config.models.providers.config_yaml_provider import ConfigYamlProvider


class _StaticProvider(ModelProvider):
    """测试用静态模型 Provider。"""

    def __init__(self, provider_type: str, priority: int, models: list[ModelConfig]) -> None:
        """保存 provider 元信息和待返回模型列表。"""
        self._provider_type = provider_type
        self._priority = priority
        self._models = models

    @property
    def provider_type(self) -> str:
        """返回测试 provider 类型。"""
        return self._provider_type

    @property
    def priority(self) -> int:
        """返回测试 provider 默认优先级。"""
        return self._priority

    async def load(self) -> list[ModelConfig]:
        """返回预设模型列表。"""
        return self._models


def _write_yaml(path, data):
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _provider_config(models, api_key, base_url, priority):
    return {
        "client_type": "openai_chat_completions",
        "base_url": base_url,
        "api_key": api_key,
        "priority": priority,
        "models": models,
    }


def _provider_model(api_model):
    return {
        "api_model": api_model,
        "profile": api_model,
    }


def _model_profile(max_context_tokens):
    return {
        "max_context_tokens": max_context_tokens,
        "max_output_tokens": 4096,
    }


def _model_config(model_id: str, name: str, priority: int, provider_id: str) -> ModelConfig:
    return ModelConfig.from_dict(
        model_id,
        {
            "name": name,
            "provider": provider_id,
            "api_key": f"{provider_id}-key",
            "api_base_url": f"https://{provider_id}.example.com/v1",
            "priority": priority,
            "provider_id": provider_id,
        },
        provider_source=provider_id,
    )


def test_checked_in_config_yaml_uses_default_provider_priorities():
    config_path = Path(__file__).resolve().parents[2] / "config" / "config.yaml"
    config_data = yaml.safe_load(config_path.read_text(encoding="utf-8"))

    providers = config_data.get("providers") or {}

    assert providers
    assert all("priority" not in provider_config for provider_config in providers.values())


@pytest.mark.asyncio
async def test_config_yaml_provider_uses_default_priority_when_provider_omits_priority(tmp_path):
    config_path = tmp_path / "config.yaml"
    _write_yaml(
        config_path,
        {
            "providers": {
                "defaulted": {
                    "client_type": "openai_chat_completions",
                    "base_url": "https://defaulted.example.com/v1",
                    "api_key": "defaulted-key",
                    "models": {
                        "defaulted-model": _provider_model("defaulted-model"),
                    },
                },
            },
            "model_profiles": {
                "defaulted-model": _model_profile(max_context_tokens=8192),
            },
        },
    )

    config.load_config(str(config_path))

    models = await ConfigYamlProvider().load()

    assert len(models) == 1
    assert models[0].provider_id == "defaulted"
    assert models[0].priority == ConfigYamlProvider().priority


@pytest.fixture(autouse=True)
def restore_config_and_model_manager_state():
    """恢复 config 与模型注册表，避免测试间状态污染。"""
    saved_state = {
        "_config": deepcopy(config._config),
        "_raw_config": deepcopy(config._raw_config),
        "_model": config._model,
        "_config_loaded": config._config_loaded,
        "_config_path": config._config_path,
        "_manager_models": deepcopy(model_config_manager._models),
        "_registered_providers": dict(model_config_manager._registered_providers),
        "_loaded_provider_types": set(model_config_manager._loaded_provider_types),
        "_use_counts": dict(model_config_manager._use_counts),
        "_last_loaded_at": dict(model_config_manager._last_loaded_at),
        "_refreshing": set(model_config_manager._refreshing),
    }

    yield

    config._config = saved_state["_config"]
    config._raw_config = saved_state["_raw_config"]
    config._model = saved_state["_model"]
    config._config_loaded = saved_state["_config_loaded"]
    config._config_path = saved_state["_config_path"]
    model_config_manager._models = saved_state["_manager_models"]
    model_config_manager._registered_providers = saved_state["_registered_providers"]
    model_config_manager._loaded_provider_types = saved_state["_loaded_provider_types"]
    model_config_manager._use_counts = saved_state["_use_counts"]
    model_config_manager._last_loaded_at = saved_state["_last_loaded_at"]
    model_config_manager._refreshing = saved_state["_refreshing"]


@pytest.mark.asyncio
async def test_config_yaml_provider_allows_same_model_id_and_model_manager_uses_local_provider_priority(tmp_path):
    config_path = tmp_path / "config.yaml"
    _write_yaml(
        config_path,
        {
            "providers": {
                "low": _provider_config(
                    {"auto": _provider_model("low-auto")},
                    api_key="low-key",
                    base_url="https://low.example.com/v1",
                    priority=10,
                ),
                "high": _provider_config(
                    {"auto": _provider_model("high-auto")},
                    api_key="high-key",
                    base_url="https://high.example.com/v1",
                    priority=30,
                ),
            },
            "model_profiles": {
                "low-auto": _model_profile(max_context_tokens=8192),
                "high-auto": _model_profile(max_context_tokens=200000),
            },
        },
    )

    config.load_config(str(config_path))
    await model_config_manager.initialize([ConfigYamlProvider()])

    model = model_config_manager.get("auto")

    assert model is not None
    assert model.provider == "high"
    assert model.name == "high-auto"
    assert model.api_key == "high-key"
    assert model.priority == 30
    assert model.provider_id == "high"
    assert model.max_context_tokens == 200000


@pytest.mark.asyncio
async def test_model_config_manager_uses_model_priority_before_provider_priority():
    low_provider_high_model = _StaticProvider(
        provider_type="low-provider",
        priority=10,
        models=[_model_config("shared", "high-model", priority=80, provider_id="low-provider")],
    )
    high_provider_low_model = _StaticProvider(
        provider_type="high-provider",
        priority=90,
        models=[_model_config("shared", "low-model", priority=20, provider_id="high-provider")],
    )

    await model_config_manager.initialize([low_provider_high_model, high_provider_low_model])

    model = model_config_manager.get("shared")

    assert model is not None
    assert model.name == "high-model"
    assert model.priority == 80
    assert model.provider_id == "low-provider"
