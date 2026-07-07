from PIL import Image

from app.tools.pptx_to_slide_template import preview_assets, runner
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


def test_build_template_json_uses_current_template_schema(tmp_path):
    payload = build_template_json(
        template_id="PPT-demo",
        source_path=tmp_path / "demo.pptx",
        deck={"canvas": {"width": 1920, "height": 1080}},
        report={},
        slides=[
            {
                "file": "slides/slide-001.html",
                "title": "Converted Slide 001",
                "layout": "cover",
                "description": "Converted cover layout from source slide 1. Review and refine before final packaging.",
            }
        ],
        warnings=["preview ok"],
    )

    assert payload["schema_version"] == "1.0"
    assert payload["template_id"] == "PPT-demo"
    assert payload["label"] == {
        "zh_CN": "demo",
        "en_US": "demo",
    }
    assert payload["files"] == {
        "theme_css": "theme.css",
        "slides_dir": "slides",
        "images_dir": "images",
    }
    assert payload["slides"] == [
        {
            "file": "slides/slide-001.html",
            "title": "Converted Slide 001",
            "layout": "cover",
            "description": "Converted cover layout from source slide 1. Review and refine before final packaging.",
        }
    ]
    assert payload["source"] == {
        "kind": "converted",
        "file": "demo.pptx",
        "canvas": {"width": 1920, "height": 1080},
    }
    assert payload["warnings"] == ["preview ok"]
    assert "name" not in payload
    assert "category_code" not in payload
    assert "visual_spec" not in payload["files"]
    assert "thumbnail_image" not in payload["files"]


def test_build_template_json_can_record_optional_category_visual_spec_and_package_zip(tmp_path):
    payload = build_template_json(
        template_id="PPT-demo",
        category_code="PPT-CATE-business-report",
        source_path=tmp_path / "demo.pptx",
        deck={"canvas": {"width": 1920, "height": 1080}},
        report={},
        slides=[],
        visual_spec="visual-spec.md",
        package_zip="../PPT-demo-template.zip",
    )

    assert payload["category_code"] == "PPT-CATE-business-report"
    assert payload["files"]["visual_spec"] == "visual-spec.md"
    assert payload["files"]["package_zip"] == "../PPT-demo-template.zip"


def test_template_id_uses_current_ppt_prefix_format():
    assert runner._template_id("Business QBR 2026") == "PPT-business-qbr-2026"
    assert runner._template_id("PPT-custom-template") == "PPT-custom-template"


def test_rewrite_slide_html_does_not_inject_project_bridge(tmp_path):
    html = '<html><head><link rel="stylesheet" href="../styles.css"></head><body></body></html>'

    rewritten = runner._rewrite_slide_html(
        html,
        slots=[],
        preserve_source_data_attrs=False,
        externalize_inline_svg=True,
        vectors_dir=tmp_path / "vectors",
        slide_id="slide-001",
    )

    assert "../theme.css" in rewritten
    assert "slide-bridge.js" not in rewritten
