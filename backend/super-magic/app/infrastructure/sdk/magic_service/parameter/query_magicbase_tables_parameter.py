"""
Query MagicBase tables parameter.
"""

from typing import Optional

from .magicbase_base_parameter import MagicBaseBaseParameter


class QueryMagicBaseTablesParameter(MagicBaseBaseParameter):
    """Parameter for GET /api/v1/magicbase/projects/{projectId}/tables."""

    def __init__(
        self,
        project_id: str,
        authorization: Optional[str] = None,
        organization_code: Optional[str] = None,
    ):
        super().__init__(
            project_id=project_id,
            authorization=authorization,
            organization_code=organization_code,
        )
