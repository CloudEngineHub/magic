from pathlib import Path
from typing import Any, Dict, List, Optional


def build_template_json(
    *,
    template_id: str,
    source_path: Path,
    deck: Dict[str, Any],
    report: Dict[str, Any],
    slides: List[Dict[str, Any]],
    preview_files: Optional[Dict[str, str]] = None,
    warnings: Optional[List[str]] = None,
) -> Dict[str, Any]:
    warning_notes = warnings if warnings is not None else [
        str(item.get("message") or item)
        for item in report.get("warnings", [])
    ] if isinstance(report.get("warnings"), list) else []
    files = {
        "entry_html": "index.html",
        "project_config": "magic.project.js",
        "theme_css": "theme.css",
        "slides_dir": "slides",
        "images_dir": "images",
        "package_zip": f"../{template_id}-template.zip",
    }
    if preview_files:
        files.update(preview_files)
    return {
        "schema_version": "1.0.0",
        "template_id": template_id,
        "name": source_path.stem,
        "files": files,
        "slides": slides,
        "source": {
            "kind": "pptx_import",
            "file": source_path.name,
            "canvas": deck.get("canvas", {}),
        },
        "warnings": warning_notes,
    }
