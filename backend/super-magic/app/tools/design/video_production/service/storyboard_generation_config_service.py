"""分镜图片生成配置服务。"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Any, Mapping, Optional

from agentlang.context.tool_context import ToolContext


@dataclass(frozen=True)
class StoryboardGenerationConfig:
    """分镜节点中持久化的图片生成配置。"""

    image_model_id: str
    aspect_ratio: str
    resolution: str
    size: str
    image_generation_config: dict[str, Any] = field(default_factory=dict)

    def to_storage(self) -> dict[str, Any]:
        """转换为前端分镜 Content 使用的图片请求字段结构。"""
        return {
            "model_id": self.image_model_id,
            "size": self.size,
            "resolution": self.resolution,
            "image_generation_config": {
                **self.image_generation_config,
                "aspect_ratio": self.aspect_ratio,
            },
        }

    def to_result_data(self) -> dict[str, str]:
        """转换为工具结果使用的模型友好结构。"""
        return {
            "image_model_id": self.image_model_id,
            "aspect_ratio": self.aspect_ratio,
            "resolution": self.resolution,
            "size": self.size,
        }


class StoryboardGenerationConfigService:
    """负责初始化、读取和校验分镜图片生成配置。"""

    _ASPECT_RATIO_PATTERN = re.compile(r"^[1-9]\d*:[1-9]\d*$")

    @classmethod
    def resolve_for_write(
        cls,
        tool_context: Optional[ToolContext],
        *,
        image_model_id: Optional[str],
        aspect_ratio: str,
        resolution: str,
    ) -> StoryboardGenerationConfig:
        """使用当前图片模型能力补全并校验待写入配置。"""
        model_spec = cls._get_current_image_model(tool_context)
        resolved_model_id = cls._normalize_required(
            image_model_id or (model_spec.model_id if model_spec is not None else None),
            "image_model_id",
        )
        normalized_aspect_ratio = cls._normalize_aspect_ratio(aspect_ratio)
        normalized_resolution = cls._normalize_required(resolution, "resolution")
        size = cls._resolve_size(
            model_spec,
            resolved_model_id,
            normalized_aspect_ratio,
            normalized_resolution,
        )
        return StoryboardGenerationConfig(
            image_model_id=resolved_model_id,
            aspect_ratio=normalized_aspect_ratio,
            resolution=normalized_resolution,
            size=size,
        )

    @classmethod
    def read_from_storyboard(
        cls,
        canvas: Any,
        storyboard_element_id: str,
        tool_context: Optional[ToolContext] = None,
    ) -> StoryboardGenerationConfig:
        """读取分镜当前 Content 中最新的图片生成配置。"""
        element = canvas.get_element(storyboard_element_id)
        if element is None:
            raise ValueError(f"Storyboard Element does not exist: {storyboard_element_id}")
        if element.type != "storyboard":
            raise ValueError(f"Element is not a storyboard: {storyboard_element_id}")
        content = element.get_active_content()
        if content is None:
            raise ValueError(f"Storyboard has no active Content: {storyboard_element_id}")
        raw_config = content.fields.get("generationConfig")
        if not isinstance(raw_config, Mapping):
            raise ValueError(f"Storyboard has no image generation config: {storyboard_element_id}")
        validation_warnings = list(getattr(canvas, "validation_warnings", []))
        storyboard_warnings = [
            warning for warning in validation_warnings
            if content.content_id in warning
        ]
        if storyboard_warnings:
            raise ValueError(
                "Storyboard contains repairable data errors. Fix the existing Storyboard Content "
                "before generating images: " + "; ".join(storyboard_warnings)
            )
        return cls._parse_storage_config(raw_config, tool_context)

    @classmethod
    def parse_optional_storage_config(
        cls,
        raw_config: object,
        tool_context: Optional[ToolContext] = None,
    ) -> Optional[StoryboardGenerationConfig]:
        """解析已有 Content 配置，未配置时返回空。"""
        if not isinstance(raw_config, Mapping):
            return None
        return cls._parse_storage_config(raw_config, tool_context)

    @staticmethod
    def preserve_image_generation_options(
        config: StoryboardGenerationConfig,
        previous: Optional[StoryboardGenerationConfig],
    ) -> StoryboardGenerationConfig:
        """在更新可见参数时保留已有图片模型扩展配置。"""
        if previous is None:
            return config
        return replace(
            config,
            image_generation_config={
                **previous.image_generation_config,
                **config.image_generation_config,
            },
        )

    @classmethod
    def _parse_storage_config(
        cls,
        raw_config: Mapping[str, object],
        tool_context: Optional[ToolContext],
    ) -> StoryboardGenerationConfig:
        """读取前端分镜 Content 中的图片请求字段。"""
        image_model_id = cls._normalize_required(raw_config.get("model_id"), "model_id")
        image_generation_config = raw_config.get("image_generation_config")
        if not isinstance(image_generation_config, Mapping):
            image_generation_config = {}
        aspect_ratio = cls._normalize_aspect_ratio(image_generation_config.get("aspect_ratio"))
        resolution = cls._normalize_required(raw_config.get("resolution"), "resolution")
        size_value = raw_config.get("size")
        if isinstance(size_value, str) and size_value.strip():
            size = size_value.strip()
        else:
            size = cls._resolve_size(
                cls._get_current_image_model(tool_context),
                image_model_id,
                aspect_ratio,
                resolution,
            )
        return StoryboardGenerationConfig(
            image_model_id=image_model_id,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            size=size,
            image_generation_config=dict(image_generation_config),
        )

    @staticmethod
    def _get_current_image_model(tool_context: Optional[ToolContext]) -> Any:
        """读取当前 Agent 已选择的图片模型及尺寸能力。"""
        agent_context = tool_context.get_extension("agent_context") if tool_context else None
        if agent_context is None:
            return None
        return agent_context.model_context.image

    @classmethod
    def _resolve_size(
        cls,
        model_spec: Any,
        image_model_id: str,
        aspect_ratio: str,
        resolution: str,
    ) -> str:
        """把画面比例和分辨率等级解析为模型真实尺寸。"""
        current_model_id = model_spec.model_id if model_spec is not None else None
        if current_model_id != image_model_id:
            raise ValueError(
                "The selected storyboard image model is not the current user image model, "
                "so its supported sizes cannot be resolved."
            )

        normalized_resolution = resolution.casefold()
        available: list[str] = []
        for size_spec in model_spec.sizes:
            label = size_spec.label.strip()
            value = size_spec.value.strip()
            scale = size_spec.scale.strip()
            if label and value:
                display_resolution = scale or value
                available.append(f"{label}/{display_resolution}")
            if label != aspect_ratio or not value:
                continue
            if scale.casefold() == normalized_resolution or value.casefold() == normalized_resolution:
                return value

        available_text = ", ".join(available) or "none"
        raise ValueError(
            f"Unsupported storyboard image size: aspect_ratio={aspect_ratio}, "
            f"resolution={resolution}. Available values: {available_text}."
        )

    @classmethod
    def _normalize_aspect_ratio(cls, value: object) -> str:
        """校验并归一化 W:H 形式的画面比例。"""
        normalized = cls._normalize_required(value, "aspect_ratio")
        if cls._ASPECT_RATIO_PATTERN.fullmatch(normalized) is None:
            raise ValueError("aspect_ratio must use W:H format, for example 9:16")
        return normalized

    @staticmethod
    def _normalize_required(value: object, field_name: str) -> str:
        """把必填字符串归一化为空白安全的值。"""
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field_name} must be a non-empty string")
        return value.strip()
