#!/usr/bin/env python3
"""Generate visual-spec.md for a PPTX-derived template with an LLM."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any


REQUEST_TOO_LARGE_MARKERS = (
    "413",
    "Request Entity Too Large",
    "request entity too large",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, help="Extraction output directory containing pptx-template-brief.json")
    parser.add_argument("--output", help="Output path. Defaults to <source-dir>/llm-visual-spec.md")
    parser.add_argument("--json-output", help="Lightweight slide index output. Defaults to <source-dir>/llm-visual-spec.json")
    parser.add_argument("--model", help="Model id. Defaults to SUPER_MAGIC_CURRENT_MODEL_ID")
    parser.add_argument("--image", action="append", default=[], help="Optional slide screenshot path or URL. May be repeated.")
    parser.add_argument("--image-dir", action="append", default=[], help="Directory containing per-slide screenshots. May be repeated.")
    parser.add_argument("--max-slides", type=int, default=0, help="Debug only. 0 means include every slide from the extraction brief.")
    parser.add_argument("--max-images-per-request", type=int, default=3, help="Maximum images sent to one LLM request.")
    parser.add_argument("--max-request-image-bytes", type=int, default=1_572_864, help="Maximum local image bytes per LLM request.")
    parser.add_argument("--image-max-width", type=int, default=1280, help="Maximum width for local LLM-only image copies.")
    return parser.parse_args()


def compact_payload(payload: dict[str, Any], max_slides: int | None) -> dict[str, Any]:
    source_slides = payload.get("slides", [])
    slide_limit = len(source_slides) if not max_slides or max_slides <= 0 else max_slides
    slides = []
    for slide in source_slides[:slide_limit]:
        text_runs = [
            str(item.get("text", "")).strip()
            for item in slide.get("text_runs", [])
            if str(item.get("text", "")).strip()
        ]
        slides.append(
            {
                "index": slide.get("index"),
                "page_pattern": slide.get("page_pattern"),
                "image_count": slide.get("image_count"),
                "svg_count": slide.get("svg_count"),
                "table_count": slide.get("table_count"),
                "element_count": slide.get("element_count"),
                "text_runs": text_runs[:16],
            }
        )
    return {
        "source": payload.get("source"),
        "presentation": payload.get("presentation"),
        "theme": payload.get("theme"),
        "assets": {
            "image_count": len(payload.get("assets", {}).get("images", [])),
            "external_resources": payload.get("assets", {}).get("external_resources", []),
        },
        "page_patterns": payload.get("page_patterns"),
        "slides": slides,
        "slide_count_in_prompt": len(slides),
        "all_slides_included": len(slides) == len(source_slides),
        "page_package_candidates": payload.get("page_package_candidates"),
        "risks": payload.get("risks"),
    }


def build_prompt(
    payload: dict[str, Any],
    page_plan: dict[str, Any] | None,
    max_slides: int | None,
    image_records: list[dict[str, Any]] | None = None,
) -> str:
    compact = compact_payload(payload, max_slides)
    batch_images = [
        {
            "image": record.get("source_path"),
            "source_slide_index": record.get("source_slide_index"),
            "source_slide_number": record.get("source_slide_number"),
        }
        for record in image_records or []
    ]
    return "\n".join(
        [
            "你是 PPT 模板逐页视觉语义分析器。请基于 PPTX 提取证据和当前批次截图，生成设计语义摘要。",
            "这个输出会写入 llm-visual-spec.md，后续 builder 会把逐页理解整理到 template-pages.md，供大模型生成新 PPT 页面时选取基础页。",
            "",
            "要求：",
            "- 使用中文 Markdown。",
            "- 不要写某个固定样本的臆测风格；只能根据证据总结。",
            "- 必须包含：整体设计语义、色彩、字体、页面类型、图片/图形规则、明显风险。",
            "- 必须按源页逐页输出视觉理解。每页至少写：视觉角色、视觉锚点、适合内容、不适合内容、生成注意事项、风险。",
            "- 若当前批次只包含部分截图，仍要使用 PPTX extraction evidence 中的全部 slides 作为上下文，但逐页视觉细节重点分析当前批次图片。",
            "- 明确说明 PPTX 主产物是 multi_html_page_package，preview.html 不是页面来源。",
            "- 不要把 template-pages.json 当作模型主上下文；模型选页主文档是 template-pages.md。",
            "",
            "PPTX extraction evidence:",
            json.dumps(compact, ensure_ascii=False, indent=2),
            "",
            "Current batch image mapping:",
            json.dumps(batch_images, ensure_ascii=False, indent=2),
            "",
            "Optional LLM page plan:",
            json.dumps(page_plan or {}, ensure_ascii=False, indent=2),
        ]
    )


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def natural_sort_key(value: str) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def collect_image_paths(explicit_images: list[str], image_dirs: list[str]) -> list[str]:
    paths = list(explicit_images or [])
    for image_dir in image_dirs or []:
        directory = Path(image_dir)
        if not directory.exists() or not directory.is_dir():
            continue
        discovered = [
            str(path)
            for path in directory.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        ]
        paths.extend(sorted(discovered, key=natural_sort_key))
    return paths


def infer_slide_number_from_image(path_or_url: str, slide_count: int) -> int | None:
    if path_or_url.startswith(("http://", "https://", "data:")):
        return None
    stem = Path(path_or_url).stem.lower()
    preferred = re.search(r"(?:slide|page|p)[-_ ]*0*(\d+)\b", stem)
    candidates = [preferred.group(1)] if preferred else re.findall(r"\d+", stem)
    for candidate in candidates:
        number = int(candidate)
        if 1 <= number <= slide_count:
            return number
    return None


def image_anchor_for_slide(slide: dict[str, Any]) -> str:
    image_count = int(slide.get("image_count") or 0)
    svg_count = int(slide.get("svg_count") or 0)
    table_count = int(slide.get("table_count") or 0)
    if image_count >= 4:
        return "多图网格或图库区域"
    if image_count > 0:
        return "图片容器和图文关系"
    if table_count > 0:
        return "表格结构"
    if svg_count >= 20:
        return "图形、图表或装饰形状系统"
    if svg_count > 0:
        return "矢量装饰和分隔结构"
    return "文本层级和页面留白"


def fallback_visual_role(slide: dict[str, Any]) -> str:
    pattern = slide.get("page_pattern") or {}
    return str(pattern.get("name") or pattern.get("id") or "内容页")


def build_image_records(image_paths: list[str], payload: dict[str, Any], degraded: list[dict[str, str]]) -> list[dict[str, Any]]:
    slide_count = int(payload.get("presentation", {}).get("slide_count") or len(payload.get("slides", [])))
    records = []
    for image_path in image_paths:
        slide_number = infer_slide_number_from_image(image_path, slide_count)
        if slide_number is None:
            degraded.append({"image": image_path, "error": "无法从文件名匹配源页编号"})
        records.append(
            {
                "source_path": image_path,
                "llm_path": image_path,
                "source_slide_index": slide_number - 1 if slide_number is not None else None,
                "source_slide_number": slide_number,
            }
        )
    return records


def build_lightweight_visual_index(
    payload: dict[str, Any],
    image_records: list[dict[str, Any]],
    degraded: list[dict[str, str]],
) -> dict[str, Any]:
    degraded_images = {str(item.get("image", "")) for item in degraded}
    image_by_slide = {
        record["source_slide_index"]: record
        for record in image_records
        if isinstance(record.get("source_slide_index"), int)
    }
    degraded_rows = [
        {
            "image": Path(item["image"]).name if item.get("image") else "",
            "reason": item.get("error", ""),
        }
        for item in degraded
    ]
    slides = []
    for slide in payload.get("slides", []):
        index = int(slide.get("index") or 0)
        image_record = image_by_slide.get(index)
        visual_role = fallback_visual_role(slide)
        visual_anchor = image_anchor_for_slide(slide)
        slides.append(
            {
                "source_slide_index": index,
                "source_slide_number": index + 1,
                "visual_role": visual_role,
                "visual_anchor": visual_anchor,
                "best_for": visual_role,
                "has_visual_evidence": image_record is not None and image_record["source_path"] not in degraded_images,
                "image": Path(image_record["source_path"]).name if image_record else "",
            }
        )
    return {
        "schema_version": 1,
        "source": "llm-visual-spec.md",
        "slides": slides,
        "degraded": degraded_rows,
    }


def image_part(path_or_url: str) -> dict[str, Any]:
    try:
        from sdk.llm import file_to_url, image_to_base64
    except Exception as exc:  # pragma: no cover - depends on Super Magic runtime
        raise RuntimeError("sdk.llm is unavailable; run this script inside the Super Magic runtime") from exc

    if path_or_url.startswith(("http://", "https://", "data:")):
        url = path_or_url
    else:
        try:
            url = file_to_url(path_or_url)
        except Exception:
            url = image_to_base64(path_or_url)
    return {"type": "image_url", "image_url": {"url": url}}


def is_request_too_large_error(exc: Exception) -> bool:
    message = str(exc)
    return any(marker in message for marker in REQUEST_TOO_LARGE_MARKERS)


def local_image_bytes(path_or_url: str) -> int:
    if path_or_url.startswith(("http://", "https://", "data:")):
        return 0
    try:
        return Path(path_or_url).stat().st_size
    except OSError:
        return 0


def prepare_llm_image(path_or_url: str, source_dir: Path, image_max_width: int, max_image_bytes: int) -> str:
    if path_or_url.startswith(("http://", "https://", "data:")):
        return path_or_url
    path = Path(path_or_url)
    if not path.exists() or image_max_width <= 0:
        return path_or_url
    image_bytes = local_image_bytes(path_or_url)

    try:
        from PIL import Image
    except Exception:
        return path_or_url

    try:
        with Image.open(path) as image:
            width, height = image.size
            if width <= image_max_width and image_bytes <= max_image_bytes:
                return path_or_url
            ratio = image_max_width / width
            target_size = (image_max_width, max(1, int(height * ratio))) if width > image_max_width else (width, height)
            resized = image.convert("RGB")
            resized.thumbnail(target_size, Image.Resampling.LANCZOS)
            output_dir = source_dir / ".llm-visual-images"
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{path.stem}_llm.jpg"
            resized.save(output_path, "JPEG", quality=82, optimize=True)
            return str(output_path)
    except Exception:
        return path_or_url


def prepare_llm_images(
    image_records: list[dict[str, Any]],
    source_dir: Path,
    image_max_width: int,
    max_image_bytes: int,
) -> list[dict[str, Any]]:
    prepared = []
    for record in image_records:
        prepared_path = prepare_llm_image(record["source_path"], source_dir, image_max_width, max_image_bytes)
        prepared.append({**record, "llm_path": prepared_path})
    return prepared


def chunk_images(image_records: list[dict[str, Any]], max_images_per_request: int, max_request_image_bytes: int) -> list[list[dict[str, Any]]]:
    if not image_records:
        return [[]]

    max_images = max(1, max_images_per_request)
    max_bytes = max(1, max_request_image_bytes)
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_bytes = 0

    for record in image_records:
        image_bytes = local_image_bytes(record["llm_path"])
        would_exceed_count = len(current) >= max_images
        would_exceed_bytes = current and current_bytes + image_bytes > max_bytes
        if would_exceed_count or would_exceed_bytes:
            chunks.append(current)
            current = []
            current_bytes = 0
        current.append(record)
        current_bytes += image_bytes

    if current:
        chunks.append(current)
    return chunks


def call_single_llm_request(prompt: str, image_paths: list[str], model_id: str | None) -> str:
    try:
        from sdk.llm import create_openai_sync_client
    except Exception as exc:  # pragma: no cover - depends on Super Magic runtime
        raise RuntimeError("sdk.llm is unavailable; run this script inside the Super Magic runtime") from exc

    client = create_openai_sync_client()
    selected_model = model_id or os.environ.get("SUPER_MAGIC_CURRENT_MODEL_ID")
    if not selected_model:
        raise RuntimeError("model id is required; pass --model or set SUPER_MAGIC_CURRENT_MODEL_ID")

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    content.extend(image_part(path) for path in image_paths)

    response = client.chat.completions.create(
        model=selected_model,
        messages=[
            {"role": "system", "content": "你生成严谨、可执行的 PPT 模板 visual-spec.md。"},
            {"role": "user", "content": content},
        ],
        extra_body={"thinking": {"type": "disabled"}},
    )
    return response.choices[0].message.content or ""


def call_llm(prompt: str, image_paths: list[str], model_id: str | None) -> str:
    return call_single_llm_request(prompt, image_paths, model_id)


def analyze_image_batch(
    prompt: str,
    image_records: list[dict[str, Any]],
    model_id: str | None,
    degraded: list[dict[str, str]],
) -> list[str]:
    image_paths = [record["llm_path"] for record in image_records]
    try:
        markdown = call_single_llm_request(prompt, image_paths, model_id).strip()
        return [markdown] if markdown else []
    except Exception as exc:
        if not is_request_too_large_error(exc):
            raise
        if len(image_records) <= 1:
            degraded.append({"image": image_records[0]["source_path"] if image_records else "(text-only)", "error": str(exc)})
            return []
        midpoint = len(image_records) // 2
        return [
            *analyze_image_batch(prompt, image_records[:midpoint], model_id, degraded),
            *analyze_image_batch(prompt, image_records[midpoint:], model_id, degraded),
        ]


def build_slide_index_markdown(visual_index: dict[str, Any]) -> str:
    rows = [
        "## 逐页视觉理解索引",
        "",
        "| 源页 | 视觉角色 | 视觉锚点 | 视觉证据 |",
        "| ---: | --- | --- | --- |",
    ]
    for slide in visual_index.get("slides", []):
        evidence = slide.get("image") or ("有截图" if slide.get("has_visual_evidence") else "仅结构证据")
        rows.append(
            f"| {slide.get('source_slide_number')} | {slide.get('visual_role') or '内容页'} | {slide.get('visual_anchor') or '文本层级'} | {evidence} |"
        )
    return "\n".join(rows)


def merge_visual_markdown(parts: list[str], degraded: list[dict[str, str]], visual_index: dict[str, Any]) -> str:
    sections: list[str] = [
        "# PPTX 逐页视觉语义理解",
        "",
        "该文件覆盖源 PPTX 中的全部已提取页面。后续生成 PPT 页面时，优先读取 `template-pages.md` 选择基础页，再复制对应 `pages/*.html` 并替换 `data-slot` 内容。",
        "",
        build_slide_index_markdown(visual_index),
    ]
    for index, part in enumerate(parts, start=1):
        if part.strip():
            sections.append(f"## 视觉批次 {index}\n\n{part.strip()}")

    if degraded:
        rows = ["## 视觉证据降级", "", "| 图片 | 原因 |", "| --- | --- |"]
        for item in degraded:
            rows.append(f"| `{Path(item['image']).name}` | {item['error']} |")
        sections.append("\n".join(rows))

    return "\n\n".join(sections).strip()


def run(args: argparse.Namespace) -> int:
    source_dir = Path(args.source_dir).resolve()
    output_path = Path(args.output).resolve() if args.output else source_dir / "llm-visual-spec.md"
    json_output_path = Path(getattr(args, "json_output", None)).resolve() if getattr(args, "json_output", None) else source_dir / "llm-visual-spec.json"
    payload = json.loads((source_dir / "pptx-template-brief.json").read_text(encoding="utf-8"))
    page_plan_path = source_dir / "llm-page-plan.json"
    page_plan = json.loads(page_plan_path.read_text(encoding="utf-8")) if page_plan_path.exists() else None
    image_paths = collect_image_paths(getattr(args, "image", []), getattr(args, "image_dir", []))
    degraded: list[dict[str, str]] = []
    image_records = build_image_records(image_paths, payload, degraded)
    prepared_images = prepare_llm_images(
        image_records,
        source_dir,
        args.image_max_width,
        args.max_request_image_bytes,
    )
    batches = chunk_images(prepared_images, args.max_images_per_request, args.max_request_image_bytes)
    parts: list[str] = []
    for batch in batches:
        prompt = build_prompt(payload, page_plan, args.max_slides, batch)
        parts.extend(analyze_image_batch(prompt, batch, args.model, degraded))
    visual_index = build_lightweight_visual_index(payload, image_records, degraded)
    markdown = merge_visual_markdown(parts, degraded, visual_index)
    if not markdown:
        raise RuntimeError("LLM returned empty visual spec")
    output_path.write_text(markdown + "\n", encoding="utf-8")
    json_output_path.write_text(json.dumps(visual_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), "json_output": str(json_output_path), "bytes": len(markdown.encode("utf-8"))}, ensure_ascii=False))
    return 0


def main() -> int:
    return run(parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
