from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.core.models.agent_model_selection import AgentModelSelection
from app.core.models.media_model import ImageModelSpec, VideoModelSpec, normalize_model_id

DEFAULT_TEXT_MODEL_ID = "auto"


def _get_config_default_text_model_id() -> str:
    """返回正常模型选择使用的配置默认模型。

    这个函数只处理「请求、会话、Agent 都没有指定文本模型」时的默认入口。
    它不处理运行时缺模型降级；缺模型必须走 `resolve_runtime_model()`，并固定降级到 `auto`
    同时输出 warning，避免 `config.local.yaml` 改变线上 fallback 语义。
    """
    try:
        from agentlang.config.config import config
        configured = normalize_model_id(config.get("default_model", DEFAULT_TEXT_MODEL_ID))
    except Exception:
        configured = None
    return configured or DEFAULT_TEXT_MODEL_ID


@dataclass(frozen=True)
class ModelSelectionInput:
    """模型选择策略的输入参数。

    调用方把请求级模型、会话级模型和 Agent 默认文本模型都整理到这里，
    策略类只负责按优先级选择，不直接读取 AgentContext 或聊天历史。
    """

    configured_text_model_id: Optional[str] = None
    request_text_model_id: Optional[str] = None
    session_text_model_id: Optional[str] = None
    request_image_model: ImageModelSpec = field(default_factory=ImageModelSpec.empty)
    session_image_model: ImageModelSpec = field(default_factory=ImageModelSpec.empty)
    request_video_model: VideoModelSpec = field(default_factory=VideoModelSpec.empty)
    session_video_model: VideoModelSpec = field(default_factory=VideoModelSpec.empty)


class ModelSelectionPolicy:
    """模型选择策略。

    负责统一处理“请求模型 / 会话模型 / Agent 默认模型”的优先级。
    该类只返回模型 ID 和媒体模型能力，不读取 provider 配置，也不创建 LLM client。
    """

    @classmethod
    def resolve(cls, selection_input: ModelSelectionInput) -> AgentModelSelection:
        """根据输入优先级解析本轮最终生效的模型选择结果。"""
        configured_text_model_id = (
            normalize_model_id(selection_input.configured_text_model_id)
            or _get_config_default_text_model_id()
        )

        text_model_id = (
            normalize_model_id(selection_input.request_text_model_id)
            or normalize_model_id(selection_input.session_text_model_id)
            or configured_text_model_id
        )

        image_model = _select_image_model(
            selection_input.request_image_model,
            selection_input.session_image_model,
        )
        video_model = _select_video_model(
            selection_input.request_video_model,
            selection_input.session_video_model,
        )

        return AgentModelSelection(
            configured_text_model_id=configured_text_model_id,
            text_model_id=text_model_id,
            image_model=image_model,
            video_model=video_model,
        )


def _select_image_model(
    request_model: ImageModelSpec,
    session_model: ImageModelSpec,
) -> ImageModelSpec:
    """选择图片模型，并在请求只带模型 ID 时继承会话里的能力配置。"""
    if request_model.has_model:
        return request_model.with_fallback_capability(session_model)
    if session_model.has_model:
        return session_model
    return ImageModelSpec.empty()


def _select_video_model(
    request_model: VideoModelSpec,
    session_model: VideoModelSpec,
) -> VideoModelSpec:
    """选择视频模型，并在请求只带模型 ID 时继承会话里的生成能力配置。"""
    if request_model.has_model:
        return request_model.with_fallback_capability(session_model)
    if session_model.has_model:
        return session_model
    return VideoModelSpec.empty()
