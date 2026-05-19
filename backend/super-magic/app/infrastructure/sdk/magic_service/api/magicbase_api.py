"""
MagicBase API.

API wrapper for MagicBase endpoints hosted by Magic Service.
"""

from ..kernel.magic_service_api import MagicServiceAbstractApi
from ..parameter.create_magicbase_column_parameter import CreateMagicBaseColumnParameter
from ..parameter.create_magicbase_table_parameter import CreateMagicBaseTableParameter
from ..parameter.get_magicbase_table_parameter import GetMagicBaseTableParameter
from ..parameter.query_magicbase_tables_parameter import QueryMagicBaseTablesParameter
from ..result.magicbase_column_result import MagicBaseColumnResult
from ..result.magicbase_table_result import MagicBaseTableResult, MagicBaseTablesResult


class MagicBaseApi(MagicServiceAbstractApi):
    """MagicBase API for Magic Service."""

    async def query_tables_async(self, parameter: QueryMagicBaseTablesParameter) -> MagicBaseTablesResult:
        """List MagicBase tables for a project."""
        endpoint_path = f"/api/v1/magicbase/projects/{parameter.project_id}/tables"
        data = await self.request_by_parameter_async(parameter, "GET", endpoint_path)
        return MagicBaseTablesResult(data)

    async def get_table_async(self, parameter: GetMagicBaseTableParameter) -> MagicBaseTableResult:
        """Get one MagicBase table by its real table id."""
        endpoint_path = f"/api/v1/magicbase/projects/{parameter.project_id}/tables/{parameter.table_id}"
        data = await self.request_by_parameter_async(parameter, "GET", endpoint_path)
        return MagicBaseTableResult(data)

    async def create_table_async(self, parameter: CreateMagicBaseTableParameter) -> MagicBaseTableResult:
        """Create a MagicBase table in a project."""
        endpoint_path = f"/api/v1/magicbase/projects/{parameter.project_id}/tables"
        data = await self.request_by_parameter_async(parameter, "POST", endpoint_path)
        return MagicBaseTableResult(data)

    async def create_column_async(self, parameter: CreateMagicBaseColumnParameter) -> MagicBaseColumnResult:
        """Create a MagicBase column in an existing table."""
        endpoint_path = f"/api/v1/magicbase/projects/{parameter.project_id}/tables/{parameter.table_id}/columns"
        data = await self.request_by_parameter_async(parameter, "POST", endpoint_path)
        return MagicBaseColumnResult(data)
