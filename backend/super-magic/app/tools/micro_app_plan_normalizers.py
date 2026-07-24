"""微应用开发计划参数的兼容解析与规范化。"""

import json
import re
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []

        parsed = try_parse_json(text)
        if parsed is not None and parsed is not value:
            return normalize_string_list(parsed)

        return [item for line in text.splitlines() if (item := normalize_list_line(line))]

    if not isinstance(value, list):
        return []
    return [text for item in value if (text := normalize_text(item))]


def normalize_data_model_fields(value: Any) -> List[Union[str, Dict[str, Any]]]:
    """保留字段对象，避免 ToolDetail 把结构化数据转换成 Python 字典文本。"""

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []

        parsed = try_parse_json(text)
        if parsed is not None and parsed is not value:
            return normalize_data_model_fields(parsed)

        return [item for line in text.splitlines() if (item := normalize_list_line(line))]

    if not isinstance(value, list):
        return []

    fields: List[Union[str, Dict[str, Any]]] = []
    for item in value:
        structured = to_plain_dict(item)
        if structured:
            fields.append(structured)
            continue

        text = normalize_text(item)
        if text:
            fields.append(text)
    return fields


def normalize_files(value: Any) -> List[Dict[str, str]]:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []

        parsed = try_parse_json(text)
        if parsed is not None and parsed is not value:
            return normalize_files(parsed)

        structured = parse_structured_block_list(text)
        if structured:
            return [
                {"path": normalize_text(item.get("path")), "purpose": normalize_text(item.get("purpose"))}
                for item in structured
                if normalize_text(item.get("path")) or normalize_text(item.get("purpose"))
            ]

        return [{"path": item, "purpose": ""} for item in normalize_string_list(text)]

    if not isinstance(value, list):
        return []

    files: List[Dict[str, str]] = []
    for item in value:
        raw = to_plain_dict(item)
        path = normalize_text(raw.get("path"))
        purpose = normalize_text(raw.get("purpose"))
        if path or purpose:
            files.append({"path": path, "purpose": purpose})
    return files


def normalize_data_model(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []

        parsed = try_parse_json(text)
        if parsed is not None and parsed is not value:
            return normalize_data_model(parsed)

        structured = parse_structured_block_list(text)
        return [
            {
                "table_name": normalize_text(item.get("table_name") or item.get("tableName") or item.get("name")),
                "purpose": normalize_text(item.get("purpose")),
                "fields": normalize_data_model_fields(item.get("fields")),
            }
            for item in structured
            if (
                normalize_text(item.get("table_name") or item.get("tableName") or item.get("name"))
                or normalize_text(item.get("purpose"))
                or normalize_data_model_fields(item.get("fields"))
            )
        ]

    if not isinstance(value, list):
        return []

    tables: List[Dict[str, Any]] = []
    for item in value:
        raw = to_plain_dict(item)
        table_name = normalize_text(raw.get("table_name"))
        purpose = normalize_text(raw.get("purpose"))
        fields = normalize_data_model_fields(raw.get("fields"))
        if table_name or purpose or fields:
            tables.append({"table_name": table_name, "purpose": purpose, "fields": fields})
    return tables


def to_plain_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, BaseModel):
        return value.model_dump()
    return {}


def try_parse_json(text: str) -> Optional[Any]:
    if not text or text[0] not in "[{":
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def normalize_list_line(line: str) -> str:
    text = line.strip()
    if not text:
        return ""
    text = re.sub(r"^[-*]\s+", "", text)
    text = re.sub(r"^\d+[.)、]\s*", "", text)
    return text.strip()


def parse_structured_block_list(text: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    current: Dict[str, Any] = {}
    last_key = ""

    def flush_current() -> None:
        nonlocal current, last_key
        if current:
            items.append(current)
        current = {}
        last_key = ""

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        is_new_item = stripped.startswith("- ")
        line = stripped[2:].strip() if is_new_item else stripped
        if is_new_item and current and ":" in line:
            flush_current()

        if ":" in line:
            key, raw_value = line.split(":", 1)
            normalized_key = key.strip()
            value = raw_value.strip()
            if normalized_key:
                if normalized_key == "fields":
                    current[normalized_key] = normalize_string_list(value)
                else:
                    current[normalized_key] = value
                last_key = normalized_key
            continue

        if not current:
            current["path"] = normalize_list_line(line)
            last_key = "path"
        elif last_key:
            previous = current.get(last_key)
            addition = normalize_list_line(line)
            if isinstance(previous, list):
                if addition:
                    previous.append(addition)
            elif addition:
                current[last_key] = f"{previous} {addition}".strip() if previous else addition

    flush_current()
    return items
