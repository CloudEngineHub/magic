#!/usr/bin/env python3
"""
Initialize a minimal set of employee definition files in .workspace/.magic/.

Reads a JSON config (via --config <path>) containing employee metadata
and generates the appropriate definition files.

Usage:
    python scripts/init_crew.py --config /path/to/config.json [--overwrite]

Config JSON schema:
    # Single-language mode (default) — fields in user's preferred language:
    {
        "name":            "Research Assistant",        # required
        "role":            "Academic Researcher",       # required
        "description":     "A professional research assistant",  # required
        "role_body":       "You are an academic researcher...",  # optional (IDENTITY.md body)
        "personality":     "Rigorous, concise...",      # optional -> SOUL.md
        "personality_en":  "Rigorous, concise...",      # optional English translation
        "instructions":    "Workflow...",               # optional -> AGENTS.md
        "instructions_en": "Workflow...",               # optional English translation
    }

    # Multilingual mode — add _cn or _en suffixed fields for translations.
    # Base fields remain the primary language. Suffixed fields are written as
    # ordinary language-specific sections, not HTML comments.
    {
        "name":            "Research Assistant",
        "name_en":         "Research Assistant",
        "role":            "Academic Researcher",
        "role_en":         "Academic Researcher",
        "description":     "A professional research assistant",
        "description_en":  "A professional research assistant",
        "role_body":       "You are an academic researcher...",
        "role_body_en":    "You are an academic researcher...",
        "personality":     "Rigorous, concise...",
        "personality_en":  "Rigorous, concise...",
        "instructions":    "Workflow...",
        "instructions_en": "Workflow..."
    }

Files generated:
    .workspace/.magic/IDENTITY.md   — always
    .workspace/.magic/AGENTS.md     — if instructions provided
    .workspace/.magic/SOUL.md       — if personality provided
    (TOOLS.md / SKILLS.md are intentionally NOT created so the system uses defaults)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# agents/skills/_shared/ is under parents[2] for all skill scripts.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from _shared.bootstrap import get_project_root


REQUIRED_FIELDS = ("name", "role", "description")

# Mapping from suffix to section heading
SUFFIX_LABEL: dict[str, str] = {
    "_cn": "Chinese",
    "_en": "English",
}


def _has_translations(cfg: dict) -> bool:
    """Check if the config has any translation (suffixed) fields."""
    return any(k.endswith(tuple(SUFFIX_LABEL)) for k in cfg)


def _wrap_body(body: str, cfg: dict, field: str) -> str:
    """
    Format body text. In multilingual mode, keep the primary content first and
    append translations as ordinary language-specific sections.
    `field` is the base field name (e.g. "role_body", "instructions", "personality").
    """
    if not _has_translations(cfg):
        return f"{body}\n"

    parts: list[str] = [body]
    for suffix, label in SUFFIX_LABEL.items():
        translation = cfg.get(f"{field}{suffix}")
        if translation:
            parts.append(f"## {label}\n\n{translation}")

    return "\n\n".join(parts) + "\n"


def _build_identity(cfg: dict) -> str:
    header_lines = [
        "---",
        f"name: {cfg['name']}",
        f"role: {cfg['role']}",
        f"description: {cfg['description']}",
    ]

    # Add suffixed header fields for multilingual mode
    for suffix in SUFFIX_LABEL:
        for field in ("name", "role", "description"):
            value = cfg.get(f"{field}{suffix}")
            if value:
                header_lines.append(f"{field}{suffix}: {value}")

    header_lines.append("---")
    header = "\n".join(header_lines) + "\n"

    # Build body with language-aware default
    body = cfg.get("role_body") or ""
    if not body:
        role = cfg["role"]
        desc = cfg["description"]
        body = f"Role: {role}\n\nDescription: {desc}"

    return f"{header}\n{_wrap_body(body, cfg, 'role_body')}"


def _build_agents(cfg: dict) -> str | None:
    body = cfg.get("instructions")
    if not body:
        return None
    return _wrap_body(body, cfg, "instructions")


def _build_soul(cfg: dict) -> str | None:
    body = cfg.get("personality")
    if not body:
        return None
    return _wrap_body(body, cfg, "personality")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Initialize employee definition files in .workspace/.magic/",
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

    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = Path.cwd() / config_path
    if not config_path.is_file():
        print(json.dumps({"ok": False, "error": f"Config file not found: {config_path}"}, ensure_ascii=False))
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

    project_root = get_project_root()
    ws_dir = project_root / ".workspace" / ".magic"

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

    multilingual = _has_translations(cfg)
    mode = "multilingual" if multilingual else "single-language"
    print(json.dumps({
        "ok": True,
        "workspace": str(ws_dir),
        "mode": mode,
        "files_created": created,
        "message": f"Employee '{cfg['name']}' ({cfg['role']}) initialized with {len(created)} file(s) in {mode} mode.",
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
