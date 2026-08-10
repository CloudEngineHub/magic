"""Build visual evidence images for slide template source analysis."""

import math
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageDraw, ImageOps

from app.tools.slide_template_builder.errors import SlideTemplateBuilderError


@dataclass(frozen=True)
class CropArtifact:
    row: int
    column: int
    bounds: tuple[int, int, int, int]
    png: bytes


@dataclass(frozen=True)
class PageArtifacts:
    width: int
    height: int
    full_png: bytes
    crops: tuple[CropArtifact, ...]


def _png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def build_page_artifacts(data: bytes, columns: int, rows: int) -> PageArtifacts:
    with Image.open(BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    width, height = image.size
    if width < 320 or height < 180:
        raise SlideTemplateBuilderError(f"Source page image is too small for detailed analysis: {width}x{height}")
    cell_width = width / columns
    cell_height = height / rows
    overlap_x = cell_width * 0.1
    overlap_y = cell_height * 0.1
    crops = []
    for row in range(rows):
        for column in range(columns):
            left = max(0, math.floor(column * cell_width - overlap_x))
            top = max(0, math.floor(row * cell_height - overlap_y))
            right = min(width, math.ceil((column + 1) * cell_width + overlap_x))
            bottom = min(height, math.ceil((row + 1) * cell_height + overlap_y))
            crops.append(CropArtifact(
                row=row + 1,
                column=column + 1,
                bounds=(left, top, right, bottom),
                png=_png_bytes(image.crop((left, top, right, bottom))),
            ))
    return PageArtifacts(
        width=width,
        height=height,
        full_png=_png_bytes(image),
        crops=tuple(crops),
    )


def create_contact_sheet(pages: list[bytes]) -> bytes:
    columns = min(4, len(pages))
    rows = math.ceil(len(pages) / columns)
    tile_width, tile_height = 480, 270
    label_height = 28
    gap = 20
    padding = 24
    width = padding * 2 + columns * tile_width + (columns - 1) * gap
    height = padding * 2 + rows * (tile_height + label_height) + (rows - 1) * gap
    sheet = Image.new("RGB", (width, height), "#eef1f5")
    draw = ImageDraw.Draw(sheet)
    for index, data in enumerate(pages, 1):
        with Image.open(BytesIO(data)) as source:
            image = ImageOps.pad(source.convert("RGB"), (tile_width, tile_height), color="#ffffff")
        left = padding + ((index - 1) % columns) * (tile_width + gap)
        top = padding + ((index - 1) // columns) * (tile_height + label_height + gap)
        sheet.paste(image, (left, top))
        draw.text((left, top + tile_height + 6), f"Slide {index:03d}", fill="#1f2937")
    return _png_bytes(sheet)
