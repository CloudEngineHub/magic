import asyncio
import json
import re
import shutil
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.tools.pptx_to_slide_template.html_attrs import convert_source_data_selectors_to_classes, strip_source_data_attributes
from app.tools.pptx_to_slide_template.svg_assets import externalize_large_inline_svgs


class PptxToSlideTemplateError(Exception):
    """PPTX 转平台模板失败。"""


@dataclass
class PptxToSlideTemplateResult:
    output_root: Path
    template_dir: Path
    zip_path: Path
    template_json_path: Path
    slide_count: int
    warnings: List[str]
    payload: Dict[str, Any]


def _safe_slug(value: str, fallback: str = "pptx-template") -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-").lower()
    return slug or fallback


def _resolve_workspace_path(path_value: str, workspace_dir: Path) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else workspace_dir / path


def _path_is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def _resolve_output_root(output_dir: str, workspace_dir: Path) -> Path:
    if output_dir:
        path = Path(output_dir)
        return path if path.is_absolute() else workspace_dir / path
    return workspace_dir / ".workspace" / "slide-templates"


def _ensure_safe_output_root(output_root: Path, workspace_dir: Path) -> None:
    resolved_output = output_root.resolve(strict=False)
    resolved_workspace = workspace_dir.resolve(strict=False)
    if resolved_output == resolved_workspace:
        raise PptxToSlideTemplateError("Output directory cannot be the workspace root")
    try:
        resolved_output.relative_to(resolved_workspace)
    except ValueError as exc:
        raise PptxToSlideTemplateError("Output directory must stay inside the workspace") from exc


def _static_bundle_path() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "static" / "tools" / "pptx-to-html" / "pptx-to-html.bundle.cjs"


def _parse_json_from_stdout(stdout: str) -> Dict[str, Any]:
    text = stdout.strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"(\{[\s\S]*\})\s*$", text)
        if not match:
            return {}
        return json.loads(match.group(1))


async def _run_bundle(source_path: Path, render_dir: Path) -> Dict[str, Any]:
    bundle_path = _static_bundle_path()
    if not bundle_path.exists():
        raise PptxToSlideTemplateError(f"PPTX renderer bundle is missing: {bundle_path}")
    command = [
        "node",
        str(bundle_path),
        str(source_path),
        "--out",
        str(render_dir),
        "--output-mode",
        "paged",
        "--raster-fallback",
        "placeholder",
        "--json",
    ]
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await process.communicate()
    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace")
    if process.returncode != 0:
        raise PptxToSlideTemplateError(stderr.strip() or stdout.strip() or "PPTX renderer failed")
    return _parse_json_from_stdout(stdout)


def _text_from_element(element: Dict[str, Any]) -> str:
    text = element.get("text")
    if isinstance(text, dict):
        return str(text.get("plain") or "").strip()
    return ""


def _slide_title(slide: Dict[str, Any]) -> str:
    for element in slide.get("elements", []):
        if element.get("type") == "text" and element.get("role") in {"title", "subtitle"}:
            text = _text_from_element(element)
            if text:
                return re.sub(r"\s+", " ", text)[:80]
    for element in slide.get("elements", []):
        if element.get("type") == "text":
            text = _text_from_element(element)
            if text:
                return re.sub(r"\s+", " ", text)[:80]
    return f"Slide {slide.get('index') or ''}".strip()


def _layout_kind(slide: Dict[str, Any]) -> str:
    elements = slide.get("elements", [])
    image_count = sum(1 for item in elements if item.get("type") == "image")
    chart_count = sum(1 for item in elements if item.get("type") == "chart")
    text_count = sum(1 for item in elements if item.get("type") == "text")
    index = int(slide.get("index") or 0)
    if index == 1:
        return "cover"
    if chart_count:
        return "chart"
    if image_count >= 2:
        return "gallery"
    if image_count == 1 and text_count:
        return "image-content"
    if text_count >= 4:
        return "content"
    return "slide"


def _slot_name(role: str, counts: Dict[str, int]) -> str:
    base = _safe_slug(role.replace("_", "-"), "content").replace("-", "_")
    counts[base] = counts.get(base, 0) + 1
    return base if counts[base] == 1 else f"{base}_{counts[base]:02d}"


def _build_slide_slots(slide: Dict[str, Any]) -> List[Dict[str, Any]]:
    slots: List[Dict[str, Any]] = []
    counts: Dict[str, int] = {}
    for element in slide.get("elements", []):
        element_type = element.get("type")
        if element_type not in {"text", "image", "chart"}:
            continue
        role = str(element.get("role") or element_type)
        slot_type = "image" if element_type == "image" else "text"
        if element_type == "chart":
            slot_type = "chart"
        slots.append(
            {
                "name": _slot_name(role, counts),
                "type": slot_type,
                "element_id": element.get("id"),
                "role": role,
                "sample": _text_from_element(element)[:120] if slot_type == "text" else "",
            }
        )
    return slots


def _add_slot_attributes(html: str, slots: List[Dict[str, Any]]) -> str:
    output = html
    for slot in slots:
        element_id = re.escape(str(slot.get("element_id") or ""))
        if not element_id:
            continue
        pattern = re.compile(rf"(<[^>]+\bdata-element-id=\"{element_id}\"[^>]*)(>)", re.IGNORECASE)

        def replace(match: re.Match[str]) -> str:
            opening = match.group(1)
            if "data-slot=" in opening:
                return match.group(0)
            attrs = (
                f' data-slot="{slot["name"]}"'
                f' data-slot-type="{slot["type"]}"'
                f' data-slot-role="{slot["role"]}"'
            )
            return f"{opening}{attrs}{match.group(2)}"

        output = pattern.sub(replace, output, count=1)
    return output


def _rewrite_slide_html(html: str, slots: List[Dict[str, Any]], preserve_source_data_attrs: bool, externalize_inline_svg: bool, vectors_dir: Path, slide_id: str) -> str:
    rewritten = html.replace("../styles.css", "../theme.css")
    rewritten = rewritten.replace("../assets/images/", "../images/")
    rewritten = rewritten.replace("../assets/", "../images/")
    rewritten = _add_slot_attributes(rewritten, slots)
    if not preserve_source_data_attrs:
        rewritten = convert_source_data_selectors_to_classes(rewritten)
        rewritten = strip_source_data_attributes(rewritten)
    if externalize_inline_svg:
        rewritten = externalize_large_inline_svgs(rewritten, vectors_dir=vectors_dir, slide_id=slide_id)
    bridge = '  <script src="../slide-bridge.js"></script>\n'
    if "slide-bridge.js" not in rewritten:
        if "</body>" in rewritten:
            rewritten = rewritten.replace("</body>", f"{bridge}</body>")
        else:
            rewritten = f"{rewritten}\n{bridge}"
    return rewritten


def _rewrite_theme_css(css: str) -> str:
    rewritten = css.replace("../assets/images/", "images/")
    rewritten = rewritten.replace("./assets/images/", "images/")
    rewritten = rewritten.replace("assets/images/", "images/")
    rewritten = rewritten.replace("../assets/", "images/")
    rewritten = rewritten.replace("./assets/", "images/")
    rewritten = rewritten.replace("assets/", "images/")
    return rewritten


def _copy_render_assets(render_dir: Path, template_dir: Path) -> bool:
    source_assets = render_dir / "assets"
    target_images = template_dir / "images"
    if not source_assets.exists():
        target_images.mkdir(parents=True, exist_ok=True)
        return False
    target_images.mkdir(parents=True, exist_ok=True)
    for child in source_assets.iterdir():
        if child.name == "images" and child.is_dir():
            for image_item in child.iterdir():
                target = target_images / image_item.name
                if image_item.is_dir():
                    shutil.copytree(image_item, target, dirs_exist_ok=True)
                else:
                    shutil.copy2(image_item, target)
            continue
        target = target_images / child.name
        if child.is_dir():
            shutil.copytree(child, target, dirs_exist_ok=True)
        else:
            shutil.copy2(child, target)
    return True


def _copy_project_shell(template_dir: Path) -> None:
    magic_slide_dir = Path(__file__).resolve().parents[1] / "magic_slide"
    shutil.copy2(magic_slide_dir / "index.html", template_dir / "index.html")
    shutil.copy2(magic_slide_dir / "slide-bridge.js", template_dir / "slide-bridge.js")


def _write_magic_project(template_dir: Path, template_id: str, slide_files: List[str]) -> None:
    config = {
        "version": "1.0.0",
        "type": "slide",
        "name": template_id,
        "slides": slide_files,
    }
    content = (
        f"window.magicProjectConfig = {json.dumps(config, ensure_ascii=False, indent=2)};\n"
        "window.magicProjectConfigure(window.magicProjectConfig);\n"
    )
    (template_dir / "magic.project.js").write_text(content, encoding="utf-8")


def _build_template_json(
    *,
    template_id: str,
    source_path: Path,
    deck: Dict[str, Any],
    report: Dict[str, Any],
    slides: List[Dict[str, Any]],
    copied_assets: bool,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    label = source_path.stem
    warnings = report.get("warnings", []) if isinstance(report.get("warnings"), list) else []
    return {
        "schema_version": "1.0.0",
        "template_id": template_id,
        "template_dir": template_id,
        "package_type": "html_slide_template_project",
        "backend_payload": {
            "label": {"zh_CN": label, "en_US": label},
            "description": {
                "zh_CN": f"由 {source_path.name} 转换生成的 HTML 幻灯片模板项目。",
                "en_US": f"HTML slide template project converted from {source_path.name}.",
            },
            "thumbnail_file_key": "",
            "collage_file_key": "",
            "template_file_key": "",
            "preview_url": "",
            "status": 0,
            "sort": 0,
        },
        "files": {
            "entry_html": "index.html",
            "project_config": "magic.project.js",
            "theme_css": "theme.css",
            "slides_dir": "slides",
            "images_dir": "images",
            "package_zip": f"../{template_id}-template.zip",
        },
        "slides": slides,
        "taxonomy": {
            "industries": [],
            "scenes": ["pptx-import"],
            "styles": [],
            "layout_pack": sorted({slide["layout"] for slide in slides}),
            "languages": [],
            "keywords": [source_path.stem],
        },
        "generation": {
            "batch_id": "",
            "method": "pptx_to_slide_template_project",
            "source_kind": "pptx_import",
            "model": "deterministic",
            "created_at": now,
            "inspiration_urls": [],
            "source_files": [source_path.name],
            "source_canvas": deck.get("canvas", {}),
        },
        "quality": {
            "review_status": "pending_review",
            "score": 0,
            "similarity_score": None,
            "checks": {
                "html_valid": True,
                "preview_rendered": True,
                "text_overflow": False,
                "asset_localized": copied_assets,
                "zip_created": True,
                "backend_payload_ready": False,
            },
            "notes": [str(item.get("message") or item) for item in warnings],
        },
        "license": {
            "status": "unknown",
            "copyright_risk": "medium",
            "requires_attribution": False,
            "attribution_text": "",
            "third_party_assets": copied_assets,
            "asset_sources": [],
        },
    }


def _zip_template_dir(template_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(template_dir.rglob("*")):
            if not path.is_file():
                continue
            archive.write(path, path.relative_to(template_dir).as_posix())


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


async def convert_pptx_to_slide_template(
    *,
    pptx_path: str,
    output_dir: str = "",
    template_id: str = "",
    max_slides: Optional[int] = None,
    override: bool = True,
    debug: bool = False,
    preserve_source_data_attrs: bool = False,
    externalize_inline_svg: bool = True,
    workspace_dir: Path,
) -> PptxToSlideTemplateResult:
    source_path = _resolve_workspace_path(pptx_path, workspace_dir)
    if not source_path.exists() or not source_path.is_file():
        raise PptxToSlideTemplateError(f"Input file does not exist or is not a file: {pptx_path}")

    resolved_template_id = _safe_slug(template_id or source_path.stem)
    output_root = _resolve_output_root(output_dir, workspace_dir)
    _ensure_safe_output_root(output_root, workspace_dir)
    template_dir = output_root / resolved_template_id
    render_dir = output_root / f".{resolved_template_id}-rendered"
    zip_path = output_root / f"{resolved_template_id}-template.zip"

    if template_dir.exists() or zip_path.exists() or render_dir.exists():
        if not override:
            raise PptxToSlideTemplateError(f"Output already exists for template: {resolved_template_id}")
        if _path_is_relative_to(source_path.resolve(strict=True), template_dir.resolve(strict=False)):
            raise PptxToSlideTemplateError("Input PPTX is inside template output directory and would be deleted")
        shutil.rmtree(template_dir, ignore_errors=True)
        shutil.rmtree(render_dir, ignore_errors=True)
        if zip_path.exists():
            zip_path.unlink()

    output_root.mkdir(parents=True, exist_ok=True)
    template_dir.mkdir(parents=True, exist_ok=True)
    render_dir.mkdir(parents=True, exist_ok=True)

    bundle_result = await _run_bundle(source_path, render_dir)
    deck = _load_json(render_dir / "template.json")
    report = _load_json(render_dir / "conversion-report.json")
    rendered_slides = deck.get("slides", [])
    if max_slides is not None and max_slides > 0:
        rendered_slides = rendered_slides[:max_slides]

    theme_css = _rewrite_theme_css((render_dir / "styles.css").read_text(encoding="utf-8"))
    (template_dir / "theme.css").write_text(theme_css, encoding="utf-8")
    copied_assets = _copy_render_assets(render_dir, template_dir)
    _copy_project_shell(template_dir)

    slides_dir = template_dir / "slides"
    vectors_dir = template_dir / "images" / "vectors"
    slides_dir.mkdir(parents=True, exist_ok=True)
    slide_index: List[Dict[str, Any]] = []
    slide_files: List[str] = []
    for slide in rendered_slides:
        slide_id = str(slide.get("id") or f"slide-{int(slide.get('index') or 0):03d}")
        source_slide = render_dir / "slides" / f"{slide_id}.html"
        if not source_slide.exists():
            continue
        file_name = f"{slide_id}.html"
        slots = _build_slide_slots(slide)
        html = _rewrite_slide_html(source_slide.read_text(encoding="utf-8"), slots, preserve_source_data_attrs, externalize_inline_svg, vectors_dir, slide_id)
        (slides_dir / file_name).write_text(html, encoding="utf-8")
        slide_path = f"slides/{file_name}"
        slide_files.append(slide_path)
        slide_index.append(
            {
                "file": slide_path,
                "title": _slide_title(slide),
                "layout": _layout_kind(slide),
                "source_slide": int(slide.get("index") or 0),
                "slots": [
                    {key: value for key, value in slot.items() if key != "element_id"}
                    for slot in slots
                ],
                "best_for": _layout_kind(slide),
                "risks": [],
            }
        )

    _write_magic_project(template_dir, resolved_template_id, slide_files)
    template_payload = _build_template_json(
        template_id=resolved_template_id,
        source_path=source_path,
        deck=deck,
        report=report,
        slides=slide_index,
        copied_assets=copied_assets,
    )
    template_json_path = template_dir / "template.json"
    template_json_path.write_text(json.dumps(template_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _zip_template_dir(template_dir, zip_path)

    if not debug:
        shutil.rmtree(render_dir, ignore_errors=True)

    warnings = [str(item.get("message") or item) for item in report.get("warnings", [])] if isinstance(report.get("warnings"), list) else []
    if not slide_index:
        warnings.append("No slide HTML files were copied into the template project")

    return PptxToSlideTemplateResult(
        output_root=output_root,
        template_dir=template_dir,
        zip_path=zip_path,
        template_json_path=template_json_path,
        slide_count=len(slide_index),
        warnings=warnings,
        payload={
            "template_id": resolved_template_id,
            "output_root": str(output_root),
            "template_dir": str(template_dir),
            "zip_path": str(zip_path),
            "template_json": str(template_json_path),
            "slide_count": len(slide_index),
            "warnings": warnings,
            "bundle_result": bundle_result,
            "debug_render_dir": str(render_dir) if debug else "",
        },
    )
