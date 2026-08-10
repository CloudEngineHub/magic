"""
Update MagicBase table permissions parameter.
"""

from typing import Any, Dict, Optional

from .magicbase_base_parameter import MagicBaseBaseParameter


class UpdateMagicBaseTablePermissionsParameter(MagicBaseBaseParameter):
    """Parameter for PATCH /api/v1/magicbase/projects/{projectId}/tables/{tableId}."""

    def __init__(
        self,
        project_id: str,
        table_id: str,
        dynamic_permissions: Dict[str, Any],
        authorization: Optional[str] = None,
        organization_code: Optional[str] = None,
    ):
        super().__init__(
            project_id=project_id,
            authorization=authorization,
            organization_code=organization_code,
        )
        self.table_id = str(table_id).strip() if table_id is not None else ""
        self.dynamic_permissions = dynamic_permissions

    def to_body(self) -> Dict[str, Any]:
        return {"dynamic_permissions": self.dynamic_permissions}

    def validate(self) -> None:
        super().validate()
        if not self.table_id:
            raise ValueError("table_id is required")
        if not self.table_id.isdigit():
            raise ValueError("table_id must be a numeric string")
        if not isinstance(self.dynamic_permissions, dict):
            raise ValueError("dynamic_permissions must be an object")
