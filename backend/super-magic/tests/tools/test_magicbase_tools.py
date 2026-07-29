from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.i18n import i18n
from app.infrastructure.sdk.magic_service.api.magicbase_api import MagicBaseApi
from app.infrastructure.sdk.magic_service.parameter import (
    BatchCreateMagicBaseRowsParameter,
    BatchDeleteMagicBaseRowsParameter,
    CreateMagicBaseColumnParameter,
    CreateMagicBaseRowParameter,
    CreateMagicBaseTableParameter,
    DeleteMagicBaseColumnParameter,
    DeleteMagicBaseRowParameter,
    DeleteMagicBaseTableParameter,
    GetMagicBaseTableParameter,
    QueryMagicBaseRowsParameter,
    QueryMagicBaseTablesParameter,
    UpdateMagicBaseColumnParameter,
    UpdateMagicBaseTablePermissionsParameter,
)
from app.infrastructure.sdk.magic_service.result import (
    MagicBaseBatchCreateRowsResult,
    MagicBaseBatchDeleteRowsResult,
    MagicBaseRowResult,
    MagicBaseRowsResult,
    MagicBaseTableResult,
    MagicBaseTablesResult,
)
from app.tools.magicbase_tools import (
    BatchCreateMagicbaseRowsParams,
    BatchCreateMagicRows,
    BatchDeleteMagicbaseRowsParams,
    BatchDeleteMagicRows,
    CreateMagicbaseRowParams,
    CreateMagicbaseTableParams,
    CreateMagicColumn,
    CreateMagicRow,
    CreateMagicTable,
    DeleteMagicbaseRowParams,
    DeleteMagicColumn,
    DeleteMagicRow,
    DeleteMagicTable,
    GetMagicTable,
    MagicbaseColumnDefinition,
    QueryMagicbaseRowsParams,
    QueryMagicbaseTablesParams,
    QueryMagicRows,
    QueryMagicTables,
    UpdateMagicColumn,
    UpdateMagicTablePermissions,
)
from app.utils.async_file_utils import async_read_json


class RecordingMagicBaseApi(MagicBaseApi):
    def __init__(self):
        self.call = None
        self.response = {}

    async def request_by_parameter_async(self, parameter, method: str, endpoint_path: str):
        self.call = (parameter, method, endpoint_path)
        return self.response


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool_class", "tool_name", "zh_action", "en_action"),
    [
        (QueryMagicTables, "query_magicbase_tables", "查询数据表", "Query tables"),
        (GetMagicTable, "get_magicbase_table", "查看数据表", "View table"),
        (QueryMagicRows, "query_magicbase_rows", "查询数据记录", "Query rows"),
        (CreateMagicRow, "create_magicbase_row", "新增数据记录", "Create row"),
        (
            BatchCreateMagicRows,
            "batch_create_magicbase_rows",
            "批量新增数据记录",
            "Batch create rows",
        ),
        (DeleteMagicRow, "delete_magicbase_row", "删除数据记录", "Delete row"),
        (
            BatchDeleteMagicRows,
            "batch_delete_magicbase_rows",
            "批量删除数据记录",
            "Batch delete rows",
        ),
        (CreateMagicTable, "create_magicbase_table", "创建数据表", "Create table"),
        (CreateMagicColumn, "create_magicbase_column", "创建字段", "Create field"),
        (
            UpdateMagicTablePermissions,
            "update_magicbase_table_permissions",
            "更新数据表权限",
            "Update table permissions",
        ),
        (DeleteMagicTable, "delete_magicbase_table", "删除数据表", "Delete table"),
        (UpdateMagicColumn, "update_magicbase_column", "更新字段", "Update field"),
        (DeleteMagicColumn, "delete_magicbase_column", "删除字段", "Delete field"),
    ],
)
async def test_magicbase_tool_actions_are_localized(tool_class, tool_name, zh_action, en_action):
    tool = tool_class()
    try:
        i18n.set_language("zh_CN")
        zh = await tool.get_before_tool_call_friendly_action_and_remark(tool_name, None, {})
        assert zh["action"] == zh_action

        i18n.set_language("en_US")
        en = await tool.get_before_tool_call_friendly_action_and_remark(tool_name, None, {})
        assert en["action"] == en_action
    finally:
        i18n.reset_language()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "tool_name", "arguments", "expected_remark"),
    [
        (
            QueryMagicTables(),
            "query_magicbase_tables",
            {},
            "当前微应用",
        ),
        (
            GetMagicTable(),
            "get_magicbase_table",
            {"table_id": "table-1"},
            "表结构与权限",
        ),
        (
            QueryMagicRows(),
            "query_magicbase_rows",
            {"table_id": "table-1"},
            "当前数据表",
        ),
        (
            CreateMagicRow(),
            "create_magicbase_row",
            {"table_id": "table-1"},
            "保存业务数据",
        ),
        (
            BatchCreateMagicRows(),
            "batch_create_magicbase_rows",
            {"table_id": "table-1", "rows": [{}, {}]},
            "2 条记录",
        ),
        (
            DeleteMagicRow(),
            "delete_magicbase_row",
            {"table_id": "table-1", "record_id": "row-1"},
            "指定记录",
        ),
        (
            BatchDeleteMagicRows(),
            "batch_delete_magicbase_rows",
            {"table_id": "table-1", "record_ids": ["row-1", "row-2"]},
            "2 条记录",
        ),
        (
            CreateMagicTable(),
            "create_magicbase_table",
            {"table_name": "客户反馈"},
            "客户反馈",
        ),
        (
            CreateMagicColumn(),
            "create_magicbase_column",
            {"column_name": "联系电话"},
            "联系电话",
        ),
        (
            UpdateMagicTablePermissions(),
            "update_magicbase_table_permissions",
            {"table_id": "table-1"},
            "读写范围",
        ),
        (
            DeleteMagicTable(),
            "delete_magicbase_table",
            {"table_id": "table-1"},
            "指定数据表",
        ),
        (
            UpdateMagicColumn(),
            "update_magicbase_column",
            {"column_id": "column-1", "column_name": "联系电话"},
            "联系电话",
        ),
        (
            DeleteMagicColumn(),
            "delete_magicbase_column",
            {"column_id": "column-1"},
            "指定字段",
        ),
    ],
)
async def test_magicbase_tools_describe_their_target_before_and_after_execution(
    tool, tool_name, arguments, expected_remark
):
    try:
        i18n.set_language("zh_CN")
        before = await tool.get_before_tool_call_friendly_action_and_remark(
            tool_name, None, arguments
        )
        after = await tool.get_after_tool_call_friendly_action_and_remark(
            tool_name,
            None,
            ToolResult(content="ok"),
            0.1,
            arguments,
        )

        assert before["remark"]
        assert expected_remark in before["remark"]
        assert after["remark"]
        assert expected_remark in after["remark"]
    finally:
        i18n.reset_language()


@pytest.mark.asyncio
async def test_magicbase_api_uses_expected_endpoint_paths():
    api = RecordingMagicBaseApi()

    api.response = []
    await api.query_tables_async(QueryMagicBaseTablesParameter(project_id="100"))
    assert api.call[1:] == ("GET", "/api/v1/magicbase/projects/100/tables")

    api.response = {"id": 200}
    await api.get_table_async(GetMagicBaseTableParameter(project_id="100", table_id="200"))
    assert api.call[1:] == ("GET", "/api/v1/magicbase/projects/100/tables/200")

    await api.create_table_async(
        CreateMagicBaseTableParameter(
            project_id="100",
            table_key="survey",
            table_name="Survey",
            columns=[{"column_key": "name", "column_name": "Name", "data_type": "text"}],
        )
    )
    assert api.call[1:] == ("POST", "/api/v1/magicbase/projects/100/tables")

    await api.create_column_async(
        CreateMagicBaseColumnParameter(
            project_id="100",
            table_id="200",
            column_key="name",
            column_name="Name",
            data_type="text",
        )
    )
    assert api.call[1:] == ("POST", "/api/v1/magicbase/projects/100/tables/200/columns")

    await api.update_table_permissions_async(
        UpdateMagicBaseTablePermissionsParameter(
            project_id="100",
            table_id="200",
            dynamic_permissions={"row": {"read_scope": "public", "edit_scope": "private_user"}},
        )
    )
    assert api.call[1:] == ("PATCH", "/api/v1/magicbase/projects/100/tables/200")

    await api.delete_table_async(DeleteMagicBaseTableParameter(project_id="100", table_id="200"))
    assert api.call[1:] == ("DELETE", "/api/v1/magicbase/projects/100/tables/200")

    await api.update_column_async(
        UpdateMagicBaseColumnParameter(
            project_id="100",
            table_id="200",
            column_id="300",
            column_key="name",
            column_name="Name",
            data_type="text",
        )
    )
    assert api.call[1:] == ("PATCH", "/api/v1/magicbase/projects/100/tables/200/columns/300")

    await api.delete_column_async(DeleteMagicBaseColumnParameter(project_id="100", table_id="200", column_id="300"))
    assert api.call[1:] == ("DELETE", "/api/v1/magicbase/projects/100/tables/200/columns/300")

    api.response = {"page": 1, "page_size": 20, "total": 1, "list": [{"id": 400}]}
    rows = await api.query_rows_async(
        QueryMagicBaseRowsParameter(project_id="100", table_id="200", select=["id"])
    )
    assert api.call[1:] == ("POST", "/api/v1/magicbase/projects/100/tables/200/query")
    assert rows.to_dict()["rows"][0]["id"] == "400"

    api.response = {"id": 401, "title": "Created"}
    row = await api.create_row_async(
        CreateMagicBaseRowParameter(project_id="100", table_id="200", data={"title": "Created"})
    )
    assert api.call[1:] == ("POST", "/api/v1/magicbase/projects/100/tables/200/rows")
    assert row.to_dict()["id"] == "401"

    api.response = {
        "created_count": 2,
        "record_ids": [402, 403],
        "rows": [{"id": 402}, {"id": 403}],
    }
    batch_created = await api.batch_create_rows_async(
        BatchCreateMagicBaseRowsParameter(
            project_id="100",
            table_id="200",
            rows=[{"title": "A"}, {"title": "B"}],
        )
    )
    assert api.call[1:] == ("POST", "/api/v1/magicbase/projects/100/tables/200/rows/batch")
    assert batch_created.to_dict()["record_ids"] == ["402", "403"]

    api.response = {}
    await api.delete_row_async(
        DeleteMagicBaseRowParameter(project_id="100", table_id="200", record_id="402")
    )
    assert api.call[1:] == ("DELETE", "/api/v1/magicbase/projects/100/tables/200/rows/402")

    api.response = {"deleted_count": 2, "record_ids": [402, 403]}
    batch_deleted = await api.batch_delete_rows_async(
        BatchDeleteMagicBaseRowsParameter(
            project_id="100",
            table_id="200",
            record_ids=["402", "403"],
        )
    )
    assert api.call[1:] == ("POST", "/api/v1/magicbase/projects/100/tables/200/rows/batch-delete")
    assert batch_deleted.to_dict()["record_ids"] == ["402", "403"]


def test_magicbase_result_normalizes_camel_and_snake_case():
    table = MagicBaseTableResult(
        {
            "id": 200,
            "projectId": 100,
            "tableKey": "survey",
            "tableName": "Survey",
            "columns": [
                {
                    "id": 300,
                    "columnKey": "name",
                    "columnName": "Name",
                    "dataType": "text",
                    "isRequired": True,
                }
            ],
        }
    ).to_dict()

    assert table["table_id"] == "200"
    assert table["project_id"] == "100"
    assert table["table_key"] == "survey"
    assert table["columns"][0]["column_id"] == "300"
    assert table["columns"][0]["column_key"] == "name"
    assert table["columns"][0]["is_required"] is True

    tables = MagicBaseTablesResult([{"id": 201, "table_key": "logs", "table_name": "Logs"}]).to_dict()
    assert tables["tables"][0]["table_id"] == "201"
    assert tables["tables"][0]["table_key"] == "logs"


def test_magicbase_table_parameter_strips_legacy_column_options():
    parameter = CreateMagicBaseTableParameter(
        project_id="100",
        table_key="survey",
        table_name="Survey",
        columns=[
            {
                "column_key": "status",
                "column_name": "Status",
                "data_type": "text",
                "options": [{"label": "Open", "value": "open"}],
            }
        ],
    )

    body = parameter.to_body()

    assert "options" not in body["columns"][0]


def test_magicbase_sdk_parameters_reject_legacy_low_code_types():
    with pytest.raises(ValueError):
        CreateMagicBaseColumnParameter(
            project_id="100",
            table_id="200",
            column_key="usage_purpose",
            column_name="Usage Purpose",
            data_type="multi_select",
        ).validate()

    with pytest.raises(ValueError):
        CreateMagicBaseTableParameter(
            project_id="100",
            table_key="survey",
            table_name="Survey",
            columns=[
                {
                    "column_key": "usage_purpose",
                    "column_name": "Usage Purpose",
                    "data_type": "multi_select",
                }
            ],
        ).validate()


def test_magicbase_column_definition_rejects_legacy_low_code_types():
    with pytest.raises(ValidationError):
        MagicbaseColumnDefinition(
            column_key="usage_purpose",
            column_name="Usage Purpose",
            data_type="multi_select",
        )


@pytest.mark.asyncio
async def test_query_magicbase_tables_fails_without_project_id():
    with patch("app.tools.magicbase_tools.InitClientMessageUtil.get_metadata", return_value={}):
        result = await QueryMagicTables().execute(None, QueryMagicbaseTablesParams())

    assert result.ok is False
    assert "Project ID is not available" in result.content


def test_magicbase_row_parameter_uses_current_session_identity():
    with (
        patch(
            "app.utils.init_client_message_util.InitClientMessageUtil.get_full_config",
            return_value={"metadata": {"user_id": "user-1"}},
        ),
        patch(
            "app.utils.init_client_message_util.InitClientMessageUtil.get_user_authorization",
            return_value="Bearer current-user",
        ),
        patch(
            "app.utils.init_client_message_util.InitClientMessageUtil.get_metadata",
            return_value={"organization_code": "org-1"},
        ),
    ):
        parameter = CreateMagicBaseRowParameter(
            project_id="100",
            table_id="200",
            data={"title": "Current user row"},
        )

    parameter.validate()
    assert parameter.to_headers()["Authorization"] == "Bearer current-user"
    assert parameter.to_headers()["organization-code"] == "org-1"
    assert "token" not in parameter.to_headers()


@pytest.mark.asyncio
async def test_magicbase_row_tool_rejects_project_context_mismatch():
    tool_context = ToolContext(metadata={"project_id": "200"})
    with patch(
        "app.tools.magicbase_tools.InitClientMessageUtil.get_metadata",
        return_value={"project_id": "100"},
    ):
        result = await QueryMagicRows().execute(
            tool_context,
            QueryMagicbaseRowsParams(table_id="300"),
        )

    assert result.ok is False
    assert "does not match" in result.content


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "params"),
    [
        (
            DeleteMagicRow(),
            DeleteMagicbaseRowParams(table_id="200", record_id="300"),
        ),
        (
            BatchDeleteMagicRows(),
            BatchDeleteMagicbaseRowsParams(table_id="200", record_ids=["300", "301"]),
        ),
    ],
)
async def test_magicbase_delete_tools_require_explicit_confirmation(tool, params):
    with patch("app.tools.magicbase_tools.get_magic_service_sdk", new_callable=AsyncMock) as get_sdk:
        result = await tool.execute(ToolContext(metadata={"project_id": "100"}), params)

    assert result.ok is False
    assert "confirm_delete=true" in result.content
    get_sdk.assert_not_called()


@pytest.mark.asyncio
async def test_magicbase_row_tools_forward_expected_payloads():
    class FakeMagicBase:
        def __init__(self):
            self.calls = []

        async def query_rows_async(self, parameter):
            self.calls.append(("query", parameter))
            return MagicBaseRowsResult(
                {"page": 1, "page_size": 20, "total": 1, "list": [{"id": 300, "title": "A"}]}
            )

        async def create_row_async(self, parameter):
            self.calls.append(("create", parameter))
            return MagicBaseRowResult({"id": 301, **parameter.data})

        async def batch_create_rows_async(self, parameter):
            self.calls.append(("batch_create", parameter))
            return MagicBaseBatchCreateRowsResult(
                {
                    "created_count": len(parameter.rows),
                    "record_ids": [302, 303],
                    "rows": [{"id": 302}, {"id": 303}],
                }
            )

        async def delete_row_async(self, parameter):
            self.calls.append(("delete", parameter))

        async def batch_delete_rows_async(self, parameter):
            self.calls.append(("batch_delete", parameter))
            return MagicBaseBatchDeleteRowsResult(
                {"deleted_count": len(parameter.record_ids), "record_ids": parameter.record_ids}
            )

    class FakeSdk:
        magicbase = FakeMagicBase()

    tool_context = ToolContext(metadata={"project_id": "100"})
    with (
        patch("app.tools.magicbase_tools.InitClientMessageUtil.get_metadata", return_value={"project_id": "100"}),
        patch("app.tools.magicbase_tools.get_magic_service_sdk", return_value=FakeSdk()),
    ):
        query_result = await QueryMagicRows().execute(
            tool_context,
            QueryMagicbaseRowsParams(table_id="200", filter={"status": {"eq": "open"}}, select=["id"]),
        )
        create_result = await CreateMagicRow().execute(
            tool_context,
            CreateMagicbaseRowParams(table_id="200", data={"title": "A"}, select=["id"]),
        )
        batch_create_result = await BatchCreateMagicRows().execute(
            tool_context,
            BatchCreateMagicbaseRowsParams(table_id="200", rows=[{"title": "A"}, {"title": "B"}]),
        )
        delete_result = await DeleteMagicRow().execute(
            tool_context,
            DeleteMagicbaseRowParams(table_id="200", record_id="302", confirm_delete=True),
        )
        batch_delete_result = await BatchDeleteMagicRows().execute(
            tool_context,
            BatchDeleteMagicbaseRowsParams(
                table_id="200",
                record_ids=["302", "303"],
                confirm_delete=True,
            ),
        )

    assert query_result.ok is True
    assert create_result.data["row"]["id"] == "301"
    assert batch_create_result.data["record_ids"] == ["302", "303"]
    assert delete_result.ok is True
    assert batch_delete_result.data["deleted_count"] == 2
    assert [call[0] for call in FakeSdk.magicbase.calls] == [
        "query",
        "create",
        "batch_create",
        "delete",
        "batch_delete",
    ]


@pytest.mark.asyncio
async def test_create_magicbase_table_returns_real_table_id(tmp_path):
    class FakeMagicBase:
        async def create_table_async(self, parameter):
            assert parameter.project_id == "100"
            assert parameter.table_key == "survey"
            return MagicBaseTableResult(
                {
                    "id": 200,
                    "tableKey": "survey",
                    "tableName": "Survey",
                    "columns": [
                        {
                            "id": 300,
                            "columnKey": "name",
                            "columnName": "Name",
                            "dataType": "text",
                        }
                    ],
                }
            )

    class FakeSdk:
        magicbase = FakeMagicBase()

    params = CreateMagicbaseTableParams(
        table_key="survey",
        table_name="Survey",
        columns=[
            MagicbaseColumnDefinition(
                column_key="name",
                column_name="Name",
                data_type="text",
            )
        ],
    )

    with (
        patch("app.service.html_app_memory_service.PathManager.get_workspace_dir", return_value=tmp_path),
        patch("app.tools.magicbase_tools.InitClientMessageUtil.get_metadata", return_value={"project_id": "100"}),
        patch("app.tools.magicbase_tools.get_magic_service_sdk", return_value=FakeSdk()),
    ):
        result = await CreateMagicTable().execute(None, params)

    assert result.ok is True
    assert "Use the real table_id 200" in result.content
    assert result.data["table"]["table_id"] == "200"

    state = await async_read_json(tmp_path / ".magicbase" / "migrations.json")
    assert state["version"] == 2
    assert len(state["migrations"]) == 1
    assert state["migrations"][0]["result_table_id"] == "200"
    assert "result" not in state["migrations"][0]
