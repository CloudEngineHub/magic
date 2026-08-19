"""Canvas Content sidecar 元数据与生成重试信息。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError


class ContentMetadataService:
    """负责 Content 详情读取、写入和生成尝试演进。"""

    @staticmethod
    def get(metadata: dict, element_id: str, content_id: str) -> dict[str, Any]:
        """读取 Content 级详情，并兼容早期顶层结构。"""
        elements = metadata.get("elements") if isinstance(metadata, dict) else None
        if isinstance(elements, dict):
            element = elements.get(element_id)
            if isinstance(element, dict):
                details = element.get("contentDetails")
                if isinstance(details, dict) and isinstance(details.get(content_id), dict):
                    return dict(details[content_id])
        legacy = metadata.get("contentDetails") if isinstance(metadata, dict) else None
        if isinstance(legacy, dict) and isinstance(legacy.get(content_id), dict):
            return dict(legacy[content_id])
        return {}

    @staticmethod
    def set(metadata: dict, element_id: str, content_id: str, detail: dict[str, Any]) -> None:
        """按 Element 到 Content 的标准结构写入内部详情。"""
        metadata.setdefault("version", "2.0.0")
        elements = metadata.setdefault("elements", {})
        element = elements.setdefault(element_id, {})
        element.setdefault("contentDetails", {})[content_id] = detail
        legacy = metadata.get("contentDetails")
        if isinstance(legacy, dict):
            legacy.pop(content_id, None)
            if not legacy:
                metadata.pop("contentDetails", None)

    @staticmethod
    def new_detail(element_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """创建不进入主协议的来源和生成尝试详情。"""
        detail: dict[str, Any] = {
            "elementId": element_id,
            "source": data.get("source", "user"),
        }
        if data.get("source") == "generated":
            detail.update({
                "retryCount": 0,
                "generationStatus": "pending",
                "generationParameters": dict(data),
            })
        elif data.get("source") == "imported":
            detail["assetPath"] = data.get("src")
        return detail

    @staticmethod
    def merge_generation_override(
        element_type: str,
        original: dict[str, Any],
        override: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """只允许覆盖指定生成能力公开的输入字段。"""
        allowed = {
            "image": {"prompt", "size", "model_id", "name", "reference_images"},
            "video": {
                "prompt",
                "model_id",
                "name",
                "reference_image_paths",
                "reference_video_paths",
                "reference_audio_paths",
                "frame_start_path",
                "frame_end_path",
                "size",
                "duration_seconds",
                "aspect_ratio",
                "resolution",
                "fps",
                "seed",
                "watermark",
                "extensions",
            },
        }.get(element_type)
        if allowed is None:
            raise CanvasDomainError(
                "GENERATION_NOT_CONFIGURED",
                f"No retry capability is configured for {element_type}.",
            )
        values = dict(override or {})
        unexpected = set(values) - allowed
        if unexpected:
            raise CanvasDomainError(
                "CONTENT_FIELD_MANAGED_INTERNAL",
                f"Generation override contains unsupported fields: {', '.join(sorted(unexpected))}.",
            )
        return {**dict(original or {}), **values}

    @staticmethod
    def start_retry(
        element_id: str,
        detail: dict[str, Any],
        retry_count: int,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        """归档上一终态并创建不复用旧任务绑定的新尝试。"""
        updated = dict(detail)
        history = list(updated.get("attemptHistory") or [])
        if updated.get("generationStatus") in {"completed", "failed"}:
            history.append({
                "generationTaskId": updated.get("generationTaskId"),
                "generationStatus": updated.get("generationStatus"),
                "outputUri": updated.get("outputUri"),
                "errorMessage": updated.get("errorMessage"),
            })
        for key in ("providerTaskId", "generationTaskId", "outputUri", "errorMessage"):
            updated.pop(key, None)
        updated.update({
            "elementId": element_id,
            "source": "generated",
            "retryCount": retry_count,
            "generationStatus": "pending",
            "generationParameters": parameters,
            "attemptHistory": history,
        })
        return updated
