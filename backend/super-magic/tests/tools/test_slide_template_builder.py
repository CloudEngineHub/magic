import json
import re
import zipfile
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from agentlang.context.tool_context import ToolContext
from app.tools.slide_template_builder import (
    CreateSlideTemplateProject,
    FinalizeSlideTemplate,
    PrepareSlideTemplateSource,
    SelectSlideTemplateSourceAssets,
)
from app.tools.slide_template_builder.common import (
    WORK_DIR_NAME,
    cleanup_template_intermediates,
    validate_template_id,
)
from app.tools.slide_template_builder.create_project import CreateSlideTemplateProjectParams
from app.tools.slide_template_builder.finalize_project import FinalizeSlideTemplateParams
from app.tools.slide_template_builder.models import (
    TemplateDescriptionText,
    TemplateLabelText,
    TemplateSlideParams,
    TemplateSourceParams,
)
from app.tools.slide_template_builder.preview import _create_collage, _resize_png
from app.tools.slide_template_builder.source_analysis import PrepareSlideTemplateSourceParams
from app.tools.slide_template_builder.source_asset_selection import (
    SelectSlideTemplateSourceAssetsParams,
    SourceAssetDecisionParams,
)
from app.utils.async_file_utils import async_read_json, async_scandir, async_write_json, async_write_text


def _params():
    return CreateSlideTemplateProjectParams(
        template_id="SLIDE-navy-quarterly-review",
        category_code="PPT-CATE-business-report",
        tag_codes=[
            "purpose-quarterly-review",
            "style-business",
            "color-navy",
            "layout-dashboard",
            "mood-professional",
            "language-english",
        ],
        label=TemplateLabelText(zh_CN="深蓝经营复盘", en_US="Navy Business Review"),
        description=TemplateDescriptionText(zh_CN="适合经营复盘。", en_US="A reusable operating review template."),
        source=TemplateSourceParams(kind="derived", method="visual-reconstruction", file="source.pptx"),
        slides=[
            TemplateSlideParams(
                file="slides/cover.html",
                title="Business Review",
                layout="cover",
                description="Opening cover.",
            )
        ],
    )


def _write_source_pptx(path: Path, image_path: Path) -> None:
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    textbox = slide.shapes.add_textbox(Inches(1), Inches(0.8), Inches(6), Inches(1))
    textbox.text = "Quarterly review"
    textbox.text_frame.paragraphs[0].runs[0].font.name = "Arial"
    textbox.text_frame.paragraphs[0].runs[0].font.size = Pt(28)
    shape = slide.shapes.add_shape(1, Inches(1), Inches(2), Inches(3), Inches(1.2))
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(0x10, 0x2A, 0x43)
    slide.shapes.add_picture(str(image_path), Inches(7), Inches(1), width=Inches(4), height=Inches(3))
    presentation.save(path)
    package_only = BytesIO()
    Image.new("RGB", (64, 64), "#4f86c6").save(package_only, format="PNG")
    with zipfile.ZipFile(path, "a") as archive:
        archive.writestr("ppt/media/package-only.png", package_only.getvalue())


@pytest.mark.asyncio
async def test_create_project_puts_standard_files_at_workspace_root(tmp_path):
    tool = CreateSlideTemplateProject(base_dir=tmp_path)
    result = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), _params())

    assert result.ok
    template_dir = Path(result.data["template_directory"])
    assert result.data["template_directory"] == str(template_dir)
    assert result.data["requested_template_id"] == "SLIDE-navy-quarterly-review"
    assert re.fullmatch(r"SLIDE-navy-quarterly-review-[0-9A-F]{6}", result.data["template_id"])
    assert (template_dir / "template.json").exists()
    assert (template_dir / "visual-spec.md").exists()
    assert (template_dir / "theme.css").exists()
    assert (template_dir / "images").is_dir()
    assert (template_dir / "slides/cover.html").exists()
    assert (template_dir / WORK_DIR_NAME).is_dir()
    assert result.data["working_directory"] == str(template_dir / WORK_DIR_NAME)
    assert result.data["canvas_contract"] == {
        "selector": ".slide-container",
        "width_attribute": "data-width",
        "height_attribute": "data-height",
        "width": 1920,
        "height": 1080,
    }
    assert "main.slide-container" in result.content
    assert "template.json.source.canvas" in result.content
    assert "slide-template-scaffold" in (template_dir / "theme.css").read_text()
    scaffold = (template_dir / "slides/cover.html").read_text()
    assert '<main class="slide-container"' in scaffold
    assert 'data-width="1920" data-height="1080"' in scaffold
    metadata = json.loads((template_dir / "template.json").read_text())
    assert metadata["template_id"] == result.data["template_id"]
    assert metadata["category_code"] == "PPT-CATE-business-report"
    assert metadata["tag_codes"] == [
        "purpose-quarterly-review",
        "style-business",
        "color-navy",
        "layout-dashboard",
        "mood-professional",
        "language-english",
    ]


@pytest.mark.asyncio
async def test_create_project_generates_distinct_ids_for_repeated_base_names(tmp_path):
    tool = CreateSlideTemplateProject(base_dir=tmp_path)
    first = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), _params())
    second = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), _params())

    assert first.ok, first.content
    assert second.ok, second.content
    assert first.data["template_id"] != second.data["template_id"]
    assert first.data["template_directory"] != second.data["template_directory"]


@pytest.mark.asyncio
async def test_create_project_does_not_leave_a_directory_when_slide_plan_is_invalid(tmp_path):
    params = _params()
    params.slides = [params.slides[0], params.slides[0]]
    tool = CreateSlideTemplateProject(base_dir=tmp_path)

    result = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), params)

    assert not result.ok
    assert "Slide file paths must be unique" in result.content
    created_entries = await async_scandir(tmp_path)
    assert not [entry for entry in created_entries if entry.name.startswith("SLIDE-navy-quarterly-review-")]


@pytest.mark.asyncio
async def test_create_project_rejects_unknown_taxonomy_codes(tmp_path):
    params = _params()
    params.category_code = "PPT-CATE-not-a-real-category"
    tool = CreateSlideTemplateProject(base_dir=tmp_path)
    result = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), params)
    assert not result.ok
    assert "active bundled PPT category" in result.content

    params = _params()
    params.tag_codes = ["purpose-quarterly-review", "tag-does-not-exist"]
    result = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), params)
    assert not result.ok
    assert "unknown bundled codes" in result.content


@pytest.mark.asyncio
async def test_prepare_source_creates_multiscale_evidence_and_pptx_facts(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok
    template_dir = Path(create_result.data["template_directory"])

    page_image = tmp_path / "source-page.png"
    Image.new("RGB", (1920, 1080), "#102a43").save(page_image)
    source_pptx = tmp_path / "source.pptx"
    embedded_image = tmp_path / "embedded.png"
    Image.new("RGB", (120, 80), "#e6b566").save(embedded_image)
    _write_source_pptx(source_pptx, embedded_image)

    prepare_tool = PrepareSlideTemplateSource(base_dir=tmp_path)
    result = await prepare_tool.execute(
        ToolContext(tool_name=prepare_tool.name, arguments={}),
        PrepareSlideTemplateSourceParams(
            template_dir=create_result.data["template_id"],
            page_images=[str(page_image)],
            source_presentation=str(source_pptx),
        ),
    )

    assert result.ok, result.content
    analysis_root = template_dir / WORK_DIR_NAME / "source-analysis"
    assert (analysis_root / "full/slide-001.png").exists()
    assert len(list((analysis_root / "crops/slide-001").glob("*.png"))) == 9
    assert (analysis_root / "contact-sheet.png").exists()
    final_source_assets_dir = template_dir / "images/source-assets"
    assert not final_source_assets_dir.exists()
    structure = json.loads((analysis_root / "pptx-structure.json").read_text())
    assert structure["slide_count"] == 1
    assert structure["source_asset_count"] == 2
    assert any(shape.get("image") for shape in structure["slides"][0]["shapes"])
    assert list((analysis_root / "source-assets").glob("*"))
    manifest = json.loads((template_dir / WORK_DIR_NAME / "source-analysis.json").read_text())
    assert manifest["slides"][0]["visual_analysis"]["status"] == "pending"
    assert len(manifest["asset_catalog"]) == 2
    assert all(item["decision"] == "pending" for item in manifest["asset_catalog"])
    assert all(item["final_file"] is None for item in manifest["asset_catalog"])
    assert result.data["detail_crop_count"] == 9
    assert result.data["extracted_asset_count"] == 2
    assert len(result.data["asset_analysis_batches"]) == 1

@pytest.mark.asyncio
async def test_visual_reconstruction_requires_completed_source_analysis(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok
    template_dir = Path(create_result.data["template_directory"])
    await async_write_text(
        template_dir / "visual-spec.md",
        "# Visual Specification\n\nNavy report system.\n",
    )
    await async_write_text(
        template_dir / "theme.css",
        "html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }\n.slide { width: 1920px; height: 1080px; }\n",
    )
    await async_write_text(
        template_dir / "slides/cover.html",
        "<!doctype html><html><head><link rel=\"stylesheet\" href=\"../theme.css\"></head><body><main class=\"slide\"><h1 data-slot=\"title\">Business Review</h1><p data-slot=\"subtitle\">Q4</p><span data-slot=\"meta\">Strategy Team</span></main></body></html>",
    )
    from app.tools.slide_template_builder.common import validate_template_project

    with pytest.raises(Exception, match="completed source analysis"):
        await validate_template_project(template_dir)


@pytest.mark.asyncio
async def test_validate_project_rejects_mismatched_slide_container_dimensions(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok
    template_dir = Path(create_result.data["template_directory"])
    await async_write_text(template_dir / "visual-spec.md", "# Visual Specification\n\nNavy report system.\n")
    await async_write_text(template_dir / "theme.css", "html, body { margin: 0; }\n")
    await async_write_text(
        template_dir / "slides/cover.html",
        '<!doctype html><html><head><link rel="stylesheet" href="../theme.css"></head>'
        '<body><main class="slide-container" data-width="1080" data-height="1080">'
        '<h1 data-slot="title">Business Review</h1><p data-slot="subtitle">Q4</p>'
        '<span data-slot="meta">Strategy Team</span></main></body></html>',
    )

    from app.tools.slide_template_builder.common import validate_template_project

    with pytest.raises(Exception, match="must match source.canvas 1920x1080"):
        await validate_template_project(template_dir)


@pytest.mark.asyncio
async def test_completed_source_analysis_is_accepted_and_summarized(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok
    template_dir = Path(create_result.data["template_directory"])
    page_image = tmp_path / "source-page.png"
    Image.new("RGB", (1920, 1080), "#102a43").save(page_image)

    prepare_tool = PrepareSlideTemplateSource(base_dir=tmp_path)
    prepare_result = await prepare_tool.execute(
        ToolContext(tool_name=prepare_tool.name, arguments={}),
        PrepareSlideTemplateSourceParams(
            template_dir=create_result.data["template_id"],
            page_images=[str(page_image)],
        ),
    )
    assert prepare_result.ok, prepare_result.content

    await async_write_text(template_dir / "visual-spec.md", "# Visual Specification\n\nDark report system.\n")
    await async_write_text(
        template_dir / "theme.css",
        "html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }\n.slide { width: 1920px; height: 1080px; }\n",
    )
    await async_write_text(
        template_dir / "slides/cover.html",
        "<!doctype html><html><head><link rel=\"stylesheet\" href=\"../theme.css\"></head><body><main class=\"slide\"><h1 data-slot=\"title\">Business Review</h1><p data-slot=\"subtitle\">Q4</p><span data-slot=\"meta\">Strategy Team</span></main></body></html>",
    )

    manifest_path = template_dir / WORK_DIR_NAME / "source-analysis.json"
    manifest = await async_read_json(manifest_path)
    visual = manifest["slides"][0]["visual_analysis"]
    visual.update({
        "status": "complete",
        "summary": "A dark report cover with a strong left-aligned title anchor.",
        "visual_elements": [{"role": "title-anchor", "description": "Large left-aligned title."}],
        "style_tokens": {"accent": "#e6b566", "corner_radius_px": 0},
        "must_preserve": ["Dark navy canvas", "Left title anchor"],
    })
    await async_write_json(manifest_path, manifest, ensure_ascii=False, indent=2)

    from app.tools.slide_template_builder.common import validate_template_project

    validated = await validate_template_project(template_dir)
    assert validated.source_analysis_summary == {
        "completed": True,
        "reconstruction_mode": "hybrid",
        "source_slide_count": 1,
        "must_preserve_count": 2,
        "visual_element_count": 1,
        "pptx_structure_extracted": False,
        "source_asset_count": 0,
        "selected_source_asset_count": 0,
        "discarded_source_asset_count": 0,
        "selected_source_files": [],
        "referenced_source_asset_count": 0,
        "warnings": [],
    }


@pytest.mark.asyncio
async def test_hybrid_reconstruction_must_reference_selected_source_asset(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok
    template_dir = Path(create_result.data["template_directory"])
    page_image = tmp_path / "source-page.png"
    embedded_image = tmp_path / "embedded.png"
    source_pptx = tmp_path / "source.pptx"
    Image.new("RGB", (1920, 1080), "#102a43").save(page_image)
    Image.new("RGB", (120, 80), "#e6b566").save(embedded_image)
    _write_source_pptx(source_pptx, embedded_image)

    prepare_tool = PrepareSlideTemplateSource(base_dir=tmp_path)
    prepare_result = await prepare_tool.execute(
        ToolContext(tool_name=prepare_tool.name, arguments={}),
        PrepareSlideTemplateSourceParams(
            template_dir=create_result.data["template_id"],
            page_images=[str(page_image)],
            source_presentation=str(source_pptx),
        ),
    )
    assert prepare_result.ok, prepare_result.content
    manifest_path = template_dir / WORK_DIR_NAME / "source-analysis.json"
    manifest = await async_read_json(manifest_path)
    manifest["slides"][0]["visual_analysis"].update({
        "status": "complete",
        "summary": "Original image-led report cover.",
        "visual_elements": [{"role": "source-illustration"}],
        "style_tokens": {"canvas": "#102a43"},
        "must_preserve": ["Original illustration"],
    })
    await async_write_json(manifest_path, manifest, ensure_ascii=False, indent=2)
    catalog = manifest["asset_catalog"]
    select_tool = SelectSlideTemplateSourceAssets(base_dir=tmp_path)
    select_result = await select_tool.execute(
        ToolContext(tool_name=select_tool.name, arguments={}),
        SelectSlideTemplateSourceAssetsParams(
            template_dir=create_result.data["template_id"],
            decisions=[
                SourceAssetDecisionParams(
                    asset=catalog[0]["asset"],
                    decision="reuse",
                    asset_type="illustration",
                    quality="high",
                    rationale="The original artwork is the source visual anchor and will be used on the cover.",
                    target_name="cover-illustration.png",
                    intended_role="Cover visual anchor.",
                ),
                SourceAssetDecisionParams(
                    asset=catalog[1]["asset"],
                    decision="discard",
                    asset_type="other",
                    quality="poor",
                    rationale="The package-only image is not linked from the source slide and will not be used.",
                ),
            ],
        ),
    )
    assert select_result.ok, select_result.content
    await async_write_text(template_dir / "visual-spec.md", "# Visual Specification\n\nReuse source artwork.\n")
    await async_write_text(
        template_dir / "theme.css",
        "html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }\n.slide { width: 1920px; height: 1080px; }\n",
    )
    slide_without_asset = "<!doctype html><html><head><link rel=\"stylesheet\" href=\"../theme.css\"></head><body><main class=\"slide\"><h1 data-slot=\"title\">Business Review</h1><p data-slot=\"subtitle\">Q4</p><span data-slot=\"meta\">Strategy Team</span></main></body></html>"
    await async_write_text(template_dir / "slides/cover.html", slide_without_asset)

    from app.tools.slide_template_builder.common import validate_template_project

    with pytest.raises(Exception, match="Every selected source asset must be referenced"):
        await validate_template_project(template_dir)

    selected_manifest = await async_read_json(manifest_path)
    final_asset = next(
        item["final_file"]
        for item in selected_manifest["asset_catalog"]
        if item["decision"] == "reuse"
    )
    slide_with_asset = slide_without_asset.replace(
        "</main>",
        f'<img src="../{final_asset}" alt="Source illustration"></main>',
    )
    await async_write_text(template_dir / "slides/cover.html", slide_with_asset)
    validated = await validate_template_project(template_dir)
    assert validated.source_analysis_summary["referenced_source_asset_count"] == 1

    (template_dir / "images/source-assets/unused.png").write_bytes(b"unused")
    with pytest.raises(Exception, match="Unused files remain in images/source-assets/"):
        await validate_template_project(template_dir)


@pytest.mark.asyncio
async def test_finalize_project_generates_previews_beside_source(tmp_path):
    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        if not Path(playwright.chromium.executable_path).exists():
            pytest.skip("Playwright Chromium is not installed in this environment")
        try:
            browser = await playwright.chromium.launch(headless=True)
            await browser.close()
        except Exception as exc:
            pytest.skip(f"Playwright Chromium cannot launch in this environment: {exc}")
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok
    template_dir = Path(create_result.data["template_directory"])
    await async_write_text(
        template_dir / "visual-spec.md",
        "# Visual Specification\n\nNavy report system.\n",
    )
    await async_write_text(
        template_dir / "theme.css",
        ":root { --navy: #102a43; }\nhtml, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; }\n.slide { width: 1920px; height: 1080px; background: var(--navy); }\n",
    )
    await async_write_text(
        template_dir / "slides/cover.html",
        "<!doctype html><html><head><link rel=\"stylesheet\" href=\"../theme.css\"></head><body><main class=\"slide\"><h1 data-slot=\"title\" data-content-hint=\"Report title\">Business Review</h1><p data-slot=\"subtitle\" data-content-hint=\"Period\">Q4</p><span data-slot=\"meta\" data-content-hint=\"Presenter\">Strategy Team</span></main></body></html>",
    )

    finalize_tool = FinalizeSlideTemplate(base_dir=tmp_path)
    result = await finalize_tool.execute(
        ToolContext(tool_name=finalize_tool.name, arguments={}),
        FinalizeSlideTemplateParams(template_dir=create_result.data["template_id"]),
    )

    assert result.ok, result.content
    assert not (template_dir / WORK_DIR_NAME).exists()
    assert (template_dir / "previews/thumbnail.png").exists()
    assert (template_dir / "previews/collage.png").exists()
    assert (template_dir / "previews/slides/slide-001.png").exists()
    assert (template_dir / "template-assets.json").exists()
    with Image.open(template_dir / "previews/thumbnail.png") as image:
        assert image.size == (1280, 720)
    with Image.open(template_dir / "previews/slides/slide-001.png") as image:
        assert image.size == (1920, 1080)
    manifest = await async_read_json(template_dir / "template-assets.json")
    assert manifest["category_code"] == "PPT-CATE-business-report"
    assert manifest["tag_codes"] == _params().tag_codes
    assert manifest["local_files"]["thumbnail"] == "previews/thumbnail.png"
    assert manifest["backend_fields"]["thumbnail_file_key"] is None
    assert manifest["backend_fields"]["preview_image_file_keys"] == []
    assert manifest["backend_fields"]["status"] == 1
    assert manifest["backend_fields"]["category_code"] == "PPT-CATE-business-report"
    assert manifest["backend_fields"]["tag_codes"] == _params().tag_codes
    assert manifest["cleanup"]["removed_temporary_paths"] == [WORK_DIR_NAME]
    assert manifest["not_generated"]["template_file_key"]


@pytest.mark.asyncio
async def test_cleanup_template_intermediates_removes_only_canonical_work_dir(tmp_path):
    template_dir = tmp_path / "SLIDE-navy-quarterly-review"
    work_dir = template_dir / WORK_DIR_NAME
    final_images_dir = template_dir / "images"
    work_dir.mkdir(parents=True)
    final_images_dir.mkdir()
    (work_dir / "reference-render.png").write_bytes(b"temporary")
    (final_images_dir / "hero.webp").write_bytes(b"final")

    removed = await cleanup_template_intermediates(template_dir)

    assert removed == [WORK_DIR_NAME]
    assert not work_dir.exists()
    assert (final_images_dir / "hero.webp").exists()


def test_template_id_uses_backend_compatible_format():
    assert validate_template_id("SLIDE-navy-quarterly-review") == "SLIDE-navy-quarterly-review"
    assert validate_template_id("SLIDE-BUSINESS-MINIMAL") == "SLIDE-BUSINESS-MINIMAL"
    with pytest.raises(Exception):
        validate_template_id("SLIDE-中文模板")
    with pytest.raises(Exception):
        validate_template_id("PPT-navy-quarterly-review")


def test_preview_helpers_keep_expected_dimensions():
    source = BytesIO()
    Image.new("RGB", (1920, 1080), "#123456").save(source, format="PNG")
    thumbnail = _resize_png(source.getvalue(), (1280, 720))
    collage = _create_collage([source.getvalue()])
    with Image.open(BytesIO(thumbnail)) as image:
        assert image.size == (1280, 720)
    with Image.open(BytesIO(collage)) as image:
        assert image.size == (704, 424)
