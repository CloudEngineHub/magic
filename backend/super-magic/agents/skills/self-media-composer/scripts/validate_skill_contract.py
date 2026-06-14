#!/usr/bin/env python3
"""Validate the self-media composer skill contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT.parent

OPS_SOURCE_VALUES = ["real-platform", "user", "reference", "generated", "mixed"]
OPS_METRIC_KEYS = ["reads", "likes", "saves", "comments", "shares", "follows", "conversions"]
OPS_DERIVED_METRIC_KEYS = [
    "engagementRate",
    "saveRate",
    "shareRate",
    "commentRate",
    "followRate",
    "conversionRate",
]
OPS_FETCH_STATUS_VALUES = ["pending", "fetched", "failed"]
OPS_SENTIMENT_VALUES = ["positive", "neutral", "negative", "question"]
OPS_INTENT_VALUES = [
    "consult",
    "buy",
    "question",
    "objection",
    "praise",
    "topic-suggestion",
    "case-request",
    "share-intent",
    "save-intent",
    "other",
]


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_file(path: str) -> str:
    target = ROOT / path
    if not target.is_file() or target.stat().st_size == 0:
        fail(f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def require_external_file(path: Path, label: str) -> str:
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"missing required file: {label}")
    return path.read_text(encoding="utf-8")


def require_text(text: str, needles: list[str], label: str) -> None:
    missing = [needle for needle in needles if needle not in text]
    if missing:
        fail(f"{label} missing: {', '.join(missing)}")


def require_absent(text: str, needles: list[str], label: str) -> None:
    hits = [needle for needle in needles if needle in text]
    if hits:
        fail(f"{label} must not contain: {', '.join(hits)}")


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
            "立即同步",
            "真实数据刷新",
            "Human Writing Style",
            "4.4.0 Build the human-writing brief",
            "4.4.2 Human-writing self-check",
            "人味",
            "__brand/brand-config.json",
        ],
        "SKILL.md",
    )
    require_absent(skill, ["brand-info", "brand-info.json", "brand-info.md"], "SKILL.md")
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
            "ops/metrics.json.metrics",
            "derivedMetrics",
            "collects",
            "topic-suggestion",
            "ai-card-generator",
        ],
        "references/failure-modes.md",
    )
    require_text(
        text,
        OPS_METRIC_KEYS
        + OPS_DERIVED_METRIC_KEYS
        + OPS_SENTIMENT_VALUES
        + OPS_INTENT_VALUES,
        "references/failure-modes.md",
    )
    require_no_external_skill_refs(text, "references/failure-modes.md")


def validate_ops_contract() -> None:
    text = require_file("references/file-formats.md")
    require_text(
        text,
        [
            "Fixed ops vocabulary",
            "`ops/source.json`",
            "`ops/metrics.json`",
            "`ops/comments.json`",
            "`ops/review.html`",
            "Do not invent new metric",
            "Allowed data source values",
            "Allowed metric keys",
            "Allowed derived metric keys",
            "Allowed `fetchStatus` values",
            "Allowed `comments[].sentiment` values",
            "Allowed `comments[].intent` values",
            "Metric values must be one of",
            "Legacy compatibility",
            "Treat it as a read-only alias of `saves`",
            "New syncs and manual updates must write `saves`, not `collects`",
            "Unknown platform-specific numbers",
            "It must not generate AI Card artifacts",
        ],
        "references/file-formats.md",
    )
    require_text(
        text,
        OPS_SOURCE_VALUES
        + OPS_METRIC_KEYS
        + OPS_DERIVED_METRIC_KEYS
        + OPS_FETCH_STATUS_VALUES
        + OPS_SENTIMENT_VALUES
        + OPS_INTENT_VALUES,
        "references/file-formats.md",
    )


def validate_tool_decision_tree() -> None:
    text = require_file("references/tool-decision-tree.md")
    require_text(
        text,
        [
            "Need brand context but draft global fields are missing",
            "__brand/brand-config.json",
            "发布入盘",
            "post-publication review",
            "fixed ops schema",
            "ops/source.json.fetchStatus",
            "ops/metrics.json.metrics",
            "ops/metrics.json.derivedMetrics",
            "ops/comments.json comments[].sentiment",
            "ops/comments.json comments[].intent",
            "legacy collects",
            "Do not create AI Card artifacts",
        ]
        + OPS_METRIC_KEYS
        + OPS_DERIVED_METRIC_KEYS
        + OPS_SENTIMENT_VALUES
        + OPS_INTENT_VALUES,
        "references/tool-decision-tree.md",
    )
    require_absent(text, ["brand-info", "brand-info.json", "brand-info.md"], "references/tool-decision-tree.md")


def validate_drafts_format() -> None:
    text = require_file("references/drafts-format.md")
    require_text(
        text,
        [
            "__brand/",
            "__brand/brand-config.json",
            "Brand config fallback",
        ],
        "references/drafts-format.md",
    )
    require_absent(text, ["brand-info", "brand-info.json", "brand-info.md"], "references/drafts-format.md")


def validate_ai_card_boundary() -> None:
    text = require_external_file(SKILLS_ROOT / "ai-card-generator" / "SKILL.md", "ai-card-generator/SKILL.md")
    require_text(
        text,
        [
            "Self-Media Operations Boundary",
            "do not generate or update `ops/*` files",
            "Route the work to `self-media-composer`",
            "It must not create, overwrite, backfill, or pretend to fetch self-media operation data.",
        ],
        "ai-card-generator/SKILL.md",
    )
    require_absent(
        text,
        [
            "Self-Media Operations Review Dashboards",
            "The data-sync task reads `ops/source.json`",
            "The card must include, at minimum",
        ],
        "ai-card-generator/SKILL.md",
    )


def validate_test_prompts() -> None:
    prompts = json.loads(require_file("test-prompts.json"))
    ids = {item.get("id") for item in prompts}
    required = {
        "rednote-human-voice",
        "wechat-human-voice",
        "self-media-ops-fixed-schema",
        "self-media-ops-immediate-sync-trigger",
        "self-media-brand-config-file-fallback",
    }
    missing = sorted(required - ids)
    if missing:
        fail(f"test-prompts.json missing ids: {', '.join(missing)}")

    for item in prompts:
        if not item.get("prompt") or not item.get("expected"):
            fail(f"prompt {item.get('id')} missing prompt or expected")
    require_no_external_skill_refs(json.dumps(prompts, ensure_ascii=False), "test-prompts.json")
    require_absent(json.dumps(prompts, ensure_ascii=False), ["brand-info", "brand-info.json", "brand-info.md"], "test-prompts.json")


def main() -> None:
    validate_skill_md()
    validate_human_writing_reference()
    validate_failure_modes()
    validate_ops_contract()
    validate_tool_decision_tree()
    validate_drafts_format()
    validate_ai_card_boundary()
    validate_test_prompts()
    print("self-media-composer skill contract ok")


if __name__ == "__main__":
    main()
