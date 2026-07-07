"""
Create MagicBase table parameter.
"""

from typing import Any, Dict, List, Optional

from .magicbase_base_parameter import MagicBaseBaseParameter

MAGICBASE_MYSQL_LIKE_DATA_TYPES = {"text", "number", "datetime", "boolean", "json"}


class CreateMagicBaseTableParameter(MagicBaseBaseParameter):
    """Parameter for POST /api/v1/magicbase/projects/{projectId}/tables."""

    def __init__(
        self,
        project_id: str,
        table_key: str,
        table_name: str,
        columns: List[Dict[str, Any]],
        description: Optional[str] = None,
        project_name: Optional[str] = None,
        dynamic_permissions: Optional[Dict[str, Any]] = None,
        authorization: Optional[str] = None,
        organization_code: Optional[str] = None,
    ):
        super().__init__(
            project_id=project_id,
            authorization=authorization,
            organization_code=organization_code,
        )
        self.table_key = table_key.strip() if table_key else ""
        self.table_name = table_name.strip() if table_name else ""
        self.columns = columns or []
        self.description = description
        self.project_name = project_name
        self.dynamic_permissions = dynamic_permissions

    def to_body(self) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "table_key": self.table_key,
            "table_name": self.table_name,
            "columns": [self._column_to_body(column) for column in self.columns],
        }
        if self.description is not None:
            body["description"] = self.description
        if self.project_name is not None:
            body["project_name"] = self.project_name
        if self.dynamic_permissions is not None:
            body["dynamic_permissions"] = self.dynamic_permissions
        return body

    def validate(self) -> None:
        super().validate()
        if not self.table_key:
            raise ValueError("table_key is required")
        if not self.table_name:
            raise ValueError("table_name is required")
        if not self.columns:
            raise ValueError("columns is required")
        for index, column in enumerate(self.columns):
            if not isinstance(column, dict):
                raise ValueError(f"columns[{index}] must be an object")
            data_type = str(column.get("data_type") or column.get("dataType") or "").strip()
            if data_type not in MAGICBASE_MYSQL_LIKE_DATA_TYPES:
                allowed = ", ".join(sorted(MAGICBASE_MYSQL_LIKE_DATA_TYPES))
                raise ValueError(f"columns[{index}].data_type must be one of: {allowed}")

    @staticmethod
    def _column_to_body(column: Dict[str, Any]) -> Dict[str, Any]:
        return {key: value for key, value in column.items() if key != "options"}
