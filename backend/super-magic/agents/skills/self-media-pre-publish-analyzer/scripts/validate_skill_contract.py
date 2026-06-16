#!/usr/bin/env python3
"""Validate the self-media pre-publish analyzer skill contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_text(text: str, needles: list[str], label: str) -> None:
    missing = [needle for needle in needles if needle not in text]
    if missing:
        fail(f"{label} missing: {', '.join(missing)}")


def require_file(path: str) -> str:
    target = ROOT / path
    if not target.is_file() or target.stat().st_size == 0:
        fail(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def validate_skill_md() -> None:
    skill = require_file("SKILL.md")
    require_text(
        skill,
        [
            "references/rednote-rubrics.md",
            "references/wechat-official-rubrics.md",
            "references/comparison-protocol.md",
            "evidence ledger",
            "证据清单",
            "二级分项",
            "目标场景判断",
            "Do Not",
            "STOP",
            "CHECKPOINT",
        ],
        "SKILL.md",
    )

    frontmatter = re.match(r"^---\n(?P<body>[\s\S]*?)\n---", skill)
    if not frontmatter:
        fail("SKILL.md missing YAML frontmatter")
    if len(frontmatter.group("body")) > 1024:
        fail("frontmatter exceeds 1024 characters")


def validate_reference(path: str, expected_terms: list[str]) -> None:
    text = require_file(path)
    require_text(text, ["Total: 100", "Base Scorecard", "Goal Scenario"], path)
    require_text(text, expected_terms, path)


def validate_test_prompts() -> None:
    prompts = json.loads(require_file("test-prompts.json"))
    if len(prompts) < 8:
        fail("test-prompts.json must include six platform-goal prompts plus edge cases")

    required_ids = {
        "rednote-ip-growth",
        "rednote-conversion",
        "rednote-viral-traffic",
        "wechat-ip-growth",
        "wechat-conversion",
        "wechat-viral-traffic",
        "missing-post-folder",
        "web-search-limited",
    }
    ids = {item.get("id") for item in prompts}
    missing_ids = sorted(required_ids - ids)
    if missing_ids:
        fail(f"test-prompts.json missing ids: {', '.join(missing_ids)}")

    for item in prompts:
        if not item.get("prompt") or not item.get("expected"):
            fail(f"prompt {item.get('id')} missing prompt or expected")
        must_include = item.get("mustInclude")
        if not isinstance(must_include, list) or not must_include:
            fail(f"prompt {item.get('id')} missing mustInclude checks")


def main() -> None:
    validate_skill_md()
    validate_reference(
        "references/rednote-rubrics.md",
        ["Cover first-screen attraction", "Card narrative", "IP增长", "产品转化", "爆文流量"],
    )
    validate_reference(
        "references/wechat-official-rubrics.md",
        ["Long-form structure", "Mobile formatting", "IP增长", "产品转化", "爆文流量"],
    )
    comparison = require_file("references/comparison-protocol.md")
    require_text(
        comparison,
        ["Search Plan", "Comparable Sample Selection", "Source Handling", "Comparison Table", "Confidence Rules"],
        "comparison-protocol.md",
    )
    validate_test_prompts()
    print("self-media-pre-publish-analyzer skill contract ok")


if __name__ == "__main__":
    main()
