from pathlib import Path
from typing import Any, Dict, List, Optional


def build_template_json(
    *,
    template_id: str,
    source_path: Path,
    deck: Dict[str, Any],
    report: Dict[str, Any],
    slides: List[Dict[str, Any]],
    category_code: str = "",
    warnings: Optional[List[str]] = None,
    package_zip: Optional[str] = None,
    visual_spec: Optional[str] = None,
) -> Dict[str, Any]:
    warning_notes = warnings if warnings is not None else [
        str(item.get("message") or item)
        for item in report.get("warnings", [])
    ] if isinstance(report.get("warnings"), list) else []
    files = {
        "theme_css": "theme.css",
        "slides_dir": "slides",
        "images_dir": "images",
    }
    if visual_spec:
        files["visual_spec"] = visual_spec
    if package_zip:
        files["package_zip"] = package_zip
    canvas = deck.get("canvas", {})
    payload = {
        "schema_version": "1.0",
        "template_id": template_id,
        "label": {
            "zh_CN": source_path.stem,
            "en_US": source_path.stem,
        },
        "description": {
            "zh_CN": f"由 {source_path.name} 转换生成的 HTML 幻灯片模板草稿，需二次调整后再打包发布。",
            "en_US": f"An HTML slide template draft converted from {source_path.name}. It requires post-conversion refinement before final packaging.",
        },
        "files": files,
        "slides": slides,
        "source": {
            "kind": "converted",
            "file": source_path.name,
            "canvas": {
                "width": int(canvas.get("width") or 1920),
                "height": int(canvas.get("height") or 1080),
            },
        },
        "warnings": warning_notes,
    }
    if category_code:
        payload["category_code"] = category_code
    return payload
