"""Agent 运行时模型解析。

本模块只负责把外部传入或继承得到的 model_id 解析成一次 LLM 调用真正使用的模型配置。
fallback 目标固定为 auto，避免调用阶段再次悄悄切到其它模型。
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Optional

from agentlang.llms.factory import LLMClientConfig, LLMFactory

AUTO_MODEL_ID = "auto"


class ModelSource(StrEnum):
    """运行时模型来源。"""

    REQUEST = "request"
    SESSION = "session"
    PARENT = "parent"
    CRON = "cron"
    COMPACT = "compact"
    UNKNOWN = "unknown"


class RuntimeModelResolveError(RuntimeError):
    """运行时模型无法解析。"""


@dataclass(frozen=True)
class RuntimeModelInfo:
    """一次 Agent LLM 调用实际使用的模型信息。"""

    source: ModelSource
    input_model_id: Optional[str]
    model_id: str
    provider_model: str
    routed_model_id: Optional[str]
    max_context_tokens: int
    max_output_tokens: int
    supports_tool_use: bool
    config: LLMClientConfig
    fallback_applied: bool = False
    fallback_reason: Optional[str] = None


def resolve_runtime_model(
    model_id: Optional[str],
    source: ModelSource = ModelSource.UNKNOWN,
) -> RuntimeModelInfo:
    """解析运行时模型。

    Args:
        model_id: 外部传入或继承得到的模型 ID。为空时使用 auto。
        source: 模型 ID 来源，仅用于诊断日志。

    Returns:
        RuntimeModelInfo: 已解析的运行时模型信息。

    Raises:
        RuntimeModelResolveError: 目标模型和 auto 均不可用。
    """
    input_model_id = model_id.strip() if isinstance(model_id, str) and model_id.strip() else None
    runtime_model_id = input_model_id or AUTO_MODEL_ID
    fallback_applied = input_model_id is None
    fallback_reason = "未传入模型" if input_model_id is None else None

    try:
        config = LLMFactory.get_model_config(
            runtime_model_id,
            expected_type="llm",
            allow_fallback=False,
        )
    except Exception as original_error:
        if runtime_model_id == AUTO_MODEL_ID:
            raise RuntimeModelResolveError("auto 模型配置不可用，无法调用 LLM") from original_error

        try:
            config = LLMFactory.get_model_config(
                AUTO_MODEL_ID,
                expected_type="llm",
                allow_fallback=False,
            )
        except Exception as auto_error:
            raise RuntimeModelResolveError("auto 模型配置不可用，无法调用 LLM") from auto_error

        runtime_model_id = AUTO_MODEL_ID
        fallback_applied = True
        fallback_reason = f"模型不存在:{input_model_id}"

    return RuntimeModelInfo(
        source=source,
        input_model_id=input_model_id,
        model_id=config.model_id,
        provider_model=config.name,
        routed_model_id=config.resolved_model_id or None,
        max_context_tokens=config.max_context_tokens,
        max_output_tokens=config.max_output_tokens,
        supports_tool_use=config.supports_tool_use,
        config=config,
        fallback_applied=fallback_applied,
        fallback_reason=fallback_reason,
    )
