"""
MagicBase table results.
"""

from typing import Any, Dict, List

from app.infrastructure.sdk.base import AbstractResult

from .magicbase_column_result import normalize_magicbase_column


def _pick(data: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in data:
            return data[key]
    return default


def _extract_items(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("items", "list", "tables", "records", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def normalize_magicbase_table(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize MagicBase table fields from camelCase or snake_case."""
    raw_columns = _pick(data, "columns", "fields", default=[])
    columns = [
        normalize_magicbase_column(column)
        for column in raw_columns
        if isinstance(column, dict)
    ]
    return {
        "table_id": str(_pick(data, "id", "table_id", "tableId", default="")),
        "project_id": str(_pick(data, "project_id", "projectId", default="")),
        "table_key": _pick(data, "table_key", "tableKey", default=""),
        "table_name": _pick(data, "table_name", "tableName", default=""),
        "description": _pick(data, "description", default=""),
        "status": _pick(data, "status", default=""),
        "columns": columns,
        "raw": data,
    }


class MagicBaseTableResult(AbstractResult):
    """Result for one MagicBase table."""

    def _parse_data(self) -> None:
        self.table = normalize_magicbase_table(self._raw_data or {})
        self.table_id = self.table["table_id"]
        self.table_key = self.table["table_key"]
        self.table_name = self.table["table_name"]
        self.columns = self.table["columns"]

    def to_dict(self) -> Dict[str, Any]:
        return self.table

    def __str__(self) -> str:
        return f"MagicBaseTableResult(table_id={self.table_id}, table_key={self.table_key})"


class MagicBaseTablesResult(AbstractResult):
    """Result for a MagicBase table list."""

    def _parse_data(self) -> None:
        self.tables = [normalize_magicbase_table(item) for item in _extract_items(self._raw_data)]

    def to_dict(self) -> Dict[str, Any]:
        return {"tables": self.tables}

    def __str__(self) -> str:
        return f"MagicBaseTablesResult(count={len(self.tables)})"
