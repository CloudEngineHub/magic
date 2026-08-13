"""
MagicBase column result.
"""

from typing import Any, Dict

from app.infrastructure.sdk.base import AbstractResult


def _pick(data: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in data:
            return data[key]
    return default


def normalize_magicbase_column(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize MagicBase column fields from camelCase or snake_case."""
    return {
        "column_id": str(_pick(data, "id", "column_id", "columnId", default="")),
        "column_key": _pick(data, "column_key", "columnKey", default=""),
        "column_name": _pick(data, "column_name", "columnName", default=""),
        "data_type": _pick(data, "data_type", "dataType", default=""),
        "is_required": bool(_pick(data, "is_required", "isRequired", default=False)),
        "default_value": _pick(data, "default_value", "defaultValue"),
        "raw": data,
    }


class MagicBaseColumnResult(AbstractResult):
    """Result for MagicBase column responses."""

    def _parse_data(self) -> None:
        self.column = normalize_magicbase_column(self._raw_data or {})
        self.column_id = self.column["column_id"]
        self.column_key = self.column["column_key"]
        self.column_name = self.column["column_name"]
        self.data_type = self.column["data_type"]

    def to_dict(self) -> Dict[str, Any]:
        return self.column

    def __str__(self) -> str:
        return f"MagicBaseColumnResult(column_id={self.column_id}, column_key={self.column_key})"
