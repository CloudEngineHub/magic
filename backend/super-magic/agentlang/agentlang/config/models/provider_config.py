"""本地模型 Provider 配置。

ProviderConfig 只描述如何调用上游 API；模型能力信息由 ModelProfile 提供。
"""
from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass(frozen=True)
class ProviderModelConfig:
    """Provider 下暴露给系统选择的单个模型入口。"""

    model_id: str
    api_model: str
    profile: str | None = None
    type: str | None = None
    max_context_tokens: int | None = None
    max_output_tokens: int | None = None
    request_defaults: Dict[str, Any] = field(default_factory=dict)
    extra_params: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, model_id: str, raw: Dict[str, Any]) -> "ProviderModelConfig":
        return cls(
            model_id=model_id,
            api_model=_text_or_default(raw.get("api_model"), model_id),
            profile=_text_or_none(raw.get("profile")),
            type=_text_or_none(raw.get("type")),
            max_context_tokens=_int_or_none(raw.get("max_context_tokens"), "max_context_tokens"),
            max_output_tokens=_int_or_none(raw.get("max_output_tokens"), "max_output_tokens"),
            request_defaults=_dict_or_empty(raw.get("request_defaults")),
            extra_params=_dict_or_empty(raw.get("extra_params")),
            metadata=_dict_or_empty(raw.get("metadata")),
        )


@dataclass(frozen=True)
class ProviderConfig:
    """本地 Provider 调用入口配置。"""

    provider_id: str
    client_type: str
    base_url: str
    api_key: str
    models: Dict[str, ProviderModelConfig]
    priority: int = 0
    headers: Dict[str, str] = field(default_factory=dict)
    query_params: Dict[str, str] = field(default_factory=dict)
    request_defaults: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, provider_id: str, raw: Dict[str, Any], default_priority: int = 0) -> "ProviderConfig":
        """从字典解析本地 Provider 调用入口配置。"""
        models_raw = raw.get("models", {})
        if not isinstance(models_raw, dict):
            raise ValueError(f"Provider '{provider_id}' 的 models 必须是字典")

        models: Dict[str, ProviderModelConfig] = {}
        for model_id, model_raw in models_raw.items():
            if not isinstance(model_raw, dict):
                raise ValueError(f"Provider '{provider_id}' 的模型 '{model_id}' 配置必须是字典")
            models[str(model_id)] = ProviderModelConfig.from_dict(str(model_id), model_raw)

        return cls(
            provider_id=provider_id,
            client_type=_text_or_default(raw.get("client_type"), "openai_chat_completions"),
            base_url=_text_or_default(raw.get("base_url"), ""),
            api_key=_text_or_default(raw.get("api_key"), ""),
            models=models,
            priority=_int_or_default(raw.get("priority"), "priority", default_priority),
            headers=_string_map(raw.get("headers")),
            query_params=_string_map(raw.get("query_params")),
            request_defaults=_dict_or_empty(raw.get("request_defaults")),
            metadata=_dict_or_empty(raw.get("metadata")),
        )


def _dict_or_empty(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text_or_default(value: Any, default: str) -> str:
    if value is None:
        return default
    return str(value)


def _text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_none(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = int(text)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} 必须是整数，当前值为 {value!r}") from exc
    if parsed <= 0:
        raise ValueError(f"{field_name} 必须大于 0，当前值为 {value!r}")
    return parsed


def _int_or_default(value: Any, field_name: str, default: int) -> int:
    """把可选整数配置解析为 int，缺省时返回默认值。"""
    parsed = _int_or_none(value, field_name)
    return default if parsed is None else parsed


def _string_map(value: Any) -> Dict[str, str]:
    return {
        str(k): str(v)
        for k, v in _dict_or_empty(value).items()
        if k is not None and v is not None
    }
