from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.infrastructure.sdk.magic_service.api.magicbase_api import MagicBaseApi
from app.infrastructure.sdk.magic_service.parameter import (
    CreateMagicBaseColumnParameter,
    CreateMagicBaseTableParameter,
    GetMagicBaseTableParameter,
    QueryMagicBaseTablesParameter,
)
from app.infrastructure.sdk.magic_service.result import MagicBaseTableResult, MagicBaseTablesResult
from app.tools.magicbase_tools import (
    CreateMagicbaseTableParams,
    CreateMagicTable,
    MagicbaseColumnDefinition,
    QueryMagicbaseTablesParams,
    QueryMagicTables,
)


class RecordingMagicBaseApi(MagicBaseApi):
    def __init__(self):
        self.call = None
        self.response = {}

    async def request_by_parameter_async(self, parameter, method: str, endpoint_path: str):
        self.call = (parameter, method, endpoint_path)
        return self.response


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
