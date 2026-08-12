import json
import shutil
import zipfile
from pathlib import Path

import pytest

from app.service.slides_template_export_service import export_slides_template


def _write_manifest(template_dir: Path, thumbnail: str = "previews/thumbnail.png") -> None:
    manifest = {
        "schema_version": "1.0",
        "template_id": "SLIDE-business-report",
        "category_code": "business",
        "tag_codes": ["report"],
        "local_files": {
            "thumbnail": thumbnail,
            "collage": "previews/collage.png",
            "preview_images": ["previews/slides/slide-1.png"],
        },
        "backend_fields": {
            "code": "SLIDE-business-report",
            "category_code": "business",
            "label": {
                "zh_CN": "业务汇报模板",
                "en_US": "Business Report Template",
            },
            "description": {
                "zh_CN": "适用于业务汇报场景",
                "en_US": "For business reporting scenarios",
            },
            "tag_codes": ["report"],
        },
    }
    (template_dir / "template-assets.json").write_text(
        json.dumps(manifest, ensure_ascii=False),
        encoding="utf-8",
    )


def _create_template(tmp_path: Path) -> Path:
    template_dir = tmp_path / "SLIDE-business-report"
    (template_dir / "previews" / "slides").mkdir(parents=True)
    (template_dir / ".template-work").mkdir()
    (template_dir / "slides").mkdir()
    (template_dir / "previews" / "thumbnail.png").write_bytes(b"thumbnail")
    (template_dir / "previews" / "collage.png").write_bytes(b"collage")
    (template_dir / "previews" / "slides" / "slide-1.png").write_bytes(b"preview")
    (template_dir / "slides" / "slide-1.html").write_text("<html></html>", encoding="utf-8")
    (template_dir / ".template-work" / "debug.json").write_text("{}", encoding="utf-8")
    _write_manifest(template_dir)
    return template_dir


@pytest.mark.asyncio
async def test_export_uploads_public_assets_and_private_archive(monkeypatch, tmp_path):
    template_dir = _create_template(tmp_path)
    uploaded = []
    captured_zip = tmp_path / "captured.zip"

    async def fake_upload(file_path, file_key, upload_config):
        uploaded.append((Path(file_path).read_bytes(), file_key, upload_config["bucket_marker"]))
        if file_key.endswith(".zip"):
            shutil.copyfile(file_path, captured_zip)

    monkeypatch.setattr(
        "app.service.slides_template_export_service._upload_file",
        fake_upload,
    )

    result = await export_slides_template(
        workspace_dir=template_dir,
        code="SLIDE-business-report",
        private_upload_config={"bucket_marker": "private", "dir": "private-prefix"},
        public_upload_config={"bucket_marker": "public", "dir": "public-prefix"},
        archive_root="SLIDE-business-report",
        file_name="SLIDE-business-report.zip",
    )

    assert result["file_key"] == "private-prefix/SLIDE-business-report.zip"
    assert result["metadata"]["template_file_key"] == result["file_key"]
    assert result["metadata"]["thumbnail_file_key"] == "public-prefix/thumbnail.png"
    assert result["metadata"]["collage_file_key"] == "public-prefix/collage.png"
    assert result["metadata"]["preview_image_file_keys"] == ["public-prefix/slides/slide-1.png"]
    assert result["metadata"]["category_code"] == "business"
    assert result["metadata"]["tag_codes"] == ["report"]
    assert [item[2] for item in uploaded] == ["public", "public", "public", "private"]

    with zipfile.ZipFile(captured_zip) as archive:
        names = set(archive.namelist())
    assert "SLIDE-business-report/slides/slide-1.html" in names
    assert all("/previews/" not in name for name in names)
    assert all("/.template-work/" not in name for name in names)


@pytest.mark.asyncio
async def test_export_rejects_manifest_asset_path_outside_template(tmp_path):
    template_dir = _create_template(tmp_path)
    (tmp_path / "outside.png").write_bytes(b"outside")
    _write_manifest(template_dir, thumbnail="../outside.png")

    with pytest.raises(ValueError, match="must stay inside the template directory"):
        await export_slides_template(
            workspace_dir=template_dir,
            code="SLIDE-business-report",
            private_upload_config={"dir": "private-prefix"},
            public_upload_config={"dir": "public-prefix"},
            archive_root="SLIDE-business-report",
            file_name="SLIDE-business-report.zip",
        )


@pytest.mark.asyncio
async def test_export_rejects_more_than_fifty_preview_images(tmp_path):
    template_dir = _create_template(tmp_path)
    manifest_path = template_dir / "template-assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["local_files"]["preview_images"] = [f"previews/slides/slide-{index}.png" for index in range(51)]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ValueError, match="at most 50 preview images"):
        await export_slides_template(
            workspace_dir=template_dir,
            code="SLIDE-business-report",
            private_upload_config={"dir": "private-prefix"},
            public_upload_config={"dir": "public-prefix"},
            archive_root="SLIDE-business-report",
            file_name="SLIDE-business-report.zip",
        )


@pytest.mark.asyncio
async def test_export_rejects_manifest_code_mismatch(tmp_path):
    template_dir = _create_template(tmp_path)
    manifest_path = template_dir / "template-assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["backend_fields"]["code"] = "SLIDE-other-template"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ValueError, match="code must match the requested template code"):
        await export_slides_template(
            workspace_dir=template_dir,
            code="SLIDE-business-report",
            private_upload_config={"dir": "private-prefix"},
            public_upload_config={"dir": "public-prefix"},
            archive_root="SLIDE-business-report",
            file_name="SLIDE-business-report.zip",
        )


@pytest.mark.asyncio
async def test_export_validates_metadata_before_upload(tmp_path, monkeypatch):
    template_dir = _create_template(tmp_path)
    manifest_path = template_dir / "template-assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["backend_fields"]["description"]["en_US"] = ""
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    uploaded = []

    async def fake_upload(file_path, file_key, upload_config):
        uploaded.append(file_key)

    monkeypatch.setattr(
        "app.service.slides_template_export_service._upload_file",
        fake_upload,
    )

    with pytest.raises(ValueError, match="backend_fields.description"):
        await export_slides_template(
            workspace_dir=template_dir,
            code="SLIDE-business-report",
            private_upload_config={"dir": "private-prefix"},
            public_upload_config={"dir": "public-prefix"},
            archive_root="SLIDE-business-report",
            file_name="SLIDE-business-report.zip",
        )

    assert uploaded == []
