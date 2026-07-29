"""记忆 AI Ability 配置测试。"""

from app.core import ai_abilities
from app.core.ai_abilities import AIAbility
from app.core.ai_ability_configs.registry import create_ai_ability_config


def test_memory_model_uses_memory_ai_ability(monkeypatch) -> None:
    """记忆提取模型应通过统一 MEMORY 能力读取配置。"""
    captured: dict[str, object] = {}

    def _get_ability_config(ability: AIAbility, key: str, default: object = None) -> object:
        """记录能力配置读取参数并返回模拟模型。"""
        captured.update(ability=ability, key=key, default=default)
        return "mock-memory-model"

    monkeypatch.setattr(ai_abilities, "get_ability_config", _get_ability_config)

    assert ai_abilities.get_memory_model_id() == "mock-memory-model"
    assert captured == {
        "ability": AIAbility.MEMORY,
        "key": "model_id",
        "default": "qwen3.5-flash",
    }


def test_memory_ai_ability_runtime_config_is_registered() -> None:
    """运行时配置注册表应能解析 memory 能力。"""
    ability_config = create_ai_ability_config(
        ability_key="memory",
        config_dict={"model_id": "mock-memory-model"},
        provider_source="mock-provider",
        priority=1,
    )

    assert ability_config is not None
    assert ability_config.ability_key == "memory"
    assert ability_config.get("model_id") == "mock-memory-model"
