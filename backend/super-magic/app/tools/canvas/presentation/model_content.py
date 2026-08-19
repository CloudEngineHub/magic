"""生成仅供大模型继续决策的 ToolResult.content。"""

from __future__ import annotations

import json
from typing import Any


def overview_content(result: dict[str, Any]) -> str:
    """生成概览工具的模型可读文本。"""
    lines = [
        "Canvas overview completed.",
        f"- Project path: {result['project_path']}",
        f"- Elements: {result['total_elements']}",
        f"- Connections: {result['total_connections']}",
        f"- Page: {result['page']} | Limit: {result['limit']} | Has more: {str(result['has_more']).lower()}",
    ]
    for element in result["elements"]:
        lines.append(
            f"- element_id={element['element_id']} | type={element['element_type']} | "
            f"name={element.get('name') or '-'} | position=({element.get('x')}, {element.get('y')}) | "
            f"size={element.get('width')}x{element.get('height')} | contents={element['content_count']} | "
            f"parent_element_id={element.get('parent_element_id') or '-'} | depth={element.get('depth', 0)} | "
            f"child_count={element.get('child_count', 0)} | "
            f"active_content_id={element.get('active_content_id') or '-'} | "
            f"main_content_id={element.get('main_content_id') or '-'} | status={element.get('status') or '-'} | "
            f"incoming={len(element.get('incoming') or [])} | outgoing={len(element.get('outgoing') or [])}"
        )
    lines.append("Next: call query_canvas_element_details with exact Element IDs when full details are needed.")
    return "\n".join(lines)


def elements_content(result: dict[str, Any]) -> str:
    """生成详情工具的模型可读文本。"""
    lines = [
        "Canvas Element details returned.",
        f"- Project path: {result['project_path']}",
        f"- Elements: {len(result['elements'])}",
        f"- details_complete: {str(result.get('details_complete', True)).lower()}",
    ]
    for element in result["elements"]:
        lines.append(f"Element {element['element_id']}:")
        lines.append(
            f"- type={element['element_type']} | name={element.get('name') or '-'} | "
            f"parent_element_id={element.get('parent_element_id') or '-'} | depth={element.get('depth', 0)}"
        )
        layout = element.get("layout") or {}
        if layout:
            lines.append(
                "- layout="
                + ", ".join(f"{key}={layout[key]}" for key in ("x", "y", "width", "height", "z_index") if key in layout)
            )
        child_ids = element.get("child_element_ids") or []
        lines.append(f"- child_element_ids={','.join(child_ids) if child_ids else '-'}")
        lines.append(
            f"- active_content_id={element.get('active_content_id') or '-'} | "
            f"main_content_id={element.get('main_content_id') or '-'}"
        )
        for content in element.get("contents") or []:
            fields = [
                f"content_id={content['content_id']}",
                f"status={content.get('status') or '-'}",
                f"source={content.get('source') or '-'}",
            ]
            for key in ("asset_path", "generation_task_id", "retry_count", "error_message"):
                if content.get(key) is not None:
                    fields.append(f"{key}={content[key]}")
            parameters = content.get("generation_parameters") or {}
            if parameters.get("prompt"):
                fields.append(f"prompt={parameters['prompt']}")
            payload = content.get("payload")
            if isinstance(payload, dict) and payload.get("content") is not None:
                fields.append(f"content={_compact_value(payload['content'])}")
            lines.append("- content: " + " | ".join(fields))
        for child in element.get("children") or []:
            lines.append(
                f"- child={child['element_id']} | type={child['element_type']} | "
                f"parent_element_id={child['parent_element_id']} | depth={child['depth']}"
            )
        for connection in element.get("connections") or []:
            lines.append(
                f"- connection_id={connection['connection_id']} | "
                f"source_element_id={connection['source_element_id']} | "
                f"target_element_id={connection['target_element_id']}"
            )
    lines.append(f"Connections ({len(result['connections'])}):")
    for connection in result["connections"]:
        lines.append(
            f"- connection_id={connection['connection_id']} | "
            f"source_element_id={connection['source_element_id']} | "
            f"target_element_id={connection['target_element_id']}"
        )
    for warning in result.get("warnings", []):
        lines.append(f"- Warning: {warning}")
    return "\n".join(lines)


def _compact_value(value: Any) -> str:
    """把用户内容压缩成可读单行，避免把内部 DTO 原样注入模型上下文。"""
    if isinstance(value, str):
        return value.replace("\n", " ")[:500]
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:500]


def items_content(summary: str, result: dict[str, Any]) -> str:
    """生成批量工具的模型可读逐项摘要。"""
    lines = [summary]
    for item in result.get("items", []):
        ordered_keys = (
            "item_ref",
            "status",
            "element_id",
            "content_id",
            "connection_id",
            "frame_element_id",
            "child_element_ids",
            "parent_element_id",
            "depth",
            "padding",
            "source_element_id",
            "target_element_id",
            "strategy",
            "previous_main_content_id",
            "main_content_id",
            "active_content_id",
            "removed_connection_ids",
            "generation_task_id",
            "output_uri",
            "error_code",
            "error",
            "reason",
            "query_error",
            "persistence_warning",
            "persistence_error",
            "timed_out",
            "already_finalized",
            "next_action",
        )
        values = []
        for key in ordered_keys:
            value = item.get(key)
            if value is None or value == []:
                continue
            if key == "error":
                value = "Generation failed; report the failure and retry only after explicit user confirmation."
            elif key in {"query_error", "persistence_error"}:
                value = "Generation status is temporarily unavailable; continue with the same task ID."
            if isinstance(value, (list, dict)):
                rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            elif isinstance(value, bool):
                rendered = str(value).lower()
            else:
                rendered = str(value)
            values.append(f"{key}={rendered}")
        lines.append("- " + " | ".join(values))
    if any(
        item.get("generation_task_id") and item.get("status") in {"pending", "processing"}
        for item in result.get("items", [])
    ):
        lines.append("Next: call wait_canvas_generation with the returned generation_task_id values.")
    if any(item.get("timed_out") for item in result.get("items", [])):
        lines.append("Continue waiting with the same generation_task_id; do not create a duplicate generation task.")
    return "\n".join(lines)
