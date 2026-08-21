"""Canvas Content sidecar 元数据与生成重试信息。"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError

RUNTIME_METADATA_KEY = "__canvas_runtime__"
RUNTIME_SIDECAR_FILENAME = "element-details-runtime.json"
PUBLIC_DETAIL_FIELDS = frozenset({"generateImageRequest", "generateVideoRequest", "visualUnderstanding"})


class ContentMetadataService:
    """负责 Content 详情读取、写入和生成尝试演进。"""

    @staticmethod
    def get(metadata: dict, element_id: str, content_id: str) -> dict[str, Any]:
        """读取公共与运行态合并后的 Content 详情，并兼容旧 sidecar。"""
        elements = metadata.get("elements") if isinstance(metadata, dict) else None
        runtime = metadata.get(RUNTIME_METADATA_KEY) if isinstance(metadata, dict) else None
        runtime_elements = runtime.get("elements") if isinstance(runtime, dict) else None
        public_detail = _find_detail(elements, element_id, content_id)
        runtime_detail = _find_detail(runtime_elements, element_id, content_id)
        if public_detail or runtime_detail:
            merged = {**runtime_detail, **public_detail}
            if "generationParameters" not in merged:
                request = public_detail.get("generateImageRequest") or public_detail.get("generateVideoRequest")
                if isinstance(request, dict):
                    merged["generationParameters"] = dict(request)
            return merged
        legacy = metadata.get("contentDetails") if isinstance(metadata, dict) else None
        if isinstance(legacy, dict) and isinstance(legacy.get(content_id), dict):
            return dict(legacy[content_id])
        return {}

    @staticmethod
    def set(metadata: dict, element_id: str, content_id: str, detail: dict[str, Any]) -> None:
        """按线上公共字段与后端运行态分别写入两个 sidecar。"""
        public_detail = {
            key: value for key, value in detail.items()
            if key in PUBLIC_DETAIL_FIELDS and value is not None
        }
        runtime_detail = {
            key: value for key, value in detail.items()
            if key not in PUBLIC_DETAIL_FIELDS
        }
        _set_detail(metadata, element_id, content_id, public_detail, runtime=False)
        _set_detail(metadata, element_id, content_id, runtime_detail, runtime=True)
        legacy = metadata.get("contentDetails")
        if isinstance(legacy, dict):
            legacy.pop(content_id, None)
            if not legacy:
                metadata.pop("contentDetails", None)

    @staticmethod
    def clear_public_request(metadata: dict, element_id: str, content_id: str) -> None:
        """移除公共 sidecar 中指定 Content 的生成请求。"""
        elements = metadata.get("elements") if isinstance(metadata, dict) else None
        if not isinstance(elements, dict):
            return
        element = elements.get(element_id)
        if not isinstance(element, dict):
            return
        details = element.get("contentDetails")
        if not isinstance(details, dict):
            return
        details.pop(content_id, None)
        if not details:
            element.pop("contentDetails", None)
        if not element:
            elements.pop(element_id, None)

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
                "generationParameters": _clean_generation_parameters(data),
            })
        elif data.get("source") == "imported":
            detail["assetPath"] = data.get("assetPath")
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
                "estimate_id",
                "skip_point_estimate",
                "name",
                "reference_image_paths",
                "reference_video_paths",
                "reference_audio_paths",
                "frame_start_path",
                "frame_end_path",
                "input_mode",
                "task",
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
        merged = {**dict(original or {}), **values}
        if merged.get("skip_point_estimate") is True:
            merged.pop("estimate_id", None)
        return merged

    @staticmethod
    def start_retry(
        element_id: str,
        detail: dict[str, Any],
        retry_count: int,
        parameters: dict[str, Any],
        idempotency_key: str,
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
        for key in ("providerTaskId", "generationTaskId", "outputUri", "outputFilename", "errorMessage"):
            updated.pop(key, None)
        updated.update({
            "elementId": element_id,
            "source": "generated",
            "retryCount": retry_count,
            "generationStatus": "pending",
            "generationParameters": _clean_generation_parameters(parameters),
            "attemptHistory": history,
            "retryIdempotencyKey": idempotency_key,
        })
        return updated

    @staticmethod
    def retry_idempotency_key(
        item_ref: str,
        element_id: str,
        content_id: str,
        parameters: dict[str, Any],
    ) -> str:
        """根据一次明确的重试请求生成稳定幂等键。

        item_ref 参与幂等键只用于识别同一次请求的重放；它不会影响 retryCount，
        因此更换 item_ref 仍然必须经过统一的重试上限校验。
        """
        payload = {
            "item_ref": item_ref,
            "element_id": element_id,
            "content_id": content_id,
            "parameters": parameters,
        }
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @staticmethod
    def split_legacy_metadata(public: dict[str, Any], runtime: dict[str, Any]) -> None:
        """把旧版混合详情拆成线上公共 sidecar和运行态 sidecar。"""
        elements = public.get("elements") if isinstance(public, dict) else None
        if not isinstance(elements, dict):
            public.setdefault("version", "2.0.0")
            public.setdefault("elements", {})
            return
        runtime.setdefault("version", "1.0.0")
        runtime_elements = runtime.setdefault("elements", {})
        for element_id, raw_element in list(elements.items()):
            if not isinstance(raw_element, dict):
                elements.pop(element_id, None)
                continue
            details = raw_element.get("contentDetails")
            if not isinstance(details, dict):
                elements.pop(element_id, None)
                continue
            for content_id, detail in list(details.items()):
                if not isinstance(detail, dict):
                    details.pop(content_id, None)
                    continue
                public_detail = {
                    key: value for key, value in detail.items()
                    if key in PUBLIC_DETAIL_FIELDS and value is not None
                }
                runtime_detail = {
                    key: value for key, value in detail.items()
                    if key not in PUBLIC_DETAIL_FIELDS
                }
                if public_detail:
                    details[content_id] = public_detail
                else:
                    details.pop(content_id, None)
                if runtime_detail:
                    runtime_element = runtime_elements.setdefault(element_id, {})
                    runtime_details = runtime_element.setdefault("contentDetails", {})
                    existing = runtime_details.get(content_id, {})
                    runtime_details[content_id] = {**runtime_detail, **existing}
            if not details:
                elements.pop(element_id, None)
        public["version"] = "2.0.0"
        runtime["version"] = "1.0.0"

    @staticmethod
    def build_public_generation_request(
        parameters: dict[str, Any],
        element_type: str,
    ) -> dict[str, Any]:
        """按 Design sidecar 协议生成公共生成请求。"""
        request: dict[str, Any] = {
            "prompt": str(parameters.get("prompt") or ""),
        }
        for key in ("size", "image_id", "mode", "start_time", "end_time", "duration_ms", "model_id"):
            value = parameters.get(key)
            if value is not None:
                request[key] = value
        if element_type == "image":
            references = parameters.get("reference_images")
            if isinstance(references, (list, tuple)) and references:
                request["reference_images"] = [
                    _normalize_project_path(path)
                    for path in references
                    if isinstance(path, str) and path
                ]
        else:
            for key in (
                "reference_image_paths", "reference_video_paths", "reference_audio_paths",
                "frame_start_path", "frame_end_path", "input_mode", "task", "duration_seconds",
                "aspect_ratio", "resolution", "fps", "seed", "watermark", "extensions",
            ):
                value = parameters.get(key)
                if value not in (None, [], {}):
                    request[key] = value
        return request


def _find_detail(elements: Any, element_id: str, content_id: str) -> dict[str, Any]:
    """从 Element/Content 文档中读取一条详情。"""
    if not isinstance(elements, dict):
        return {}
    element = elements.get(element_id)
    details = element.get("contentDetails") if isinstance(element, dict) else None
    detail = details.get(content_id) if isinstance(details, dict) else None
    return dict(detail) if isinstance(detail, dict) else {}


def _set_detail(metadata: dict, element_id: str, content_id: str, detail: dict[str, Any], *, runtime: bool) -> None:
    """写入公共或运行态文档中的 Content 详情。"""
    if not detail:
        return
    target = metadata.setdefault(RUNTIME_METADATA_KEY, {}) if runtime else metadata
    target.setdefault("version", "1.0.0" if runtime else "2.0.0")
    elements = target.setdefault("elements", {})
    element = elements.setdefault(element_id, {})
    element.setdefault("contentDetails", {})[content_id] = dict(detail)


def _clean_generation_parameters(data: dict[str, Any]) -> dict[str, Any]:
    """移除来源和协议包装字段，保留重试所需的生成输入。"""
    nested = data.get("generationParameters")
    if isinstance(nested, dict):
        data = nested
    return {
        key: value for key, value in data.items()
        if key not in {"source", "contentType", "assetPath"} and value is not None
    }


def _normalize_project_path(value: str) -> str:
    """将 Canvas 项目相对路径规范为 ./ 开头。"""
    normalized = value.replace("\\", "/")
    if normalized.startswith("./") or "://" in normalized or normalized.startswith("data:"):
        return normalized
    return f"./{normalized.lstrip('/')}"
