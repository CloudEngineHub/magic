#!/usr/bin/env python3
"""Validate the self-media composer skill contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_file(path: str) -> str:
    target = ROOT / path
    if not target.is_file() or target.stat().st_size == 0:
        fail(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def require_text(text: str, needles: list[str], label: str) -> None:
    missing = [needle for needle in needles if needle not in text]
    if missing:
        fail(f"{label} missing: {', '.join(missing)}")


def require_no_external_skill_refs(text: str, label: str) -> None:
    banned = [
        "humanize" + "-writing",
        "content" + "-humanizer",
        "skills" + ".sh",
        "jpegg" + "dev",
        "alireza" + "rezvani",
        "skills" + ".volces" + ".com",
    ]
    hits = [item for item in banned if item in text]
    if hits:
        fail(f"{label} must not reference external skill sources: {', '.join(hits)}")


def validate_skill_md() -> None:
    skill = require_file("SKILL.md")
    frontmatter = re.match(r"^---\n(?P<body>[\s\S]*?)\n---", skill)
    if not frontmatter:
        fail("SKILL.md missing YAML frontmatter")
    if len(frontmatter.group("body")) > 1024:
        fail("frontmatter exceeds 1024 characters")

    require_text(
        skill,
        [
            "references/human-writing-style.md",
            "Human Writing Style",
            "4.4.0 Build the human-writing brief",
            "4.4.2 Human-writing self-check",
            "人味",
        ],
        "SKILL.md",
    )
    require_no_external_skill_refs(skill, "SKILL.md")


def validate_human_writing_reference() -> None:
    text = require_file("references/human-writing-style.md")
    require_text(
        text,
        [
            "# Human Writing Style",
            "人味",
            "作者声音",
            "写作前四问",
            "小红书",
            "公众号",
            "假人味",
            "AI 通稿味",
            "自检",
        ],
        "references/human-writing-style.md",
    )
    require_no_external_skill_refs(text, "references/human-writing-style.md")


def validate_failure_modes() -> None:
    text = require_file("references/failure-modes.md")
    require_text(
        text,
        [
            "AI 通稿味",
            "假人味",
            "作者声音",
        ],
        "references/failure-modes.md",
    )
    require_no_external_skill_refs(text, "references/failure-modes.md")


def validate_test_prompts() -> None:
    prompts = json.loads(require_file("test-prompts.json"))
    ids = {item.get("id") for item in prompts}
    required = {"rednote-human-voice", "wechat-human-voice"}
    missing = sorted(required - ids)
    if missing:
        fail(f"test-prompts.json missing ids: {', '.join(missing)}")

    for item in prompts:
        if not item.get("prompt") or not item.get("expected"):
            fail(f"prompt {item.get('id')} missing prompt or expected")
    require_no_external_skill_refs(json.dumps(prompts, ensure_ascii=False), "test-prompts.json")


def main() -> None:
    validate_skill_md()
    validate_human_writing_reference()
    validate_failure_modes()
    validate_test_prompts()
    print("self-media-composer skill contract ok")


if __name__ == "__main__":
    main()
