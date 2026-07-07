"""
Create MagicBase column parameter.
"""

from typing import Any, Dict, Optional

from .magicbase_base_parameter import MagicBaseBaseParameter

MAGICBASE_MYSQL_LIKE_DATA_TYPES = {"text", "number", "datetime", "boolean", "json"}


class CreateMagicBaseColumnParameter(MagicBaseBaseParameter):
    """Parameter for POST /api/v1/magicbase/projects/{projectId}/tables/{tableId}/columns."""

    def __init__(
        self,
        project_id: str,
        table_id: str,
        column_key: str,
        column_name: str,
        data_type: str,
        is_required: bool = False,
        default_value: Any = None,
        dynamic_permission: Optional[Dict[str, Any]] = None,
        authorization: Optional[str] = None,
        organization_code: Optional[str] = None,
    ):
        super().__init__(
            project_id=project_id,
            authorization=authorization,
            organization_code=organization_code,
        )
        self.table_id = str(table_id).strip() if table_id is not None else ""
        self.column_key = column_key.strip() if column_key else ""
        self.column_name = column_name.strip() if column_name else ""
        self.data_type = data_type.strip() if data_type else ""
        self.is_required = is_required
        self.default_value = default_value
        self.dynamic_permission = dynamic_permission

    def to_body(self) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "column_key": self.column_key,
            "column_name": self.column_name,
            "data_type": self.data_type,
            "is_required": self.is_required,
        }
        if self.default_value is not None:
            body["default_value"] = self.default_value
        if self.dynamic_permission is not None:
            body["dynamic_permission"] = self.dynamic_permission
        return body

    def validate(self) -> None:
        super().validate()
        if not self.table_id:
            raise ValueError("table_id is required")
        if not self.table_id.isdigit():
            raise ValueError("table_id must be a numeric string")
        if not self.column_key:
            raise ValueError("column_key is required")
        if not self.column_name:
            raise ValueError("column_name is required")
        if not self.data_type:
            raise ValueError("data_type is required")
        if self.data_type not in MAGICBASE_MYSQL_LIKE_DATA_TYPES:
            allowed = ", ".join(sorted(MAGICBASE_MYSQL_LIKE_DATA_TYPES))
            raise ValueError(f"data_type must be one of: {allowed}")
