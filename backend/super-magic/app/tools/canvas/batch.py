"""Canvas 原子批量请求的关联标识与错误映射。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.domain.errors import CanvasBatchError, CanvasDomainError


class AtomicBatchGuard:
    """统一校验 item_ref，并生成逐项失败结果。"""

    @staticmethod
    def validate_item_refs(items: list[dict[str, Any]]) -> None:
        """保证同一批次的关联标签非空且唯一。"""
        refs = [str(item.get("item_ref") or "") for item in items]
        if any(not item_ref for item_ref in refs) or len(refs) != len(set(refs)):
            raise CanvasDomainError(
                "ITEM_REF_INVALID",
                "item_ref values must be non-empty and unique within a batch.",
            )

    @staticmethod
    def map_error(
        items: list[dict[str, Any]],
        failed_item_ref: str | None,
        error: CanvasDomainError,
    ) -> CanvasDomainError:
        """多项批次返回逐项状态，单项保留原业务错误码。"""
        if len(items) == 1:
            return error
        results: list[dict[str, Any]] = []
        for item in items:
            item_ref = str(item.get("item_ref") or "-")
            if item_ref == failed_item_ref:
                results.append({
                    "item_ref": item_ref,
                    "status": "failed",
                    "error_code": error.code,
                    "reason": error.message,
                })
            else:
                results.append({
                    "item_ref": item_ref,
                    "status": "not_applied",
                    "error_code": "BATCH_VALIDATION_FAILED",
                    "reason": "The atomic batch was not written because another item failed validation.",
                })
        return CanvasBatchError(results)
