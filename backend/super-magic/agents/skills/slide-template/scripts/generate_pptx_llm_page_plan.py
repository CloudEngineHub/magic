#!/usr/bin/env python3
"""Generate an optional LLM page plan for PPTX-derived templates."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, help="Extraction output directory containing pptx-template-brief.json")
    parser.add_argument("--output", help="Output path. Defaults to <source-dir>/llm-page-plan.json")
    parser.add_argument("--model", help="Model id. Defaults to SUPER_MAGIC_CURRENT_MODEL_ID")
    parser.add_argument("--max-text-runs", type=int, default=12)
    return parser.parse_args()


def compact_slide(slide: dict[str, Any], max_text_runs: int) -> dict[str, Any]:
    text_runs = [
        str(item.get("text", "")).strip()
        for item in slide.get("text_runs", [])
        if str(item.get("text", "")).strip()
    ]
    return {
        "source_slide_index": slide.get("index", 0),
        "source_slide_number": int(slide.get("index", 0)) + 1,
        "page_pattern": slide.get("page_pattern", {}),
        "image_count": slide.get("image_count", 0),
        "svg_count": slide.get("svg_count", 0),
        "text_runs": text_runs[:max_text_runs],
    }


def build_prompt(payload: dict[str, Any], max_text_runs: int) -> str:
    slides = [compact_slide(slide, max_text_runs) for slide in payload.get("slides", [])]
    candidates = payload.get("page_package_candidates", [])
    return "\n".join(
        [
            "You classify PPTX-derived HTML pages for a reusable slide template package.",
            "Return strict JSON only. Do not include markdown fences.",
            "",
            "Required JSON schema:",
            "{",
            '  "pages": [',
            "    {",
            '      "source_slide_index": 0,',
            '      "file": "pages/cover.html",',
            '      "layout_kind": "cover",',
            '      "layout_name": "封面",',
            '      "source_title": "short human title from slide text",',
            '      "use_case": "how this page should be reused",',
            '      "placeholder_fields": [',
            '        {"name": "title", "type": "text", "sample": "original text"},',
            '        {"name": "image_01", "type": "image", "sample": ""}',
            "      ]",
            "    }",
            "  ]",
            "}",
            "",
            "Rules:",
            "- Use lowercase kebab-case for layout_kind and page file names.",
            "- Use stable slot names that a generator can replace later.",
            "- Do not copy one specific deck's topic names into generic layout names.",
            "- Keep one page object for each candidate. Do not merge or omit pages only because layouts look similar.",
            "- The later builder will copy pages/*.html and replace data-slot content.",
            "",
            "Slides:",
            json.dumps(slides, ensure_ascii=False, indent=2),
            "",
            "Page candidates:",
            json.dumps(candidates, ensure_ascii=False, indent=2),
        ]
    )


def strip_json_fence(value: str) -> str:
    text = value.strip()
    fenced = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", text)
    return fenced.group(1).strip() if fenced else text


def validate_plan(plan: dict[str, Any]) -> dict[str, Any]:
    pages = plan.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("llm page plan must contain a non-empty pages array")
    for page in pages:
        if not isinstance(page, dict):
            raise ValueError("each page must be an object")
        for key in ["source_slide_index", "file", "layout_kind", "layout_name", "placeholder_fields"]:
            if key not in page:
                raise ValueError(f"page is missing required key: {key}")
        if not str(page["file"]).startswith("pages/") or not str(page["file"]).endswith(".html"):
            raise ValueError(f"page file must be under pages/*.html: {page['file']}")
        fields = page.get("placeholder_fields")
        if not isinstance(fields, list):
            raise ValueError("placeholder_fields must be a list")
    return {"pages": pages}


def call_llm(prompt: str, model_id: str | None) -> str:
    try:
        from sdk.llm import create_openai_sync_client
    except Exception as exc:  # pragma: no cover - depends on Super Magic runtime
        raise RuntimeError("sdk.llm is unavailable; run this script inside the Super Magic runtime") from exc

    client = create_openai_sync_client()
    selected_model = model_id or os.environ.get("SUPER_MAGIC_CURRENT_MODEL_ID")
    if not selected_model:
        raise RuntimeError("model id is required; pass --model or set SUPER_MAGIC_CURRENT_MODEL_ID")
    response = client.chat.completions.create(
        model=selected_model,
        messages=[
            {
                "role": "system",
                "content": "You produce strict JSON for PPTX template page classification and slot planning.",
            },
            {"role": "user", "content": prompt},
        ],
        extra_body={"thinking": {"type": "disabled"}},
    )
    return response.choices[0].message.content or ""


def main() -> int:
    args = parse_args()
    source_dir = Path(args.source_dir).resolve()
    output_path = Path(args.output).resolve() if args.output else source_dir / "llm-page-plan.json"
    payload = json.loads((source_dir / "pptx-template-brief.json").read_text(encoding="utf-8"))
    prompt = build_prompt(payload, args.max_text_runs)
    raw = call_llm(prompt, args.model)
    plan = validate_plan(json.loads(strip_json_fence(raw)))
    output_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), "page_count": len(plan["pages"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
