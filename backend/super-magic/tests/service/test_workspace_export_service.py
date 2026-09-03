from unittest.mock import AsyncMock

import pytest

from app.service import workspace_export_service


@pytest.mark.asyncio
async def test_workspace_export_dispatches_slides_template_creator(monkeypatch, tmp_path):
    template_dir = tmp_path / "templates" / "SLIDE-business-report"
    template_dir.mkdir(parents=True)
    export_mock = AsyncMock(
        return_value={
            "file_key": "private/SLIDE-business-report.zip",
            "metadata": {"code": "SLIDE-business-report"},
        }
    )

    monkeypatch.setattr(
        workspace_export_service.PathManager,
        "get_workspace_dir",
        lambda: tmp_path,
    )
    monkeypatch.setattr(workspace_export_service, "export_slides_template", export_mock)

    result = await workspace_export_service.export_workspace(
        export_type="slides_template_creator",
        code="SLIDE-business-report",
        upload_config={"dir": "private"},
        public_upload_config={"dir": "public"},
        source_path="templates/SLIDE-business-report",
        archive_root="SLIDE-business-report",
        file_name="SLIDE-business-report.zip",
    )

    assert result["file_key"] == "private/SLIDE-business-report.zip"
    export_mock.assert_awaited_once_with(
        workspace_dir=template_dir.resolve(),
        code="SLIDE-business-report",
        private_upload_config={"dir": "private"},
        public_upload_config={"dir": "public"},
        archive_root="SLIDE-business-report",
        file_name="SLIDE-business-report.zip",
    )


@pytest.mark.asyncio
async def test_workspace_export_requires_public_upload_config_for_slides_template(tmp_path, monkeypatch):
    template_dir = tmp_path / "templates" / "SLIDE-business-report"
    template_dir.mkdir(parents=True)
    monkeypatch.setattr(
        workspace_export_service.PathManager,
        "get_workspace_dir",
        lambda: tmp_path,
    )

    with pytest.raises(ValueError, match="public_upload_config is required"):
        await workspace_export_service.export_workspace(
            export_type="slides_template_creator",
            code="SLIDE-business-report",
            upload_config={"dir": "private"},
            source_path="templates/SLIDE-business-report",
            archive_root="SLIDE-business-report",
            file_name="SLIDE-business-report.zip",
        )
