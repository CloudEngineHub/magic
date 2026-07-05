from PIL import Image

from app.tools.pptx_to_slide_template import preview_assets
from app.tools.pptx_to_slide_template import runner
from app.tools.pptx_to_slide_template.template_metadata import build_template_json


def test_resolve_output_root_defaults_to_visible_workspace_directory(tmp_path):
    assert runner._resolve_output_root("", tmp_path) == tmp_path / "slide-templates"


def test_static_renderer_bundle_defaults_widescreen_to_1920_by_1080():
    bundle = runner._static_bundle_path().read_text(encoding="utf-8")

    assert "return { width: 1920, height: 1080 }" in bundle


def test_collage_grid_size_uses_compact_matrix():
    assert preview_assets.collage_grid_size(1) == (1, 1)
    assert preview_assets.collage_grid_size(4) == (2, 2)
    assert preview_assets.collage_grid_size(5) == (3, 2)
    assert preview_assets.collage_grid_size(9) == (3, 3)


def test_create_preview_images_from_rendered_pages_limits_collage_to_nine(tmp_path):
    page_paths = []
    for index in range(10):
        page_path = tmp_path / f"source-{index + 1:03d}.png"
        Image.new("RGB", (192, 108), color=(index * 20, 80, 120)).save(page_path)
        page_paths.append(page_path)

    files = preview_assets.create_preview_images_from_rendered_pages(page_paths, tmp_path / "previews")

    assert files == {
        "thumbnail_image": "previews/cover.png",
        "collage_image": "previews/collage.png",
    }
    assert (tmp_path / "previews" / "cover.png").exists()
    with Image.open(tmp_path / "previews" / "collage.png") as collage:
        assert collage.size == (2000, 1160)


def test_build_template_json_records_preview_files_and_warnings(tmp_path):
    payload = build_template_json(
        template_id="demo",
        source_path=tmp_path / "demo.pptx",
        deck={"canvas": {"width": 1920, "height": 1080}},
        report={},
        slides=[],
        preview_files={
            "thumbnail_image": "previews/cover.png",
            "collage_image": "previews/collage.png",
        },
        warnings=["preview ok"],
    )

    assert payload["files"]["thumbnail_image"] == "previews/cover.png"
    assert payload["files"]["collage_image"] == "previews/collage.png"
    assert payload["source"] == {
        "kind": "pptx_import",
        "file": "demo.pptx",
        "canvas": {"width": 1920, "height": 1080},
    }
    assert payload["warnings"] == ["preview ok"]
