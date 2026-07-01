import asyncio
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


class PptxToHtmlError(Exception):
    """PPTX 转 HTML 失败。"""


@dataclass
class PptxToHtmlResult:
    output_dir: Path
    manifest_path: Path
    payload: Dict[str, Any]


def _safe_stem(path: Path) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip(".-")
    return stem or "presentation"


def _resolve_input(path_value: str, workspace_dir: Path) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else workspace_dir / path


def _resolve_output(path_value: str, source_path: Path, workspace_dir: Path) -> Path:
    if path_value:
        path = Path(path_value)
        return path if path.is_absolute() else workspace_dir / path
    return workspace_dir / ".workspace" / "pptx-html" / f"{_safe_stem(source_path)}_html"


def _ensure_safe_output(output_dir: Path, workspace_dir: Path) -> None:
    resolved_output = output_dir.resolve(strict=False)
    resolved_workspace = workspace_dir.resolve(strict=False)
    if resolved_output == resolved_workspace:
        raise PptxToHtmlError("Output directory cannot be the workspace root")
    try:
        resolved_output.relative_to(resolved_workspace)
    except ValueError as exc:
        raise PptxToHtmlError("Output directory must stay inside the workspace") from exc


def _parse_json_error(stdout: str, stderr: str) -> str:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return stderr.strip() or stdout.strip() or "Node conversion process failed"
    if isinstance(payload, dict):
        return str(payload.get("message") or payload.get("error") or payload)
    return str(payload)


async def convert_pptx_to_html(
    *,
    pptx_path: str,
    output_dir: str = "",
    max_slides: Optional[int] = None,
    override: bool = True,
    workspace_dir: Path,
) -> PptxToHtmlResult:
    source_path = _resolve_input(pptx_path, workspace_dir)
    if not source_path.exists() or not source_path.is_file():
        raise PptxToHtmlError(f"Input file does not exist or is not a file: {pptx_path}")

    target_dir = _resolve_output(output_dir, source_path, workspace_dir)
    _ensure_safe_output(target_dir, workspace_dir)
    if target_dir.exists():
        if not override:
            raise PptxToHtmlError(f"Output directory already exists: {target_dir}")
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    script_path = Path(__file__).with_name("convert_pptx_to_html.mjs")
    command = [
        "node",
        str(script_path),
        "--pptx",
        str(source_path),
        "--output-dir",
        str(target_dir),
    ]
    if max_slides is not None:
        command.extend(["--max-slides", str(max_slides)])

    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await process.communicate()
    stdout = stdout_bytes.decode("utf-8", errors="replace")
    stderr = stderr_bytes.decode("utf-8", errors="replace")
    if process.returncode != 0:
        raise PptxToHtmlError(_parse_json_error(stdout, stderr))

    manifest_path = target_dir / "pptx-html-render.json"
    if not manifest_path.exists():
        raise PptxToHtmlError("Conversion finished but pptx-html-render.json is missing")

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PptxToHtmlError("pptx-html-render.json is not valid JSON") from exc

    return PptxToHtmlResult(
        output_dir=target_dir,
        manifest_path=manifest_path,
        payload=payload,
    )
