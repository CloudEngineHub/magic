"""Canvas 生成参数命令模型。"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.tools.canvas.domain.types import JsonObject


@dataclass(frozen=True)
class GenerationParameters:
    """保存图片和视频生成共同及扩展参数。"""

    prompt: str = ""
    model_id: str | None = None
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
        optional: dict[str, object | None] = {
            "model_id": self.model_id,
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
        return values  # type: ignore[return-value]

    @classmethod
    def from_dict(cls, values: JsonObject) -> "GenerationParameters":
        """从 sidecar 中的稳定 JSON 字段恢复生成参数对象。"""
        tuple_fields = {
            "reference_images",
            "reference_image_paths",
            "reference_video_paths",
            "reference_audio_paths",
        }
        kwargs: dict[str, object] = {}
        for field_name in tuple_fields:
            raw = values.get(field_name, [])
            kwargs[field_name] = tuple(value for value in raw if isinstance(value, str)) if isinstance(raw, list) else ()
        for field_name in (
            "prompt", "model_id", "name", "output_path", "size", "frame_start_path",
            "frame_end_path", "aspect_ratio", "resolution",
        ):
            raw = values.get(field_name)
            if raw is None or isinstance(raw, str):
                kwargs[field_name] = raw
        for field_name in ("duration_seconds", "fps", "seed"):
            raw = values.get(field_name)
            if raw is None or isinstance(raw, int):
                kwargs[field_name] = raw
        watermark = values.get("watermark")
        if watermark is None or isinstance(watermark, bool):
            kwargs["watermark"] = watermark
        extensions = values.get("extensions", {})
        kwargs["extensions"] = extensions if isinstance(extensions, dict) else {}
        return cls(**kwargs)
