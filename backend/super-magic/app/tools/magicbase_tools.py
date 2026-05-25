import json
from datetime import datetime, timezone
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
from app.service.html_app_memory_service import (
    append_pending_migration,
    complete_migration,
    new_migration,
    record_column_success,
    record_table_success,
    read_migrations_state,
    sync_html_app_magicbase_model,
    upsert_column_model,
    upsert_table_model,
    write_migrations_state,
)
from app.tools.core import BaseTool, BaseToolParams, tool
from app.utils.init_client_message_util import InitClientMessageUtil


def _now_text() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def _column_id(column: Dict[str, Any]) -> str:
    return str(column.get("column_id") or column.get("columnId") or column.get("id") or "").strip()


def _table_id(table: Dict[str, Any]) -> str:
    return str(table.get("table_id") or table.get("tableId") or table.get("id") or "").strip()


def _normalize_column(column: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {
        "column_id": _column_id(column),
        "column_key": column.get("column_key") or column.get("columnKey") or "",
        "column_name": column.get("column_name") or column.get("columnName") or "",
        "data_type": column.get("data_type") or column.get("dataType") or "",
        "is_required": column.get("is_required") if "is_required" in column else column.get("isRequired", False),
    }
    for key in ("default_value", "options", "dynamic_permission"):
        if column.get(key) is not None:
            normalized[key] = column.get(key)
    return {key: value for key, value in normalized.items() if value not in ("", None)}


def _planned_column(column: Any) -> Dict[str, Any]:
    return _normalize_column(column.to_body())


def _merge_columns(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged = [_json_safe(column) for column in existing]
    for column in incoming:
        normalized = _normalize_column(column)
        key = normalized.get("column_key")
        column_id = normalized.get("column_id")
        match_index = -1
        for index, current in enumerate(merged):
            if column_id and current.get("column_id") == column_id:
                match_index = index
                break
            if key and current.get("column_key") == key:
                match_index = index
                break
        if match_index >= 0:
            merged[match_index] = {**merged[match_index], **normalized}
        else:
            merged.append(normalized)
    return merged


def _upsert_table_model(
    data_model: Dict[str, Any],
    table: Dict[str, Any],
    planned_columns: Optional[List[Dict[str, Any]]] = None,
) -> None:
    tables = data_model.setdefault("tables", [])
    table_id = _table_id(table)
    table_key = table.get("table_key") or table.get("tableKey") or ""
    columns = table.get("columns") or planned_columns or []
    incoming = {
        "table_id": table_id,
        "table_key": table_key,
        "table_name": table.get("table_name") or table.get("tableName") or "",
        "description": table.get("description") or "",
        "columns": [_normalize_column(column) for column in columns],
    }
    incoming = {key: value for key, value in incoming.items() if value not in ("", None)}

    match_index = -1
    for index, current in enumerate(tables):
        if table_id and current.get("table_id") == table_id:
            match_index = index
            break
        if table_key and current.get("table_key") == table_key:
            match_index = index
            break

    if match_index >= 0:
        existing = tables[match_index]
        tables[match_index] = {
            **existing,
            **{key: value for key, value in incoming.items() if key != "columns"},
            "columns": _merge_columns(existing.get("columns") or [], incoming.get("columns") or []),
        }
    else:
        tables.append(incoming)


def _upsert_column_model(data_model: Dict[str, Any], table_id: str, column: Dict[str, Any]) -> None:
    tables = data_model.setdefault("tables", [])
    for table in tables:
        if table.get("table_id") == table_id:
            table["columns"] = _merge_columns(table.get("columns") or [], [column])
            return
    tables.append({"table_id": table_id, "columns": [_normalize_column(column)]})


def _new_migration(operation: str, target: Dict[str, Any], planned_schema: Dict[str, Any], reason: str) -> Dict[str, Any]:
    return {
        "migration_id": f"mb_{operation}_{uuid.uuid4().hex[:8]}",
        "status": "Pending",
        "operation": operation,
        "target": _json_safe(target),
        "planned_schema": _json_safe(planned_schema),
        "reason": reason,
        "created_at": _now_text(),
    }


def _find_table(tables: List[Dict[str, Any]], target: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target_table_id = str(target.get("table_id") or "").strip()
    target_table_key = str(target.get("table_key") or "").strip()
    target_table_name = str(target.get("table_name") or "").strip()
    for table in tables:
        if target_table_id and _table_id(table) == target_table_id:
            return table
        if target_table_key and (table.get("table_key") or table.get("tableKey")) == target_table_key:
            return table
        if target_table_name and (table.get("table_name") or table.get("tableName")) == target_table_name:
            return table
    return None


def _find_column(table: Dict[str, Any], column_key: str) -> Optional[Dict[str, Any]]:
    for column in table.get("columns") or []:
        if (column.get("column_key") or column.get("columnKey")) == column_key:
            return column
    return None


async def _reconcile_pending_migrations_with_tables(tables: List[Dict[str, Any]]) -> int:
    state = await read_migrations_state()
    data_model = state["data_model"]
    migrations = state["migrations"]
    changed = 0
    now = _now_text()

    for migration in migrations:
        if migration.get("status") != "Pending":
            continue

        target = migration.get("target") or {}
        operation = migration.get("operation")
        if operation == "create_table":
            table = _find_table(tables, target)
            if not table:
                continue
            migration["status"] = "Success"
            migration["applied_at"] = now
            migration["reconciled_at"] = now
            migration["result_table_id"] = _table_id(table)
            migration["result"] = _json_safe(table)
            upsert_table_model(data_model, table)
            changed += 1
        elif operation == "create_column":
            table = _find_table(tables, target)
            if not table:
                continue
            column_key = str(target.get("column_key") or "").strip()
            column = _find_column(table, column_key)
            if not column:
                continue
            migration["status"] = "Success"
            migration["applied_at"] = now
            migration["reconciled_at"] = now
            migration["result_column_id"] = _column_id(column)
            migration["result"] = _json_safe(column)
            upsert_column_model(data_model, _table_id(table), column)
            changed += 1

    if changed:
        await write_migrations_state(state)
        await sync_html_app_magicbase_model(data_model)
    return changed


async def _try_reconcile_pending_migrations(project_id: str) -> int:
    try:
        result = await get_magic_service_sdk().magicbase.query_tables_async(
            QueryMagicBaseTablesParameter(project_id=project_id)
        )
        tables = result.to_dict().get("tables", [])
        return await _reconcile_pending_migrations_with_tables(tables)
    except Exception:
        return 0


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
    table_id = _table_id(table)
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
        reconciled_count = await _reconcile_pending_migrations_with_tables(tables)
        if params.table_key:
            tables = [table for table in tables if table.get("table_key") == params.table_key]
        if params.table_name:
            tables = [table for table in tables if table.get("table_name") == params.table_name]

        if not tables:
            suffix = f" Reconciled {reconciled_count} pending MagicBase migration(s)." if reconciled_count else ""
            return ToolResult(
                content=f"No MagicBase tables matched the current query.{suffix}",
                data={"project_id": project_id, "tables": []},
            )

        summaries = "; ".join(_table_summary(table) for table in tables)
        suffix = f" Reconciled {reconciled_count} pending MagicBase migration(s)." if reconciled_count else ""
        content = f"Found {len(tables)} MagicBase table(s). {summaries}.{suffix}"
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
        reconciled_count = await _reconcile_pending_migrations_with_tables([table])
        suffix = f" Reconciled {reconciled_count} pending MagicBase migration(s)." if reconciled_count else ""
        content = f"MagicBase table loaded. {_table_summary(table)}.{suffix}"
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

    def get_prompt_hint(self) -> str:
        return """\
<!--zh
HTML 微应用工作流中，create_magicbase_table 会自动维护 MagicBase schema 记录：
- 调用 MagicBase 前自动在 workspace 根目录 `.magicbase/migrations.json` 追加 Pending migration
- 成功后自动更新为 Success，补真实 table_id，并刷新 `HTML-APP.md` 里的最新 MagicBase 表结构
- 失败后自动更新为 Failed，并记录简短错误原因，不修改 `HTML-APP.md` 的正式表结构

不要为了 schema migration 单独调用编辑文件工具。普通项目记忆由 `update_html_app_memory` 在开发任务结束前统一整理。
-->
For HTML micro-app work, create_magicbase_table automatically maintains MagicBase schema records:
- Before calling MagicBase, it appends a Pending migration to the workspace-root `.magicbase/migrations.json`.
- On success, it updates that migration to Success, records the real table_id, and refreshes the latest MagicBase data model in `HTML-APP.md`.
- On failure, it updates that migration to Failed with a short error summary and does not modify the official data model in `HTML-APP.md`.

Do not call file-editing tools just to maintain schema migrations. Ordinary project memory is summarized with `update_html_app_memory` once before the development task ends.
"""

    async def execute(self, tool_context: ToolContext, params: CreateMagicbaseTableParams) -> ToolResult:
        project_id = _get_project_id()
        if not project_id:
            return ToolResult.error("Project ID is not available in the current session. Cannot create MagicBase table.")

        await _try_reconcile_pending_migrations(project_id)
        columns = [column.to_body() for column in params.columns]
        planned_columns = [_planned_column(column) for column in params.columns]
        migration = new_migration(
            operation="create_table",
            target={"table_key": params.table_key, "table_name": params.table_name},
            planned_schema={"columns": planned_columns, "description": params.description},
            reason="Create a MagicBase table for the HTML micro-app data model.",
        )
        try:
            await append_pending_migration(migration)
        except Exception as e:
            return ToolResult.error(f"Failed to update .magicbase/migrations.json before creating MagicBase table: {e}")

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
            try:
                await complete_migration(migration["migration_id"], "Failed", error_summary=str(e))
            except Exception:
                pass
            return ToolResult.error(f"Failed to create MagicBase table: {e}")

        table = result.to_dict()
        memory_warning = ""
        try:
            await record_table_success(migration["migration_id"], table, planned_columns)
        except Exception as e:
            memory_warning = f" MagicBase memory update failed after table creation: {e}."
        content = (
            f"Created MagicBase table. {_table_summary(table)}. "
            f"Use the real table_id {_table_id(table)} in window.Magic.db row APIs."
            f"{memory_warning}"
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

    def get_prompt_hint(self) -> str:
        return """\
<!--zh
HTML 微应用工作流中，create_magicbase_column 会自动维护 MagicBase schema 记录：
- 调用 MagicBase 前自动在 workspace 根目录 `.magicbase/migrations.json` 追加 Pending migration
- 成功后自动更新为 Success，补真实 column_id，并刷新 `HTML-APP.md` 里的最新 MagicBase 表结构
- 失败后自动更新为 Failed，并记录简短错误原因，不修改 `HTML-APP.md` 的正式表结构

不要为了 schema migration 单独调用编辑文件工具。普通项目记忆由 `update_html_app_memory` 在开发任务结束前统一整理。
-->
For HTML micro-app work, create_magicbase_column automatically maintains MagicBase schema records:
- Before calling MagicBase, it appends a Pending migration to the workspace-root `.magicbase/migrations.json`.
- On success, it updates that migration to Success, records the real column_id, and refreshes the latest MagicBase data model in `HTML-APP.md`.
- On failure, it updates that migration to Failed with a short error summary and does not modify the official data model in `HTML-APP.md`.

Do not call file-editing tools just to maintain schema migrations. Ordinary project memory is summarized with `update_html_app_memory` once before the development task ends.
"""

    async def execute(self, tool_context: ToolContext, params: CreateMagicbaseColumnParams) -> ToolResult:
        project_id = _get_project_id()
        if not project_id:
            return ToolResult.error("Project ID is not available in the current session. Cannot create MagicBase column.")

        await _try_reconcile_pending_migrations(project_id)
        planned_column = _normalize_column(
            {
                "column_key": params.column_key,
                "column_name": params.column_name,
                "data_type": params.data_type,
                "is_required": params.is_required,
                "default_value": params.default_value,
                "options": params.options,
                "dynamic_permission": params.dynamic_permission,
            }
        )
        migration = new_migration(
            operation="create_column",
            target={"table_id": params.table_id, "column_key": params.column_key},
            planned_schema={"column": planned_column},
            reason="Create a MagicBase column for the HTML micro-app data model.",
        )
        try:
            await append_pending_migration(migration)
        except Exception as e:
            return ToolResult.error(f"Failed to update .magicbase/migrations.json before creating MagicBase column: {e}")

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
            try:
                await complete_migration(migration["migration_id"], "Failed", error_summary=str(e))
            except Exception:
                pass
            return ToolResult.error(f"Failed to create MagicBase column: {e}")

        column = result.to_dict()
        memory_warning = ""
        try:
            await record_column_success(migration["migration_id"], params.table_id, column)
        except Exception as e:
            memory_warning = f" MagicBase memory update failed after column creation: {e}."
        content = (
            f"Created MagicBase column column_id={column.get('column_id')}, "
            f"column_key={column.get('column_key')}, column_name={column.get('column_name')}, "
            f"data_type={column.get('data_type')} for table_id={params.table_id}."
            f"{memory_warning}"
        )
        return ToolResult(content=content, data={"project_id": project_id, "table_id": params.table_id, "column": column})
