"""Shared validation and rendering helpers for slide template tools."""

import asyncio
import re
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

from app.tools.slide_template_builder.models import (
    BACKEND_CATEGORY_CODE_PATTERN,
    BACKEND_TEMPLATE_ID_PATTERN,
    LAYOUT_PATTERN,
    SLIDE_FILE_PATTERN,
)
from app.tools.slide_template_builder.taxonomy import active_category_codes, tag_records_by_code
from app.utils.async_file_utils import (
    async_exists,
    async_read_json,
    async_read_text,
    async_rmtree,
    async_scandir,
    async_write_bytes,
)

SLIDE_SIZE = (1920, 1080)
THUMBNAIL_SIZE = (1280, 720)
COLLAGE_TILE_SIZE = (640, 360)
COLLAGE_COLUMNS = 3
COLLAGE_GAP = 24
COLLAGE_PADDING = 32
COLLAGE_BACKGROUND = "#f5f7fa"
MAX_COLLAGE_SLIDES = 9
SCAFFOLD_MARKER = "slide-template-scaffold"
WORK_DIR_NAME = ".template-work"
ANALYSIS_DIR_NAME = "source-analysis"
SOURCE_ANALYSIS_FILE = "source-analysis.json"
RECONSTRUCTION_MODES = {"high-fidelity", "template-abstraction", "hybrid"}


class SlideTemplateBuilderError(Exception):
    """User-correctable slide template project error."""


@dataclass(frozen=True)
class ValidatedTemplate:
    template_dir: Path
    metadata: dict[str, Any]
    slides: list[dict[str, Any]]
    source_analysis_summary: dict[str, Any] | None


def resolve_workspace_template_dir(base_dir: Path, value: str) -> Path:
    raw_path = Path(value.strip())
    candidate = raw_path if raw_path.is_absolute() else base_dir / raw_path
    resolved = candidate.resolve(strict=False)
    workspace = base_dir.resolve(strict=False)
    try:
        resolved.relative_to(workspace)
    except ValueError as exc:
        raise SlideTemplateBuilderError("Template directory must stay inside the workspace.") from exc
    return resolved


def validate_template_id(value: str) -> str:
    template_id = value.strip()
    if not re.fullmatch(BACKEND_TEMPLATE_ID_PATTERN, template_id):
        raise SlideTemplateBuilderError(
            "template_id must match the backend format: SLIDE- followed by alphanumeric kebab-case segments."
        )
    return template_id


def generate_unique_template_id(base_id: str) -> str:
    """Append a short uppercase UUID-derived suffix to a validated semantic ID."""
    semantic_id = validate_template_id(base_id)
    return f"{semantic_id}-{uuid.uuid4().hex[:6].upper()}"


def validate_taxonomy_selection(category_code: Any, tag_codes: Any) -> tuple[str, list[str]]:
    category = str(category_code or "").strip()
    if category not in active_category_codes():
        raise SlideTemplateBuilderError(
            f"category_code is not an active bundled PPT category: {category or '<empty>'}. "
            "Use the taxonomy query script to select an exact code."
        )
    if not isinstance(tag_codes, list) or not tag_codes:
        raise SlideTemplateBuilderError("tag_codes must contain at least one bundled tag code.")
    normalized = [str(code).strip() for code in tag_codes]
    if any(not code for code in normalized):
        raise SlideTemplateBuilderError("tag_codes cannot contain empty values.")
    if len(normalized) != len(set(normalized)):
        raise SlideTemplateBuilderError("tag_codes cannot contain duplicates.")
    records = tag_records_by_code()
    unknown = [code for code in normalized if code not in records]
    if unknown:
        raise SlideTemplateBuilderError(
            f"tag_codes contain unknown bundled codes: {', '.join(unknown)}. "
            "Use the taxonomy query script to select exact codes."
        )
    return category, normalized


def safe_slide_path(template_dir: Path, relative_path: str) -> Path:
    if not re.fullmatch(SLIDE_FILE_PATTERN, relative_path):
        raise SlideTemplateBuilderError(f"Invalid slide file path: {relative_path}")
    resolved = (template_dir / relative_path).resolve(strict=False)
    slides_root = (template_dir / "slides").resolve(strict=False)
    try:
        resolved.relative_to(slides_root)
    except ValueError as exc:
        raise SlideTemplateBuilderError(f"Slide path escapes slides directory: {relative_path}") from exc
    return resolved


def _required_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise SlideTemplateBuilderError(f"Missing required template field: {field_name}")
    return text


def _resolve_analysis_artifact(template_dir: Path, relative_path: str) -> Path:
    resolved = (template_dir / relative_path).resolve(strict=False)
    analysis_root = (template_dir / WORK_DIR_NAME / ANALYSIS_DIR_NAME).resolve(strict=False)
    try:
        resolved.relative_to(analysis_root)
    except ValueError as exc:
        raise SlideTemplateBuilderError(f"Source analysis path escapes its working directory: {relative_path}") from exc
    return resolved


def _resolve_template_image_asset(template_dir: Path, relative_path: str) -> Path:
    resolved = (template_dir / relative_path).resolve(strict=False)
    images_root = (template_dir / "images").resolve(strict=False)
    try:
        resolved.relative_to(images_root)
    except ValueError as exc:
        raise SlideTemplateBuilderError(f"Source asset path must stay inside images/: {relative_path}") from exc
    return resolved


async def _validate_source_analysis(
    template_dir: Path,
    metadata: dict[str, Any],
) -> dict[str, Any] | None:
    source = metadata.get("source") if isinstance(metadata.get("source"), dict) else {}
    if source.get("method") != "visual-reconstruction":
        return None

    analysis_path = template_dir / WORK_DIR_NAME / SOURCE_ANALYSIS_FILE
    if not await async_exists(analysis_path):
        existing_manifest_path = template_dir / "template-assets.json"
        if await async_exists(existing_manifest_path):
            existing_manifest = await async_read_json(existing_manifest_path)
            existing_summary = existing_manifest.get("source_analysis")
            if isinstance(existing_summary, dict) and existing_summary.get("completed") is True:
                return existing_summary
        raise SlideTemplateBuilderError(
            "Visual reconstruction requires completed source analysis. Call prepare_slide_template_source first."
        )

    analysis = await async_read_json(analysis_path)
    mode = str(analysis.get("reconstruction_mode") or "")
    if mode not in RECONSTRUCTION_MODES:
        raise SlideTemplateBuilderError("source-analysis.json reconstruction_mode is invalid.")
    analysis_slides = analysis.get("slides")
    if not isinstance(analysis_slides, list) or not analysis_slides:
        raise SlideTemplateBuilderError("source-analysis.json must contain analyzed source slides.")

    asset_catalog = analysis.get("asset_catalog")
    if asset_catalog is None:
        asset_catalog = []
    if not isinstance(asset_catalog, list):
        raise SlideTemplateBuilderError("source-analysis.json asset_catalog must be an array.")
    selected_asset_count = 0
    discarded_asset_count = 0
    selected_source_files = []
    for index, asset in enumerate(asset_catalog, 1):
        if not isinstance(asset, dict):
            raise SlideTemplateBuilderError(f"Source asset {index} must be an object.")
        decision = str(asset.get("decision") or "")
        quality = str(asset.get("quality") or "")
        rationale = str(asset.get("rationale") or "").strip()
        if decision == "pending":
            raise SlideTemplateBuilderError(
                f"Source asset review is incomplete for {asset.get('asset') or index}. "
                "Call select_slide_template_source_assets first."
            )
        if decision not in {"reuse", "discard"}:
            raise SlideTemplateBuilderError(f"Source asset {index} has an invalid decision.")
        if quality not in {"high", "acceptable", "poor"}:
            raise SlideTemplateBuilderError(f"Source asset {index} has an invalid quality rating.")
        if not rationale:
            raise SlideTemplateBuilderError(f"Source asset {index} must include a review rationale.")
        if decision == "reuse":
            if quality == "poor":
                raise SlideTemplateBuilderError(f"Poor-quality source asset cannot be selected: {asset.get('asset')}")
            final_file = str(asset.get("final_file") or "")
            if not final_file or not await async_exists(_resolve_template_image_asset(template_dir, final_file)):
                raise SlideTemplateBuilderError(f"Selected source asset is missing: {final_file or '<empty>'}")
            selected_asset_count += 1
            selected_source_files.append(final_file)
        else:
            if asset.get("final_file"):
                raise SlideTemplateBuilderError(f"Discarded source asset must not have a final file: {asset.get('asset')}")
            discarded_asset_count += 1

    must_preserve_count = 0
    visual_element_count = 0
    for index, slide in enumerate(analysis_slides, 1):
        if not isinstance(slide, dict):
            raise SlideTemplateBuilderError(f"Source analysis slide {index} must be an object.")
        full_image = str(slide.get("full_image") or "")
        if not full_image or not await async_exists(_resolve_analysis_artifact(template_dir, full_image)):
            raise SlideTemplateBuilderError(f"Source analysis full image is missing for slide {index}.")
        crops = slide.get("detail_crops")
        if not isinstance(crops, list) or len(crops) < 4:
            raise SlideTemplateBuilderError(f"Source analysis needs at least four detail crops for slide {index}.")
        for crop in crops:
            crop_file = str(crop.get("file") or "") if isinstance(crop, dict) else ""
            if not crop_file or not await async_exists(_resolve_analysis_artifact(template_dir, crop_file)):
                raise SlideTemplateBuilderError(f"Source analysis crop is missing for slide {index}.")
        visual = slide.get("visual_analysis")
        if not isinstance(visual, dict) or visual.get("status") != "complete":
            raise SlideTemplateBuilderError(f"Source visual analysis is incomplete for slide {index}.")
        must_preserve = visual.get("must_preserve")
        visual_elements = visual.get("visual_elements")
        style_tokens = visual.get("style_tokens")
        if not isinstance(must_preserve, list) or not must_preserve:
            raise SlideTemplateBuilderError(f"Source analysis must list must_preserve details for slide {index}.")
        if not isinstance(visual_elements, list) or not visual_elements:
            raise SlideTemplateBuilderError(f"Source analysis must list visual elements for slide {index}.")
        if not isinstance(style_tokens, dict) or not style_tokens:
            raise SlideTemplateBuilderError(f"Source analysis must record style tokens for slide {index}.")
        must_preserve_count += len(must_preserve)
        visual_element_count += len(visual_elements)

    capture = analysis.get("capture") if isinstance(analysis.get("capture"), dict) else {}
    return {
        "completed": True,
        "reconstruction_mode": mode,
        "source_slide_count": len(analysis_slides),
        "must_preserve_count": must_preserve_count,
        "visual_element_count": visual_element_count,
        "pptx_structure_extracted": bool(capture.get("pptx_structure")),
        "source_asset_count": len(asset_catalog),
        "selected_source_asset_count": selected_asset_count,
        "discarded_source_asset_count": discarded_asset_count,
        "selected_source_files": selected_source_files,
        "warnings": analysis.get("warnings") if isinstance(analysis.get("warnings"), list) else [],
    }


async def validate_template_project(template_dir: Path) -> ValidatedTemplate:
    required_paths = [
        template_dir / "template.json",
        template_dir / "visual-spec.md",
        template_dir / "theme.css",
        template_dir / "images",
        template_dir / "slides",
    ]
    missing = [str(path.name) for path in required_paths if not await async_exists(path)]
    if missing:
        raise SlideTemplateBuilderError(f"Template structure is incomplete: {', '.join(missing)}")

    metadata = await async_read_json(template_dir / "template.json")
    template_id = validate_template_id(str(metadata.get("template_id") or ""))
    if template_dir.name != template_id:
        raise SlideTemplateBuilderError("Template directory name must exactly match template_id.")
    if metadata.get("schema_version") != "1.0":
        raise SlideTemplateBuilderError("schema_version must be 1.0.")
    category_code, _ = validate_taxonomy_selection(
        metadata.get("category_code"), metadata.get("tag_codes")
    )
    if not re.fullmatch(BACKEND_CATEGORY_CODE_PATTERN, category_code):
        raise SlideTemplateBuilderError("category_code does not match the backend category code format.")

    for field_name in ("label", "description"):
        value = metadata.get(field_name)
        if not isinstance(value, dict):
            raise SlideTemplateBuilderError(f"{field_name} must be an object.")
        _required_text(value.get("zh_CN"), f"{field_name}.zh_CN")
        _required_text(value.get("en_US"), f"{field_name}.en_US")

    files = metadata.get("files")
    expected_files = {
        "visual_spec": "visual-spec.md",
        "theme_css": "theme.css",
        "slides_dir": "slides",
        "images_dir": "images",
    }
    if files != expected_files:
        raise SlideTemplateBuilderError("template.json files must use the standard slide template paths.")

    source = metadata.get("source")
    if not isinstance(source, dict):
        raise SlideTemplateBuilderError("source must be an object.")
    if source.get("kind") not in {"original", "derived"}:
        raise SlideTemplateBuilderError("source.kind must be original or derived.")
    if source.get("method") not in {
        "manual", "brief-generator", "image-rebuild", "html-import",
        "visual-reconstruction", "project-extract",
    }:
        raise SlideTemplateBuilderError("source.method is invalid.")
    source_file = str(source.get("file") or "")
    if "/" in source_file or "\\" in source_file:
        raise SlideTemplateBuilderError("source.file must be a basename.")
    if source.get("canvas") != {"width": 1920, "height": 1080}:
        raise SlideTemplateBuilderError("source.canvas must be 1920x1080.")

    slides = metadata.get("slides")
    if not isinstance(slides, list) or not slides:
        raise SlideTemplateBuilderError("template.json slides must contain at least one page.")
    seen_files: set[str] = set()
    for index, slide in enumerate(slides, 1):
        if not isinstance(slide, dict):
            raise SlideTemplateBuilderError(f"Slide {index} metadata must be an object.")
        relative_path = str(slide.get("file") or "")
        if relative_path in seen_files:
            raise SlideTemplateBuilderError(f"Duplicate slide file: {relative_path}")
        seen_files.add(relative_path)
        slide_path = safe_slide_path(template_dir, relative_path)
        if not await async_exists(slide_path):
            raise SlideTemplateBuilderError(f"Declared slide file does not exist: {relative_path}")
        _required_text(slide.get("title"), f"slides[{index}].title")
        layout = str(slide.get("layout") or "")
        if not re.fullmatch(LAYOUT_PATTERN, layout):
            raise SlideTemplateBuilderError(f"Invalid slide layout: {layout}")
        _required_text(slide.get("description"), f"slides[{index}].description")

    texts = [
        await async_read_text(template_dir / "visual-spec.md"),
        await async_read_text(template_dir / "theme.css"),
    ]
    for item in slides:
        slide_text = await async_read_text(safe_slide_path(template_dir, item["file"]))
        if not re.search(r'<link\b[^>]*href=["\']\.\./theme\.css(?:["\']|\?)', slide_text, re.IGNORECASE):
            raise SlideTemplateBuilderError(f"Slide must load ../theme.css: {item['file']}")
        if len(re.findall(r'\bdata-slot=["\']', slide_text, re.IGNORECASE)) < 3:
            raise SlideTemplateBuilderError(f"Slide must expose at least three editable data-slot regions: {item['file']}")
        texts.append(slide_text)
    if any(SCAFFOLD_MARKER in text for text in texts):
        raise SlideTemplateBuilderError("Template scaffold markers remain. Replace every scaffold file before finalizing.")

    forbidden_fragments = (
        "Converted Slide", "legacy-frame", "legacy-stage", "preview-header",
        "slides-grid", "pptx-to-html", "convert_pptx_to_slide_template",
    )
    combined = "\n".join(texts)
    residue = next((item for item in forbidden_fragments if item in combined), "")
    if residue:
        raise SlideTemplateBuilderError(f"Legacy conversion residue found: {residue}")
    if re.search(r"(?:src|href)=[\"'](?:https?:|file:|/)", combined, re.IGNORECASE):
        raise SlideTemplateBuilderError("Template pages must use local relative assets only.")
    if re.search(r"url\(\s*[\"']?(?:https?:|file:|/)", combined, re.IGNORECASE):
        raise SlideTemplateBuilderError("Template styles must use local relative assets only.")

    unexpected = []
    for item in await async_scandir(template_dir / "slides"):
        if item.is_file() and Path(item.name).suffix.lower() == ".html":
            relative = f"slides/{item.name}"
            if relative not in seen_files:
                unexpected.append(relative)
    if unexpected:
        raise SlideTemplateBuilderError(f"Unindexed slide files found: {', '.join(sorted(unexpected))}")

    source_analysis_summary = await _validate_source_analysis(template_dir, metadata)
    if source_analysis_summary:
        selected_source_files = source_analysis_summary.get("selected_source_files")
        if not isinstance(selected_source_files, list):
            selected_source_files = []
        referenced_source_assets = [
            path
            for path in selected_source_files
            if isinstance(path, str)
            and any(candidate in combined for candidate in (path, f"../{path}"))
        ]
        source_analysis_summary["referenced_source_asset_count"] = len(referenced_source_assets)
        unreferenced_source_assets = sorted(set(selected_source_files) - set(referenced_source_assets))
        if unreferenced_source_assets:
            raise SlideTemplateBuilderError(
                "Every selected source asset must be referenced by the final HTML or CSS. Unused assets: "
                + ", ".join(unreferenced_source_assets)
            )
        source_assets_dir = template_dir / "images" / "source-assets"
        unexpected_source_assets = []
        if await async_exists(source_assets_dir):
            for item in await async_scandir(source_assets_dir):
                if item.is_file():
                    relative = f"images/source-assets/{item.name}"
                    if relative not in selected_source_files:
                        unexpected_source_assets.append(relative)
                elif item.is_dir():
                    unexpected_source_assets.append(f"images/source-assets/{item.name}/")
        if unexpected_source_assets:
            raise SlideTemplateBuilderError(
                "Unused files remain in images/source-assets/: " + ", ".join(sorted(unexpected_source_assets))
            )
    return ValidatedTemplate(
        template_dir=template_dir,
        metadata=metadata,
        slides=slides,
        source_analysis_summary=source_analysis_summary,
    )


async def capture_slide(page: Any, slide_path: Path) -> tuple[bytes, dict[str, Any]]:
    await page.set_viewport_size({"width": SLIDE_SIZE[0], "height": SLIDE_SIZE[1]})
    await page.goto(slide_path.as_uri(), wait_until="domcontentloaded", timeout=20000)
    await page.evaluate("document.fonts && document.fonts.ready")
    await page.wait_for_timeout(300)
    inspection = await page.evaluate(
        """
        () => ({
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
          bodyScrollHeight: document.body ? document.body.scrollHeight : 0,
          brokenImages: Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute('src') || ''),
          viewport: { width: window.innerWidth, height: window.innerHeight }
        })
        """
    )
    overflow = max(inspection["scrollWidth"], inspection["bodyScrollWidth"]) > SLIDE_SIZE[0] or max(
        inspection["scrollHeight"], inspection["bodyScrollHeight"]
    ) > SLIDE_SIZE[1]
    if overflow:
        raise SlideTemplateBuilderError(f"Slide overflows the 1920x1080 canvas: {slide_path.name}")
    if inspection["brokenImages"]:
        raise SlideTemplateBuilderError(
            f"Slide contains broken images: {slide_path.name}: {', '.join(inspection['brokenImages'][:5])}"
        )
    screenshot = await page.screenshot(
        type="png",
        clip={"x": 0, "y": 0, "width": SLIDE_SIZE[0], "height": SLIDE_SIZE[1]},
    )
    return screenshot, inspection


def _resize_png(buffer: bytes, size: tuple[int, int]) -> bytes:
    with Image.open(BytesIO(buffer)) as image:
        rendered = image.convert("RGB").resize(size, Image.Resampling.LANCZOS)
        output = BytesIO()
        rendered.save(output, format="PNG")
        return output.getvalue()


def _create_collage(buffers: list[bytes]) -> bytes:
    selected = buffers[:MAX_COLLAGE_SLIDES]
    columns = min(COLLAGE_COLUMNS, len(selected))
    rows = (len(selected) + columns - 1) // columns
    width = COLLAGE_PADDING * 2 + columns * COLLAGE_TILE_SIZE[0] + (columns - 1) * COLLAGE_GAP
    height = COLLAGE_PADDING * 2 + rows * COLLAGE_TILE_SIZE[1] + (rows - 1) * COLLAGE_GAP
    collage = Image.new("RGB", (width, height), COLLAGE_BACKGROUND)
    for index, buffer in enumerate(selected):
        with Image.open(BytesIO(buffer)) as image:
            tile = image.convert("RGB").resize(COLLAGE_TILE_SIZE, Image.Resampling.LANCZOS)
        left = COLLAGE_PADDING + (index % columns) * (COLLAGE_TILE_SIZE[0] + COLLAGE_GAP)
        top = COLLAGE_PADDING + (index // columns) * (COLLAGE_TILE_SIZE[1] + COLLAGE_GAP)
        collage.paste(tile, (left, top))
    output = BytesIO()
    collage.save(output, format="PNG")
    return output.getvalue()


async def write_preview_images(
    preview_dir: Path,
    slide_buffers: list[bytes],
) -> tuple[Path, Path, list[Path]]:
    slides_dir = preview_dir / "slides"
    slide_paths = []
    for index, buffer in enumerate(slide_buffers, 1):
        slide_path = slides_dir / f"slide-{index:03d}.png"
        await async_write_bytes(slide_path, buffer)
        slide_paths.append(slide_path)
    thumbnail_path = preview_dir / "thumbnail.png"
    collage_path = preview_dir / "collage.png"
    thumbnail = await asyncio.to_thread(_resize_png, slide_buffers[0], THUMBNAIL_SIZE)
    collage = await asyncio.to_thread(_create_collage, slide_buffers)
    await async_write_bytes(thumbnail_path, thumbnail)
    await async_write_bytes(collage_path, collage)
    return thumbnail_path, collage_path, slide_paths


async def cleanup_template_intermediates(template_dir: Path) -> list[str]:
    """Remove the canonical authoring work directory after successful finalization."""

    work_dir = template_dir / WORK_DIR_NAME
    if not await async_exists(work_dir):
        return []
    await async_rmtree(work_dir)
    return [WORK_DIR_NAME]
