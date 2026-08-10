"""Prepare multi-scale visual evidence and read-only PPTX structure for template reconstruction."""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, ClassVar, Dict, Optional

from PIL import Image, ImageDraw, ImageOps
from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.slide_template_builder.common import (
    ANALYSIS_DIR_NAME,
    SOURCE_ANALYSIS_FILE,
    SlideTemplateBuilderError,
    WORK_DIR_NAME,
    resolve_workspace_template_dir,
    validate_template_id,
)
from app.tools.slide_template_builder.models import ReconstructionMode
from app.tools.slide_template_builder.pptx_structure import extract_pptx_structure
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import (
    async_exists,
    async_is_file,
    async_mkdir,
    async_read_bytes,
    async_read_json,
    async_rmtree,
    async_write_bytes,
    async_write_json,
)

SUPPORTED_PRESENTATION_STRUCTURE_SUFFIXES = {".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"}


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


class PrepareSlideTemplateSourceParams(BaseToolParams):
    template_dir: str = Field(
        ...,
        description="""<!--zh: 已由 create_slide_template_project 创建的模板目录。-->
Template directory previously created by create_slide_template_project.""",
    )
    page_images: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="""<!--zh: 按源页面顺序排列的高分辨率整页图片路径。图片应来自文档转换工具，不要传 contact sheet 或缩略图。-->
High-resolution full-page image paths in source order. Use page renders returned by the document converter, not contact sheets or thumbnails.""",
    )
    source_presentation: Optional[str] = Field(
        None,
        description="""<!--zh: 可选的 OOXML 演示文件路径，用于只读提取文本框、字体、形状、图片、裁切和图层信息。支持 PPTX/PPTM/POTX/POTM/PPSX/PPSM；旧 PPT 应先通过 document-converter 转为 PPTX。-->
Optional OOXML presentation path for read-only extraction of text boxes, fonts, shapes, images, crops, and layer order. Supports PPTX/PPTM/POTX/POTM/PPSX/PPSM. Convert legacy PPT to PPTX through document-converter first.""",
    )
    reconstruction_mode: ReconstructionMode = Field(
        "hybrid",
        description="""<!--zh: 重建模式。high-fidelity 保留代表页细节；template-abstraction 强调可复用布局；hybrid 默认混合两者。-->
Reconstruction mode. high-fidelity preserves representative page details, template-abstraction prioritizes reusable layouts, and hybrid combines both.""",
    )
    crop_columns: int = Field(3, ge=2, le=4, description="Columns used for overlapping detail crops.")
    crop_rows: int = Field(3, ge=2, le=4, description="Rows used for overlapping detail crops.")

    @field_validator("template_dir")
    @classmethod
    def strip_template_dir(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("template_dir is required")
        return value

    @field_validator("page_images")
    @classmethod
    def normalize_page_images(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value for value in normalized):
            raise ValueError("page image paths cannot be empty")
        return normalized


def _png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _build_page_artifacts(data: bytes, columns: int, rows: int) -> PageArtifacts:
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


def _create_contact_sheet(pages: list[bytes]) -> bytes:
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


def _source_asset_slide_indices(structure: dict[str, Any]) -> dict[str, list[int]]:
    indices: dict[str, set[int]] = {}

    def visit(shapes: list[dict[str, Any]], slide_index: int) -> None:
        for shape in shapes:
            image = shape.get("image") if isinstance(shape.get("image"), dict) else {}
            asset = image.get("asset")
            if isinstance(asset, str) and asset:
                indices.setdefault(asset, set()).add(slide_index)
            children = shape.get("children")
            if isinstance(children, list):
                visit([child for child in children if isinstance(child, dict)], slide_index)

    for slide in structure.get("slides", []):
        if not isinstance(slide, dict):
            continue
        slide_index = int(slide.get("index") or 0)
        shapes = slide.get("shapes")
        if slide_index > 0 and isinstance(shapes, list):
            visit([shape for shape in shapes if isinstance(shape, dict)], slide_index)
    return {asset: sorted(slides) for asset, slides in indices.items()}


def _source_asset_metadata(data: bytes) -> dict[str, Any]:
    try:
        with Image.open(BytesIO(data)) as image:
            width, height = image.size
            return {
                "width": width,
                "height": height,
                "aspect_ratio": round(width / height, 4) if height else None,
                "format": image.format,
                "mode": image.mode,
                "has_transparency": "A" in image.getbands() or "transparency" in image.info,
                "quality_flags": [
                    flag
                    for flag, enabled in (
                        ("small-dimensions", width < 256 or height < 128),
                        ("very-small-dimensions", width < 128 or height < 64),
                    )
                    if enabled
                ],
            }
    except (OSError, ValueError):
        return {
            "width": None,
            "height": None,
            "aspect_ratio": None,
            "format": None,
            "mode": None,
            "has_transparency": None,
            "quality_flags": ["needs-format-review"],
        }


@tool(name="prepare_slide_template_source")
class PrepareSlideTemplateSource(WorkspaceTool[PrepareSlideTemplateSourceParams]):
    """<!--zh
    为模板视觉重建准备高分辨率整页图、重叠局部裁剪、联系表和可选的 PPTX 只读结构数据。不会生成 HTML。
    -->
    Prepare high-resolution full pages, overlapping detail crops, a contact sheet, and optional read-only PPTX structure for template reconstruction. This tool does not generate HTML.
    """

    name = "prepare_slide_template_source"
    code_mode_only: ClassVar[bool] = True

    async def execute(self, tool_context: ToolContext, params: PrepareSlideTemplateSourceParams) -> ToolResult:
        template_dir = resolve_workspace_template_dir(Path(self.base_dir), params.template_dir)
        analysis_root = template_dir / WORK_DIR_NAME / ANALYSIS_DIR_NAME
        analysis_file = template_dir / WORK_DIR_NAME / SOURCE_ANALYSIS_FILE
        try:
            metadata_path = template_dir / "template.json"
            if not await async_is_file(metadata_path):
                raise SlideTemplateBuilderError("Template project must be created before source preparation.")
            metadata = await async_read_json(metadata_path)
            template_id = validate_template_id(str(metadata.get("template_id") or ""))
            if template_dir.name != template_id:
                raise SlideTemplateBuilderError("Template directory name must exactly match template_id.")
            if not await async_exists(template_dir / WORK_DIR_NAME):
                await async_mkdir(template_dir / WORK_DIR_NAME, parents=True, exist_ok=False)
            page_paths = [self.resolve_path(value).resolve(strict=False) for value in params.page_images]
            for page_path in page_paths:
                if not await async_is_file(page_path):
                    raise SlideTemplateBuilderError(f"Source page image does not exist: {page_path}")

            if await async_exists(analysis_root):
                await async_rmtree(analysis_root)
            await async_mkdir(analysis_root / "full", parents=True, exist_ok=False)
            await async_mkdir(analysis_root / "crops", parents=True, exist_ok=False)

            slide_records = []
            analysis_batches = []
            full_page_buffers = []
            for index, page_path in enumerate(page_paths, 1):
                source_bytes = await async_read_bytes(page_path)
                artifacts = await asyncio.to_thread(
                    _build_page_artifacts,
                    source_bytes,
                    params.crop_columns,
                    params.crop_rows,
                )
                full_relative = f"{WORK_DIR_NAME}/{ANALYSIS_DIR_NAME}/full/slide-{index:03d}.png"
                full_path = template_dir / full_relative
                await async_write_bytes(full_path, artifacts.full_png)
                full_page_buffers.append(artifacts.full_png)

                crop_records = []
                crop_paths = []
                crop_dir = analysis_root / "crops" / f"slide-{index:03d}"
                await async_mkdir(crop_dir, parents=True, exist_ok=False)
                for crop in artifacts.crops:
                    crop_name = f"region-r{crop.row:02d}-c{crop.column:02d}.png"
                    crop_path = crop_dir / crop_name
                    await async_write_bytes(crop_path, crop.png)
                    crop_relative = f"{WORK_DIR_NAME}/{ANALYSIS_DIR_NAME}/crops/slide-{index:03d}/{crop_name}"
                    crop_records.append({
                        "file": crop_relative,
                        "row": crop.row,
                        "column": crop.column,
                        "bounds": {
                            "left": crop.bounds[0],
                            "top": crop.bounds[1],
                            "right": crop.bounds[2],
                            "bottom": crop.bounds[3],
                        },
                    })
                    crop_paths.append(str(crop_path))
                slide_records.append({
                    "source_index": index,
                    "source_image": page_path.name,
                    "full_image": full_relative,
                    "source_size": {"width": artifacts.width, "height": artifacts.height},
                    "detail_crops": crop_records,
                    "visual_analysis": {
                        "status": "pending",
                        "summary": "",
                        "background": {},
                        "palette": [],
                        "typography": [],
                        "composition": {},
                        "visual_elements": [],
                        "image_details": [],
                        "style_tokens": {},
                        "must_preserve": [],
                        "uncertainties": [],
                    },
                })
                analysis_batches.append({
                    "source_index": index,
                    "images": [str(full_path), *crop_paths],
                })

            contact_sheet = await asyncio.to_thread(_create_contact_sheet, full_page_buffers)
            contact_sheet_path = analysis_root / "contact-sheet.png"
            await async_write_bytes(contact_sheet_path, contact_sheet)

            structure_path = None
            structure_slide_count = None
            extracted_asset_count = 0
            asset_catalog = []
            asset_analysis_paths = []
            if params.source_presentation:
                presentation_path = self.resolve_path(params.source_presentation).resolve(strict=False)
                if not await async_is_file(presentation_path):
                    raise SlideTemplateBuilderError(f"Source presentation does not exist: {presentation_path}")
                if presentation_path.suffix.lower() not in SUPPORTED_PRESENTATION_STRUCTURE_SUFFIXES:
                    raise SlideTemplateBuilderError(
                        "source_presentation must be an OOXML presentation. Convert legacy PPT to PPTX first."
                    )
                structure = await asyncio.to_thread(extract_pptx_structure, presentation_path)
                structure_path = analysis_root / "pptx-structure.json"
                await async_write_json(structure_path, structure.metadata, ensure_ascii=False, indent=2)
                structure_slide_count = structure.metadata["slide_count"]
                slide_indices = _source_asset_slide_indices(structure.metadata)
                for asset in structure.assets:
                    source_path = analysis_root / asset.relative_path
                    await async_write_bytes(source_path, asset.data)
                    source_slides = slide_indices.get(asset.relative_path, [])
                    asset_metadata = await asyncio.to_thread(_source_asset_metadata, asset.data)
                    if not source_slides:
                        asset_metadata["quality_flags"].append("not-linked-from-slide-shapes")
                    asset_catalog.append({
                        "source_file": f"{WORK_DIR_NAME}/{ANALYSIS_DIR_NAME}/{asset.relative_path}",
                        "asset": asset.relative_path,
                        "sha256": asset.sha256,
                        "size_bytes": len(asset.data),
                        "source_slides": source_slides,
                        "usage_count": len(source_slides),
                        "metadata": asset_metadata,
                        "decision": "pending",
                        "asset_type": "unknown",
                        "quality": "unknown",
                        "rationale": "",
                        "intended_role": "",
                        "target_name": None,
                        "final_file": None,
                    })
                    asset_analysis_paths.append(str(source_path))
                extracted_asset_count = len(structure.assets)

            warnings = []
            if structure_slide_count is not None and structure_slide_count != len(slide_records):
                warnings.append(
                    f"Rendered page count ({len(slide_records)}) differs from PPTX slide count ({structure_slide_count})."
                )
            manifest = {
                "schema_version": "1.0",
                "reconstruction_mode": params.reconstruction_mode,
                "source_presentation": Path(params.source_presentation).name if params.source_presentation else "",
                "capture": {
                    "contact_sheet": f"{WORK_DIR_NAME}/{ANALYSIS_DIR_NAME}/contact-sheet.png",
                    "crop_grid": {"columns": params.crop_columns, "rows": params.crop_rows, "overlap_ratio": 0.1},
                    "pptx_structure": (
                        f"{WORK_DIR_NAME}/{ANALYSIS_DIR_NAME}/pptx-structure.json" if structure_path else None
                    ),
                    "source_assets_dir": f"{WORK_DIR_NAME}/{ANALYSIS_DIR_NAME}/source-assets",
                },
                "slides": slide_records,
                "asset_catalog": asset_catalog,
                "warnings": warnings,
            }
            await async_write_json(analysis_file, manifest, ensure_ascii=False, indent=2)

            data = {
                "template_directory": str(template_dir),
                "working_directory": str(template_dir / WORK_DIR_NAME),
                "source_analysis": str(analysis_file),
                "contact_sheet": str(contact_sheet_path),
                "pptx_structure": str(structure_path) if structure_path else None,
                "reconstruction_mode": params.reconstruction_mode,
                "slide_count": len(slide_records),
                "detail_crop_count": len(slide_records) * params.crop_columns * params.crop_rows,
                "extracted_asset_count": extracted_asset_count,
                "asset_catalog": asset_catalog,
                "asset_analysis_batches": [
                    asset_analysis_paths[index:index + 8]
                    for index in range(0, len(asset_analysis_paths), 8)
                ],
                "analysis_batches": analysis_batches,
                "warnings": warnings,
            }
            return ToolResult(
                content=(
                    f"Slide template source prepared for {len(slide_records)} page(s) in {params.reconstruction_mode} mode. "
                    f"Extracted {extracted_asset_count} source asset candidate(s) for review. Analyze every page, crop, and asset, "
                    f"then call select_slide_template_source_assets before authoring when candidates exist."
                ),
                data=data,
                extra_info=data,
            )
        except SlideTemplateBuilderError as exc:
            return ToolResult.error(str(exc))
        except Exception as exc:
            return ToolResult.error(f"Failed to prepare slide template source: {exc}")

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        template_dir = str((arguments or {}).get("template_dir") or "-")
        return {
            "tool_name": tool_name,
            "action": i18n.translate("prepare_slide_template_source", category="tool.actions"),
            "remark": i18n.translate(
                "prepare_slide_template_source.before",
                category="tool.messages",
                template_dir=template_dir,
            ),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] | None = None,
    ) -> Dict:
        template_dir = str((arguments or {}).get("template_dir") or "-")
        key = "prepare_slide_template_source.after_success" if result.ok else "prepare_slide_template_source.after_failed"
        return {
            "tool_name": tool_name,
            "action": i18n.translate("prepare_slide_template_source", category="tool.actions"),
            "remark": i18n.translate(key, category="tool.messages", template_dir=template_dir),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        data = result.data if isinstance(result.data, dict) else {}
        if result.ok:
            content = "\n".join([
                "# Slide template source analysis",
                "",
                f"- Mode: `{data.get('reconstruction_mode', '')}`",
                f"- Source pages: {data.get('slide_count', 0)}",
                f"- Detail crops: {data.get('detail_crop_count', 0)}",
                f"- Extracted PPTX assets: {data.get('extracted_asset_count', 0)}",
                f"- Source assets pending review: {data.get('extracted_asset_count', 0)}",
                f"- Analysis manifest: `{data.get('source_analysis', '')}`",
            ])
        else:
            content = f"# Slide template source preparation failed\n\n{result.content}"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slide_template_source_analysis.md", content=content),
        )
