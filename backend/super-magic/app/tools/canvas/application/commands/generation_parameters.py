"""Canvas 生成参数命令模型。"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.tools.canvas.domain.types import JsonObject, JsonValue


@dataclass(frozen=True)
class GenerationParameters:
    """保存图片和视频生成共同及扩展参数。"""

    prompt: str = ""
    model_id: str | None = None
    estimate_id: str | None = None
    name: str | None = None
    output_path: str | None = None
    size: str | None = None
    reference_images: tuple[str, ...] = ()
    reference_image_paths: tuple[str, ...] = ()
    reference_video_paths: tuple[str, ...] = ()
    reference_audio_paths: tuple[str, ...] = ()
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    duration_seconds: int | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = None
    seed: int | None = None
    watermark: bool | None = None
    extensions: JsonObject = field(default_factory=dict)

    def to_dict(self) -> JsonObject:
        """转换为 sidecar 和调试日志使用的 JSON 对象。"""
        values: JsonObject = {
            "prompt": self.prompt,
            "reference_images": list(self.reference_images),
            "reference_image_paths": list(self.reference_image_paths),
            "reference_video_paths": list(self.reference_video_paths),
            "reference_audio_paths": list(self.reference_audio_paths),
            "extensions": dict(self.extensions),
        }
        optional: dict[str, JsonValue | None] = {
            "model_id": self.model_id,
            "estimate_id": self.estimate_id,
            "name": self.name,
            "output_path": self.output_path,
            "size": self.size,
            "frame_start_path": self.frame_start_path,
            "frame_end_path": self.frame_end_path,
            "duration_seconds": self.duration_seconds,
            "aspect_ratio": self.aspect_ratio,
            "resolution": self.resolution,
            "fps": self.fps,
            "seed": self.seed,
            "watermark": self.watermark,
        }
        values.update({key: value for key, value in optional.items() if value is not None})
        return values

    @classmethod
    def from_dict(cls, values: JsonObject) -> "GenerationParameters":
        """从 sidecar 中的稳定 JSON 字段恢复生成参数对象。"""
        return cls(
            prompt=_optional_string(values, "prompt") or "",
            model_id=_optional_string(values, "model_id"),
            estimate_id=_optional_string(values, "estimate_id"),
            name=_optional_string(values, "name"),
            output_path=_optional_string(values, "output_path"),
            size=_optional_string(values, "size"),
            reference_images=_string_tuple(values, "reference_images"),
            reference_image_paths=_string_tuple(values, "reference_image_paths"),
            reference_video_paths=_string_tuple(values, "reference_video_paths"),
            reference_audio_paths=_string_tuple(values, "reference_audio_paths"),
            frame_start_path=_optional_string(values, "frame_start_path"),
            frame_end_path=_optional_string(values, "frame_end_path"),
            duration_seconds=_optional_integer(values, "duration_seconds"),
            aspect_ratio=_optional_string(values, "aspect_ratio"),
            resolution=_optional_string(values, "resolution"),
            fps=_optional_integer(values, "fps"),
            seed=_optional_integer(values, "seed"),
            watermark=_optional_boolean(values, "watermark"),
            extensions=_optional_object(values, "extensions"),
        )


def _optional_string(values: JsonObject, key: str) -> str | None:
    """读取可选字符串字段。"""
    value = values.get(key)
    return value if isinstance(value, str) else None


def _optional_integer(values: JsonObject, key: str) -> int | None:
    """读取可选整数，并拒绝布尔值。"""
    value = values.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _optional_boolean(values: JsonObject, key: str) -> bool | None:
    """读取可选布尔字段。"""
    value = values.get(key)
    return value if isinstance(value, bool) else None


def _string_tuple(values: JsonObject, key: str) -> tuple[str, ...]:
    """读取字符串数组并转换为不可变参数集合。"""
    value = values.get(key)
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))


def _optional_object(values: JsonObject, key: str) -> JsonObject:
    """读取可选扩展对象；非对象值按空对象处理。"""
    value = values.get(key)
    return dict(value) if isinstance(value, dict) else {}
