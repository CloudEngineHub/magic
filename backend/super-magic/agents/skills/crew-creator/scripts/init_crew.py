#!/usr/bin/env python3
"""
Initialize a minimal set of employee definition files in .magic/.

Reads a JSON config (via --config <path>) containing employee metadata
and generates the appropriate definition files.

Usage:
    python scripts/init_crew.py --config /path/to/config.json [--overwrite]

Config JSON schema:
    # All fields are written in the selected language:
    {
        "name":            "Research Assistant",        # required
        "role":            "Academic Researcher",       # required
        "description":     "A professional research assistant",  # required
        "role_body":       "You are an academic researcher...",  # optional (IDENTITY.md body)
        "personality":     "Rigorous, concise...",      # optional -> SOUL.md
        "instructions":    "Workflow...",               # required -> AGENTS.md
        "skill_decomposition_decision": "yes"            # required: "yes" or "no"
    }

Files generated:
    .magic/IDENTITY.md   — always
    .magic/AGENTS.md     — if instructions provided
    .magic/SOUL.md       — if personality provided
    (TOOLS.md / SKILLS.md are intentionally NOT created so the system uses defaults)
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

# Set environment variables to prevent runtime logging from polluting workspace
os.environ.setdefault("LOG_DIR", "/app/logs" if Path("/app/logs").exists() else "/tmp/logs")

# agents/skills/_shared/ is under parents[2] for all skill scripts.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from _shared.bootstrap import get_project_root


REQUIRED_FIELDS = ("name", "role", "description", "instructions", "skill_decomposition_decision")
VALID_SKILL_DECOMPOSITION_DECISIONS = {"yes", "no"}


def _resolve_workspace_dir(project_root: Path) -> Path:
    """
    Resolve the employee workspace directory.
    When running inside sandbox (/app), cwd is usually the workspace (/mnt/agfs/magicfs/project).
    If project_root contains .workspace, prefer cwd or project_root/.workspace accordingly.
    """
    cwd = Path.cwd()
    if (cwd / ".magic").exists() or cwd.name == "project":
        return cwd
    if (project_root / ".workspace").exists():
        return project_root / ".workspace"
    return cwd


def _resolve_config_path(config_arg: str, workspace_dir: Path, project_root: Path) -> tuple[Path | None, list[Path]]:
    config_path = Path(config_arg).expanduser()
    if config_path.is_absolute():
        candidates = [config_path]
    else:
        candidates = [
            Path.cwd() / config_path,
            workspace_dir / config_path,
            project_root / ".workspace" / config_path,
            project_root / config_path,
        ]

    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve(), candidates
    return None, candidates


def _cleanup_unwanted_dirs(workspace_dir: Path) -> None:
    """Clean up unwanted runtime directories created accidentally in the workspace root."""
    unwanted_dirs = [".browser", ".cache", ".workspace", "logs"]
    for dir_name in unwanted_dirs:
        target = workspace_dir / dir_name
        if target.exists() and target.is_dir():
            try:
                # If it's a symlink or empty/non-essential directory, remove it
                if target.is_symlink():
                    target.unlink()
                else:
                    shutil.rmtree(target, ignore_errors=True)
            except Exception:
                pass


def _build_identity(cfg: dict) -> str:
    header_lines = [
        "---",
        f"name: {cfg['name']}",
        f"role: {cfg['role']}",
        f"description: {cfg['description']}",
    ]

    header_lines.append("---")
    header = "\n".join(header_lines) + "\n"

    body = cfg.get("role_body") or ""
    if not body:
        role = cfg["role"]
        desc = cfg["description"]
        body = f"Role: {role}\n\nDescription: {desc}"

    return f"{header}\n{body}\n"


def _build_agents(cfg: dict) -> str | None:
    body = cfg.get("instructions")
    if not body:
        return None
    return f"{body}\n"


def _build_soul(cfg: dict) -> str | None:
    body = cfg.get("personality")
    if not body:
        return None
    return f"{body}\n"


def _validate_agents_content(content: str) -> list[str]:
    if not content.strip():
        return ["content"]

    ordered_steps = 0
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        separator_index = 0
        while separator_index < len(stripped) and stripped[separator_index].isdigit():
            separator_index += 1

        if separator_index == 0 or separator_index >= len(stripped):
            continue
        if stripped[separator_index] not in ".)":
            continue
        if not stripped[separator_index + 1 :].strip():
            continue
        ordered_steps += 1

    if ordered_steps < 2:
        return ["executable_steps"]

    return []


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Initialize employee definition files in .magic/",
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Path to a JSON config file with employee metadata.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing IDENTITY.md if it already exists.",
    )
    args = parser.parse_args()

    project_root = get_project_root()
    workspace_dir = _resolve_workspace_dir(project_root)
    config_path, candidates = _resolve_config_path(args.config, workspace_dir, project_root)
    if config_path is None:
        checked_paths = ", ".join(str(path) for path in candidates)
        print(json.dumps({
            "ok": False,
            "error": f"Config file not found. Checked: {checked_paths}",
        }, ensure_ascii=False))
        return 1

    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"ok": False, "error": f"Failed to read config: {exc}"}, ensure_ascii=False))
        return 1

    missing = [f for f in REQUIRED_FIELDS if not cfg.get(f)]
    if missing:
        print(json.dumps({"ok": False, "error": f"Missing required fields: {missing}"}, ensure_ascii=False))
        return 1

    skill_decision = str(cfg["skill_decomposition_decision"]).strip().lower()
    if skill_decision not in VALID_SKILL_DECOMPOSITION_DECISIONS:
        print(json.dumps({
            "ok": False,
            "error": "skill_decomposition_decision must be an explicit 'yes' or 'no'.",
        }, ensure_ascii=False))
        return 1

    invalid_agents_sections = _validate_agents_content(str(cfg["instructions"]))
    if invalid_agents_sections:
        print(json.dumps({
            "ok": False,
            "error": "AGENTS.md instructions must contain at least two executable ordered steps.",
            "missing_sections": invalid_agents_sections,
        }, ensure_ascii=False))
        return 1

    ws_dir = workspace_dir / ".magic"

    identity_path = ws_dir / "IDENTITY.md"
    if identity_path.exists() and not args.overwrite:
        print(json.dumps({
            "ok": False,
            "error": f"IDENTITY.md already exists at {identity_path}. Use --overwrite to replace.",
        }, ensure_ascii=False))
        return 2

    ws_dir.mkdir(parents=True, exist_ok=True)
    created: list[str] = []

    identity_path.write_text(_build_identity(cfg), encoding="utf-8")
    created.append("IDENTITY.md")

    agents_content = _build_agents(cfg)
    if agents_content:
        (ws_dir / "AGENTS.md").write_text(agents_content, encoding="utf-8")
        created.append("AGENTS.md")

    soul_content = _build_soul(cfg)
    if soul_content:
        (ws_dir / "SOUL.md").write_text(soul_content, encoding="utf-8")
        created.append("SOUL.md")

    # Clean up any unexpected runtime directories created in workspace
    _cleanup_unwanted_dirs(workspace_dir)

    print(json.dumps({
        "ok": True,
        "workspace": str(ws_dir),
        "mode": "single-language",
        "files_created": created,
        "message": f"Employee '{cfg['name']}' ({cfg['role']}) initialized with {len(created)} file(s) in single-language mode.",
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
