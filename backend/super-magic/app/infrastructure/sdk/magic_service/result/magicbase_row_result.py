"""MagicBase row API results."""

from typing import Any, Dict, List

from app.infrastructure.sdk.base import AbstractResult


def normalize_magicbase_row(data: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(data)
    for key in ("id", "record_id"):
        if key in row and row[key] is not None:
            row[key] = str(row[key])
    return row


class MagicBaseRowResult(AbstractResult):
    def _parse_data(self) -> None:
        self.row = normalize_magicbase_row(self._raw_data or {})

    def to_dict(self) -> Dict[str, Any]:
        return self.row


class MagicBaseRowsResult(AbstractResult):
    def _parse_data(self) -> None:
        raw = self._raw_data or {}
        self.page = int(raw.get("page", 1))
        self.page_size = int(raw.get("page_size", 20))
        self.total = int(raw.get("total", 0))
        rows = raw.get("list", [])
        self.rows: List[Dict[str, Any]] = [
            normalize_magicbase_row(row) for row in rows if isinstance(row, dict)
        ]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page": self.page,
            "page_size": self.page_size,
            "total": self.total,
            "rows": self.rows,
        }


class MagicBaseBatchCreateRowsResult(AbstractResult):
    def _parse_data(self) -> None:
        raw = self._raw_data or {}
        self.created_count = int(raw.get("created_count", 0))
        self.record_ids = [str(value) for value in raw.get("record_ids", [])]
        self.rows = [
            normalize_magicbase_row(row)
            for row in raw.get("rows", [])
            if isinstance(row, dict)
        ]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "created_count": self.created_count,
            "record_ids": self.record_ids,
            "rows": self.rows,
        }


class MagicBaseBatchDeleteRowsResult(AbstractResult):
    def _parse_data(self) -> None:
        raw = self._raw_data or {}
        self.deleted_count = int(raw.get("deleted_count", 0))
        self.record_ids = [str(value) for value in raw.get("record_ids", [])]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "deleted_count": self.deleted_count,
            "record_ids": self.record_ids,
        }
