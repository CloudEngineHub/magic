import json
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from pptx import Presentation
from pptx.util import Inches

from agentlang.context.tool_context import ToolContext
from app.tools.slide_template_builder import CreateSlideTemplateProject, PrepareSlideTemplateSource
from app.tools.slide_template_builder.create_project import CreateSlideTemplateProjectParams
from app.tools.slide_template_builder.errors import SlideTemplateBuilderError
from app.tools.slide_template_builder.models import (
    TemplateCanvas,
    TemplateDescriptionText,
    TemplateLabelText,
    TemplateSlideParams,
    TemplateSourceParams,
)
from app.tools.slide_template_builder.pptx_structure import extract_pptx_structure
from app.tools.slide_template_builder.preview import _create_collage, capture_slide
from app.tools.slide_template_builder.source_analysis import PrepareSlideTemplateSourceParams


def _params() -> CreateSlideTemplateProjectParams:
    return CreateSlideTemplateProjectParams(
        template_id="SLIDE-square-source",
        category_code="PPT-CATE-business-report",
        tag_codes=["style-business"],
        label=TemplateLabelText(zh_CN="方形模板", en_US="Square Template"),
        description=TemplateDescriptionText(zh_CN="保留方形画布。", en_US="Preserves a square canvas."),
        source=TemplateSourceParams(kind="derived", method="visual-reconstruction", file="source.pptx"),
        slides=[
            TemplateSlideParams(
                file="slides/cover.html",
                title="Square Cover",
                layout="cover",
                description="Square opening cover.",
            )
        ],
    )


def _write_square_pptx(path: Path) -> None:
    presentation = Presentation()
    presentation.slide_width = Inches(10)
    presentation.slide_height = Inches(10)
    presentation.slides.add_slide(presentation.slide_layouts[6])
    presentation.save(path)


class FakePage:
    def __init__(self, slide_size: tuple[int, int]):
        self.slide_size = slide_size
        self.viewport = None
        self.clip = None

    async def set_viewport_size(self, viewport):
        self.viewport = viewport

    async def goto(self, *_args, **_kwargs):
        return None

    async def evaluate(self, expression):
        if expression == "document.fonts && document.fonts.ready":
            return None
        return {
            "scrollWidth": self.viewport["width"],
            "scrollHeight": self.viewport["height"],
            "bodyScrollWidth": self.viewport["width"],
            "bodyScrollHeight": self.viewport["height"],
            "brokenImages": [],
            "slideBounds": {"width": self.slide_size[0], "height": self.slide_size[1]},
            "viewport": self.viewport,
        }

    async def wait_for_timeout(self, _timeout):
        return None

    async def screenshot(self, *, clip, **_kwargs):
        self.clip = clip
        return b"png"


@pytest.mark.asyncio
async def test_create_project_preserves_square_source_canvas(tmp_path):
    params = _params()
    params.source.canvas.width = 1080
    params.source.canvas.height = 1080

    tool = CreateSlideTemplateProject(base_dir=tmp_path)
    result = await tool.execute(ToolContext(tool_name=tool.name, arguments={}), params)

    assert result.ok, result.content
    template_dir = Path(result.data["template_directory"])
    metadata = json.loads((template_dir / "template.json").read_text())
    assert metadata["source"]["canvas"] == {"width": 1080, "height": 1080}
    scaffold = (template_dir / "slides/cover.html").read_text()
    assert 'content="width=1080, height=1080"' in scaffold
    assert 'data-width="1080" data-height="1080"' in scaffold


@pytest.mark.asyncio
async def test_prepare_source_updates_canvas_when_rendered_pages_are_square(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok

    page_image = tmp_path / "square-source-page.png"
    Image.new("RGB", (1080, 1080), "#102a43").save(page_image)
    source_pptx = tmp_path / "square-source.pptx"
    _write_square_pptx(source_pptx)
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
    assert result.data["canvas"] == {"width": 1920, "height": 1920}
    metadata = json.loads((Path(create_result.data["template_directory"]) / "template.json").read_text())
    assert metadata["source"]["canvas"] == {"width": 1920, "height": 1920}
    assert "Canvas: 1920x1920" in result.content
    assert "preserve the source presentation aspect ratio" in result.content


@pytest.mark.asyncio
async def test_prepare_source_rejects_rendered_ratio_that_differs_from_pptx(tmp_path):
    create_tool = CreateSlideTemplateProject(base_dir=tmp_path)
    create_result = await create_tool.execute(ToolContext(tool_name=create_tool.name, arguments={}), _params())
    assert create_result.ok

    page_image = tmp_path / "widescreen-page.png"
    Image.new("RGB", (1920, 1080), "#102a43").save(page_image)
    source_pptx = tmp_path / "square-source.pptx"
    _write_square_pptx(source_pptx)

    prepare_tool = PrepareSlideTemplateSource(base_dir=tmp_path)
    result = await prepare_tool.execute(
        ToolContext(tool_name=prepare_tool.name, arguments={}),
        PrepareSlideTemplateSourceParams(
            template_dir=create_result.data["template_id"],
            page_images=[str(page_image)],
            source_presentation=str(source_pptx),
        ),
    )

    assert not result.ok
    assert "does not match the PPTX canvas 1920x1920" in result.content


def test_pptx_structure_preserves_square_slide_ratio(tmp_path):
    source_pptx = tmp_path / "square-source.pptx"
    _write_square_pptx(source_pptx)

    structure = extract_pptx_structure(source_pptx)

    assert structure.metadata["normalized_canvas"] == {"width": 1920, "height": 1920}


def test_square_collage_does_not_stretch_to_widescreen():
    square = BytesIO()
    Image.new("RGB", (1080, 1080), "#123456").save(square, format="PNG")

    collage = _create_collage([square.getvalue()], TemplateCanvas(width=1080, height=1080))

    with Image.open(BytesIO(collage)) as image:
        assert image.size == (424, 424)


@pytest.mark.asyncio
async def test_capture_slide_uses_declared_square_canvas(tmp_path):
    page = FakePage((1080, 1080))

    capture = await capture_slide(
        page,
        tmp_path / "cover.html",
        TemplateCanvas(width=1080, height=1080),
    )

    assert capture.screenshot == b"png"
    assert capture.inspection["slideBounds"] == {"width": 1080, "height": 1080}
    assert page.viewport == {"width": 1080, "height": 1080}
    assert page.clip == {"x": 0, "y": 0, "width": 1080, "height": 1080}


@pytest.mark.asyncio
async def test_capture_slide_rejects_widescreen_root_on_square_canvas(tmp_path):
    page = FakePage((1920, 1080))

    with pytest.raises(SlideTemplateBuilderError, match="source.canvas is 1080x1080"):
        await capture_slide(page, tmp_path / "cover.html", TemplateCanvas(width=1080, height=1080))
