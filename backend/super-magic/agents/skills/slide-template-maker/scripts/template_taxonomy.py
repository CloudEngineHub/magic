#!/usr/bin/env python3
"""Sync and query the bundled slide template category and tag taxonomy."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_TAXONOMY = Path(__file__).resolve().parent.parent / "references" / "template-taxonomy.json"


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_taxonomy(path: Path) -> dict[str, Any]:
    data = _read_json(path)
    if not isinstance(data, dict):
        raise ValueError("Taxonomy root must be an object.")
    return data


def _sync(categories_path: Path, tags_path: Path, output_path: Path) -> None:
    categories = _read_json(categories_path)
    tags_source = _read_json(tags_path)
    if not isinstance(categories, list) or not isinstance(tags_source, dict):
        raise ValueError("Unexpected taxonomy source format.")
    groups = tags_source.get("groups")
    tags = tags_source.get("tags")
    if not isinstance(groups, list) or not isinstance(tags, list):
        raise ValueError("Tag source must contain groups and tags arrays.")

    category_codes = [item.get("code") for item in categories]
    group_codes = [item.get("code") for item in groups]
    tag_codes = [item.get("code") for item in tags]
    for label, codes in (
        ("category", category_codes),
        ("group", group_codes),
        ("tag", tag_codes),
    ):
        if any(not isinstance(code, str) or not code for code in codes):
            raise ValueError(f"Every {label} must have a non-empty code.")
        if len(codes) != len(set(codes)):
            raise ValueError(f"Duplicate {label} code found.")
    unknown_groups = sorted({item.get("group_code") for item in tags} - set(group_codes))
    if unknown_groups:
        raise ValueError(f"Tags reference unknown groups: {', '.join(unknown_groups)}")

    payload = {
        "schema_version": "1.0",
        "source": {
            "categories_file": categories_path.name,
            "categories_sha256": _sha256(categories_path),
            "tags_file": tags_path.name,
            "tags_sha256": _sha256(tags_path),
        },
        "categories": sorted(categories, key=lambda item: (-int(item.get("sort", 0)), item["code"])),
        "groups": sorted(groups, key=lambda item: (-int(item.get("sort", 0)), item["code"])),
        "tags": sorted(
            tags,
            key=lambda item: (
                group_codes.index(item["group_code"]),
                -int(item.get("sort", 0)),
                item["code"],
            ),
        ),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {len(categories)} categories, {len(groups)} groups, and {len(tags)} tags to {output_path}"
    )


def _localized_name(item: dict[str, Any]) -> str:
    names = item.get("name_i18n") if isinstance(item.get("name_i18n"), dict) else {}
    return f"{names.get('zh_CN', '')} | {names.get('en_US', '')}".strip(" |")


def _list_categories(data: dict[str, Any]) -> None:
    for item in data.get("categories", []):
        if item.get("status") == 1:
            print(f"{item['code']}\t{_localized_name(item)}")


def _list_groups(data: dict[str, Any]) -> None:
    counts: dict[str, int] = {}
    for tag in data.get("tags", []):
        counts[tag["group_code"]] = counts.get(tag["group_code"], 0) + 1
    for item in data.get("groups", []):
        print(f"{item['code']}\t{_localized_name(item)}\t{counts.get(item['code'], 0)} tags")


def _search_tags(data: dict[str, Any], query: str, group: str | None) -> None:
    needle = query.casefold().strip()
    matches = []
    for item in data.get("tags", []):
        if group and item.get("group_code") != group:
            continue
        haystack = " ".join((item.get("code", ""), _localized_name(item))).casefold()
        if not needle or needle in haystack:
            matches.append(item)
    for item in matches:
        print(f"{item['code']}\t{item['group_code']}\t{_localized_name(item)}")
    if not matches:
        raise SystemExit("No matching tags found.")


def _validate(data: dict[str, Any], category: str, tags: list[str]) -> None:
    category_codes = {item["code"] for item in data.get("categories", []) if item.get("status") == 1}
    tag_codes = {item["code"] for item in data.get("tags", [])}
    errors = []
    if category not in category_codes:
        errors.append(f"Unknown or inactive category: {category}")
    if not tags:
        errors.append("At least one tag code is required.")
    duplicates = sorted({code for code in tags if tags.count(code) > 1})
    if duplicates:
        errors.append(f"Duplicate tag codes: {', '.join(duplicates)}")
    unknown_tags = sorted(set(tags) - tag_codes)
    if unknown_tags:
        errors.append(f"Unknown tag codes: {', '.join(unknown_tags)}")
    if errors:
        raise SystemExit("\n".join(errors))
    print("Taxonomy selection is valid.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--taxonomy", type=Path, default=DEFAULT_TAXONOMY)
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_parser = subparsers.add_parser("sync", help="Build the bundled taxonomy snapshot from source JSON files.")
    sync_parser.add_argument("--categories", type=Path, required=True)
    sync_parser.add_argument("--tags", type=Path, required=True)
    sync_parser.add_argument("--output", type=Path, default=DEFAULT_TAXONOMY)

    subparsers.add_parser("categories", help="List active category codes.")
    subparsers.add_parser("groups", help="List tag groups and counts.")

    search_parser = subparsers.add_parser("search", help="Search tags by code or localized name.")
    search_parser.add_argument("query", nargs="?", default="")
    search_parser.add_argument("--group")

    validate_parser = subparsers.add_parser("validate", help="Validate one category and tag selection.")
    validate_parser.add_argument("--category", required=True)
    validate_parser.add_argument("--tags", nargs="+", required=True)

    args = parser.parse_args()
    if args.command == "sync":
        _sync(args.categories, args.tags, args.output)
        return
    data = _load_taxonomy(args.taxonomy)
    if args.command == "categories":
        _list_categories(data)
    elif args.command == "groups":
        _list_groups(data)
    elif args.command == "search":
        _search_tags(data, args.query, args.group)
    elif args.command == "validate":
        _validate(data, args.category, args.tags)


if __name__ == "__main__":
    main()
