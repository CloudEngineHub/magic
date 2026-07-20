from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.i18n import i18n
from app.infrastructure.sdk.magic_service.api.magicbase_api import MagicBaseApi
from app.infrastructure.sdk.magic_service.parameter import (
    CreateMagicBaseColumnParameter,
    CreateMagicBaseTableParameter,
    DeleteMagicBaseColumnParameter,
    DeleteMagicBaseTableParameter,
    GetMagicBaseTableParameter,
    QueryMagicBaseTablesParameter,
    UpdateMagicBaseColumnParameter,
    UpdateMagicBaseTablePermissionsParameter,
)
from app.infrastructure.sdk.magic_service.result import MagicBaseTableResult, MagicBaseTablesResult
from app.tools.magicbase_tools import (
    CreateMagicbaseTableParams,
    CreateMagicColumn,
    CreateMagicTable,
    DeleteMagicColumn,
    DeleteMagicTable,
    GetMagicTable,
    MagicbaseColumnDefinition,
    QueryMagicbaseTablesParams,
    QueryMagicTables,
    UpdateMagicColumn,
    UpdateMagicTablePermissions,
)


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


@pytest.mark.asyncio
async def test_create_magicbase_table_returns_real_table_id():
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
        patch("app.tools.magicbase_tools.InitClientMessageUtil.get_metadata", return_value={"project_id": "100"}),
        patch("app.tools.magicbase_tools.get_magic_service_sdk", return_value=FakeSdk()),
    ):
        result = await CreateMagicTable().execute(None, params)

    assert result.ok is True
    assert "Use the real table_id 200" in result.content
    assert result.data["table"]["table_id"] == "200"
