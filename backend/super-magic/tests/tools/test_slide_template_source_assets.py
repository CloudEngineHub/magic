import zipfile
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from agentlang.context.tool_context import ToolContext
from app.tools.slide_template_builder import CreateSlideTemplateProject, PrepareSlideTemplateSource, SelectSlideTemplateSourceAssets
from app.tools.slide_template_builder.create_project import CreateSlideTemplateProjectParams
from app.tools.slide_template_builder.models import (
    TemplateDescriptionText,
    TemplateLabelText,
    TemplateSlideParams,
    TemplateSourceParams,
)
from app.tools.slide_template_builder.source_analysis import PrepareSlideTemplateSourceParams
from app.tools.slide_template_builder.source_asset_selection import (
    SelectSlideTemplateSourceAssetsParams,
    SourceAssetDecisionParams,
)
from app.utils.async_file_utils import async_read_json


def _workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / ".workspace"
    workspace.mkdir(exist_ok=True)
    return workspace


def _params() -> CreateSlideTemplateProjectParams:
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
        description=TemplateDescriptionText(
            zh_CN="适合经营复盘。", en_US="A reusable operating review template."
        ),
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


async def _prepare_with_assets(tmp_path: Path) -> tuple[Path, Path, dict]:
    create_tool = CreateSlideTemplateProject(base_dir=_workspace(tmp_path))
    created = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert created.ok, created.content
    template_dir = Path(created.data["template_directory"])
    page_image = tmp_path / "source-page.png"
    embedded_image = tmp_path / "embedded.png"
    source_pptx = tmp_path / "source.pptx"
    Image.new("RGB", (1920, 1080), "#102a43").save(page_image)
    Image.new("RGB", (120, 80), "#e6b566").save(embedded_image)
    _write_source_pptx(source_pptx, embedded_image)

    prepare_tool = PrepareSlideTemplateSource(base_dir=_workspace(tmp_path))
    prepared = await prepare_tool.execute(
        ToolContext(tool_name=prepare_tool.name, arguments={}),
        PrepareSlideTemplateSourceParams(
            template_dir=created.data["template_id"],
            page_images=[str(page_image)],
            source_presentation=str(source_pptx),
        ),
    )
    assert prepared.ok, prepared.content
    work_dir = Path(created.data["working_directory"])
    manifest_path = work_dir / "source-analysis.json"
    return template_dir, work_dir, await async_read_json(manifest_path)


@pytest.mark.asyncio
async def test_select_source_assets_copies_only_reviewed_reusable_candidates(tmp_path):
    template_dir, work_dir, manifest = await _prepare_with_assets(tmp_path)
    catalog = manifest["asset_catalog"]
    decisions = [
        SourceAssetDecisionParams(
            asset=catalog[0]["asset"],
            decision="reuse",
            asset_type="illustration",
            quality="high",
            rationale="The source artwork defines the visual anchor and will be used on the cover.",
            target_name="cover-illustration.png",
            intended_role="Cover visual anchor.",
        ),
        SourceAssetDecisionParams(
            asset=catalog[1]["asset"],
            decision="discard",
            asset_type="other",
            quality="poor",
            rationale="The package-only image is not used by any source slide and adds no reusable value.",
        ),
    ]
    select_tool = SelectSlideTemplateSourceAssets(base_dir=_workspace(tmp_path))
    result = await select_tool.execute(
        ToolContext(tool_name=select_tool.name, arguments={}),
        SelectSlideTemplateSourceAssetsParams(template_dir=template_dir.name, decisions=decisions),
    )

    assert result.ok, result.content
    final_assets = list((template_dir / "images/source-assets").glob("*"))
    assert [path.name for path in final_assets] == ["cover-illustration.png"]
    updated = await async_read_json(work_dir / "source-analysis.json")
    selected = next(item for item in updated["asset_catalog"] if item["decision"] == "reuse")
    discarded = next(item for item in updated["asset_catalog"] if item["decision"] == "discard")
    assert selected["final_file"] == "images/source-assets/cover-illustration.png"
    assert discarded["final_file"] is None
    assert result.data["selected_count"] == 1
    assert result.data["discarded_count"] == 1


@pytest.mark.asyncio
async def test_select_source_assets_requires_a_decision_for_every_candidate(tmp_path):
    template_dir, _work_dir, manifest = await _prepare_with_assets(tmp_path)
    select_tool = SelectSlideTemplateSourceAssets(base_dir=_workspace(tmp_path))
    result = await select_tool.execute(
        ToolContext(tool_name=select_tool.name, arguments={}),
        SelectSlideTemplateSourceAssetsParams(
            template_dir=template_dir.name,
            decisions=[
                SourceAssetDecisionParams(
                    asset=manifest["asset_catalog"][0]["asset"],
                    decision="discard",
                    asset_type="illustration",
                    quality="acceptable",
                    rationale="Not needed for this template layout.",
                )
            ],
        ),
    )

    assert not result.ok
    assert "exactly cover asset_catalog" in result.content
    assert not (template_dir / "images/source-assets").exists()


def test_source_asset_decision_rejects_poor_reuse():
    with pytest.raises(ValueError, match="poor-quality assets cannot be reused"):
        SourceAssetDecisionParams(
            asset="source-assets/asset.png",
            decision="reuse",
            asset_type="illustration",
            quality="poor",
            rationale="This is too blurry to use.",
            target_name="asset.png",
            intended_role="Cover artwork.",
        )
