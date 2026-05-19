from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.kernel.magic_service_exception import MagicServiceException
from app.infrastructure.sdk.magic_service.parameter import (
    CreateMagicBaseColumnParameter,
    CreateMagicBaseTableParameter,
    GetMagicBaseTableParameter,
    QueryMagicBaseTablesParameter,
)
from app.tools.core import BaseTool, BaseToolParams, tool
from app.utils.init_client_message_util import InitClientMessageUtil


def _get_project_id() -> str:
    try:
        metadata = InitClientMessageUtil.get_metadata()
    except Exception:
        return ""
    return str(metadata.get("project_id") or "").strip()


def _column_labels(columns: List[Dict[str, Any]]) -> str:
    labels = []
    for column in columns:
        key = column.get("column_key") or column.get("columnKey") or ""
        data_type = column.get("data_type") or column.get("dataType") or ""
        if key and data_type:
            labels.append(f"{key} ({data_type})")
        elif key:
            labels.append(key)
    return ", ".join(labels) if labels else "no columns"


def _table_summary(table: Dict[str, Any]) -> str:
    table_id = table.get("table_id") or ""
    table_key = table.get("table_key") or ""
    table_name = table.get("table_name") or ""
    columns = table.get("columns") or []
    return (
        f"table_id={table_id}, table_key={table_key}, table_name={table_name}, "
        f"columns=[{_column_labels(columns)}]"
    )


class MagicbaseColumnDefinition(BaseModel):
    column_key: str = Field(
        description="""<!--zh: 字段唯一 key，必须稳定，建议用英文小写加下划线。-->
Stable unique column key. Use lowercase English with underscores when possible."""
    )
    column_name: str = Field(
        description="""<!--zh: 展示给用户看的字段名。-->
Human-readable column name shown to users."""
    )
    data_type: str = Field(
        description="""<!--zh: 字段类型。必须使用 MagicBase 支持的枚举值。-->
Column data type. Must be one of: text, number, datetime, boolean, single_select, multi_select, user, department, attachment, json, reference."""
    )
    is_required: bool = Field(
        default=False,
        description="""<!--zh: 是否必填。-->
Whether this column is required."""
    )
    default_value: Any = Field(
        default=None,
        description="""<!--zh: 默认值，不需要默认值时留空。-->
Default value. Leave empty when no default is needed."""
    )
    options: Any = Field(
        default=None,
        description="""<!--zh: single_select、multi_select 等类型需要的选项配置。-->
Options for types such as single_select and multi_select. The shape depends on MagicBase; omit it when not needed."""
    )
    dynamic_permission: Optional[Dict[str, Any]] = Field(
        default=None,
        description="""<!--zh: 字段动态权限配置，可选。-->
Optional dynamic permission config, for example {"read_scope": "public", "edit_scope": "public"}."""
    )

    def to_body(self) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "column_key": self.column_key,
            "column_name": self.column_name,
            "data_type": self.data_type,
            "is_required": self.is_required,
        }
        if self.default_value is not None:
            body["default_value"] = self.default_value
        if self.options is not None:
            body["options"] = self.options
        if self.dynamic_permission is not None:
            body["dynamic_permission"] = self.dynamic_permission
        return body


class QueryMagicbaseTablesParams(BaseToolParams):
    table_key: Optional[str] = Field(
        default=None,
        description="""<!--zh: 可选。按 table_key 精确过滤结果。-->
Optional exact table_key filter."""
    )
    table_name: Optional[str] = Field(
        default=None,
        description="""<!--zh: 可选。按 table_name 精确过滤结果。-->
Optional exact table_name filter."""
    )


@tool(name="query_magicbase_tables")
class QueryMagicTables(BaseTool[QueryMagicbaseTablesParams]):
    """<!--zh
    查询当前项目的 MagicBase 表。

    project_id 自动来自当前会话 metadata，模型不要填写 project_id。
    -->
    List MagicBase tables for the current project.

    The project_id is loaded from current session metadata automatically. Do not ask the user for project_id.
    """
    name = "query_magicbase_tables"

    async def execute(self, tool_context: ToolContext, params: QueryMagicbaseTablesParams) -> ToolResult:
        project_id = _get_project_id()
        if not project_id:
            return ToolResult.error("Project ID is not available in the current session. Cannot query MagicBase tables.")

        try:
            result = await get_magic_service_sdk().magicbase.query_tables_async(
                QueryMagicBaseTablesParameter(project_id=project_id)
            )
        except (MagicServiceException, ValueError) as e:
            return ToolResult.error(f"Failed to query MagicBase tables: {e}")

        tables = result.to_dict().get("tables", [])
        if params.table_key:
            tables = [table for table in tables if table.get("table_key") == params.table_key]
        if params.table_name:
            tables = [table for table in tables if table.get("table_name") == params.table_name]

        if not tables:
            return ToolResult(
                content="No MagicBase tables matched the current query.",
                data={"project_id": project_id, "tables": []},
            )

        summaries = "; ".join(_table_summary(table) for table in tables)
        content = f"Found {len(tables)} MagicBase table(s). {summaries}."
        return ToolResult(content=content, data={"project_id": project_id, "tables": tables})


class GetMagicbaseTableParams(BaseToolParams):
    table_id: str = Field(
        description="""<!--zh: MagicBase 返回的真实 table.id，不是 table_key 或 table_name。-->
Real MagicBase table.id returned by MagicBase tools. Do not pass table_key or table_name."""
    )


@tool(name="get_magicbase_table")
class GetMagicTable(BaseTool[GetMagicbaseTableParams]):
    """<!--zh
    根据真实 table.id 获取当前项目的 MagicBase 表详情。
    -->
    Get a MagicBase table by its real table.id in the current project.
    """
    name = "get_magicbase_table"

    async def execute(self, tool_context: ToolContext, params: GetMagicbaseTableParams) -> ToolResult:
        project_id = _get_project_id()
        if not project_id:
            return ToolResult.error("Project ID is not available in the current session. Cannot get MagicBase table.")

        try:
            result = await get_magic_service_sdk().magicbase.get_table_async(
                GetMagicBaseTableParameter(project_id=project_id, table_id=params.table_id)
            )
        except (MagicServiceException, ValueError) as e:
            return ToolResult.error(f"Failed to get MagicBase table: {e}")

        table = result.to_dict()
        content = f"MagicBase table loaded. {_table_summary(table)}."
        return ToolResult(content=content, data={"project_id": project_id, "table": table})


class CreateMagicbaseTableParams(BaseToolParams):
    table_key: str = Field(
        description="""<!--zh: 表唯一 key，必须稳定，建议用英文小写加下划线。-->
Stable unique table key. Use lowercase English with underscores when possible."""
    )
    table_name: str = Field(
        description="""<!--zh: 展示给用户看的表名。-->
Human-readable table name shown to users."""
    )
    columns: List[MagicbaseColumnDefinition] = Field(
        description="""<!--zh: 建表时同时创建的字段列表。-->
Columns to create with the table."""
    )
    description: Optional[str] = Field(
        default=None,
        description="""<!--zh: 表说明，可选。-->
Optional table description."""
    )
    project_name: Optional[str] = Field(
        default=None,
        description="""<!--zh: 项目名称，可选。-->
Optional project name for MagicBase."""
    )
    dynamic_permissions: Optional[Dict[str, Any]] = Field(
        default=None,
        description="""<!--zh: 表、行、列动态权限配置，可选；省略时 MagicBase 默认 public。-->
Optional table, row, and column dynamic permissions. Omit to use MagicBase public defaults."""
    )


@tool(name="create_magicbase_table")
class CreateMagicTable(BaseTool[CreateMagicbaseTableParams]):
    """<!--zh
    在当前项目创建 MagicBase 表，并返回真实 table.id。

    project_id 自动来自当前会话 metadata，模型不要填写 project_id。
    -->
    Create a MagicBase table in the current project and return the real table.id.

    The project_id is loaded from current session metadata automatically. Do not ask the user for project_id.
    """
    name = "create_magicbase_table"

    async def execute(self, tool_context: ToolContext, params: CreateMagicbaseTableParams) -> ToolResult:
        project_id = _get_project_id()
        if not project_id:
            return ToolResult.error("Project ID is not available in the current session. Cannot create MagicBase table.")

        columns = [column.to_body() for column in params.columns]
        try:
            result = await get_magic_service_sdk().magicbase.create_table_async(
                CreateMagicBaseTableParameter(
                    project_id=project_id,
                    table_key=params.table_key,
                    table_name=params.table_name,
                    columns=columns,
                    description=params.description,
                    project_name=params.project_name,
                    dynamic_permissions=params.dynamic_permissions,
                )
            )
        except (MagicServiceException, ValueError) as e:
            return ToolResult.error(f"Failed to create MagicBase table: {e}")

        table = result.to_dict()
        content = (
            f"Created MagicBase table. {_table_summary(table)}. "
            f"Use the real table_id {table.get('table_id')} in window.Magic.db row APIs."
        )
        return ToolResult(content=content, data={"project_id": project_id, "table": table})


class CreateMagicbaseColumnParams(BaseToolParams):
    table_id: str = Field(
        description="""<!--zh: MagicBase 返回的真实 table.id，不是 table_key 或 table_name。-->
Real MagicBase table.id returned by MagicBase tools. Do not pass table_key or table_name."""
    )
    column_key: str = Field(
        description="""<!--zh: 字段唯一 key，必须稳定，建议用英文小写加下划线。-->
Stable unique column key. Use lowercase English with underscores when possible."""
    )
    column_name: str = Field(
        description="""<!--zh: 展示给用户看的字段名。-->
Human-readable column name shown to users."""
    )
    data_type: str = Field(
        description="""<!--zh: 字段类型。必须使用 MagicBase 支持的枚举值。-->
Column data type. Must be one of: text, number, datetime, boolean, single_select, multi_select, user, department, attachment, json, reference."""
    )
    is_required: bool = Field(
        default=False,
        description="""<!--zh: 是否必填。-->
Whether this column is required."""
    )
    default_value: Any = Field(
        default=None,
        description="""<!--zh: 默认值，不需要默认值时留空。-->
Default value. Leave empty when no default is needed."""
    )
    options: Any = Field(
        default=None,
        description="""<!--zh: single_select、multi_select 等类型需要的选项配置。-->
Options for types such as single_select and multi_select. The shape depends on MagicBase; omit it when not needed."""
    )
    dynamic_permission: Optional[Dict[str, Any]] = Field(
        default=None,
        description="""<!--zh: 字段动态权限配置，可选。-->
Optional dynamic permission config, for example {"read_scope": "public", "edit_scope": "public"}."""
    )


@tool(name="create_magicbase_column")
class CreateMagicColumn(BaseTool[CreateMagicbaseColumnParams]):
    """<!--zh
    给当前项目内已有 MagicBase 表新增字段。
    -->
    Create a column in an existing MagicBase table in the current project.
    """
    name = "create_magicbase_column"

    async def execute(self, tool_context: ToolContext, params: CreateMagicbaseColumnParams) -> ToolResult:
        project_id = _get_project_id()
        if not project_id:
            return ToolResult.error("Project ID is not available in the current session. Cannot create MagicBase column.")

        try:
            result = await get_magic_service_sdk().magicbase.create_column_async(
                CreateMagicBaseColumnParameter(
                    project_id=project_id,
                    table_id=params.table_id,
                    column_key=params.column_key,
                    column_name=params.column_name,
                    data_type=params.data_type,
                    is_required=params.is_required,
                    default_value=params.default_value,
                    options=params.options,
                    dynamic_permission=params.dynamic_permission,
                )
            )
        except (MagicServiceException, ValueError) as e:
            return ToolResult.error(f"Failed to create MagicBase column: {e}")

        column = result.to_dict()
        content = (
            f"Created MagicBase column column_id={column.get('column_id')}, "
            f"column_key={column.get('column_key')}, column_name={column.get('column_name')}, "
            f"data_type={column.get('data_type')} for table_id={params.table_id}."
        )
        return ToolResult(content=content, data={"project_id": project_id, "table_id": params.table_id, "column": column})
