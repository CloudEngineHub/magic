import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.path_manager import PathManager
from app.utils.async_file_utils import (
    async_exists,
    async_mkdir,
    async_read_json,
    async_read_text,
    async_write_json,
    async_write_text,
)

MICRO_APP_MEMORY_FILE = "MICRO-APP.md"
LEGACY_HTML_APP_MEMORY_FILE = "HTML-APP.md"
MAGICBASE_DIR = ".magicbase"
MAGICBASE_MIGRATIONS_FILE = "migrations.json"
MAGICBASE_MODEL_START = "<!-- HTML_APP_MAGICBASE_DATA_MODEL_START -->"
MAGICBASE_MODEL_END = "<!-- HTML_APP_MAGICBASE_DATA_MODEL_END -->"


def now_utc_text() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def html_app_memory_path() -> Path:
    return PathManager.get_workspace_dir() / MICRO_APP_MEMORY_FILE


def legacy_html_app_memory_path() -> Path:
    return PathManager.get_workspace_dir() / LEGACY_HTML_APP_MEMORY_FILE


def magicbase_migrations_path() -> Path:
    return PathManager.get_workspace_dir() / MAGICBASE_DIR / MAGICBASE_MIGRATIONS_FILE


def is_html_app_memory_path(path: Path) -> bool:
    try:
        resolved = path.resolve()
        return resolved == html_app_memory_path().resolve() or resolved == legacy_html_app_memory_path().resolve()
    except Exception:
        return path.name in {MICRO_APP_MEMORY_FILE, LEGACY_HTML_APP_MEMORY_FILE} and path.parent == PathManager.get_workspace_dir()


def json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def table_id(table: Dict[str, Any]) -> str:
    return str(table.get("table_id") or table.get("tableId") or table.get("id") or "").strip()


def column_id(column: Dict[str, Any]) -> str:
    return str(column.get("column_id") or column.get("columnId") or column.get("id") or "").strip()


def normalize_column(column: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {
        "column_id": column_id(column),
        "column_key": column.get("column_key") or column.get("columnKey") or "",
        "column_name": column.get("column_name") or column.get("columnName") or "",
        "data_type": column.get("data_type") or column.get("dataType") or "",
        "is_required": column.get("is_required") if "is_required" in column else column.get("isRequired", False),
    }
    for key in ("default_value", "options", "dynamic_permission"):
        if column.get(key) is not None:
            normalized[key] = column.get(key)
    return {key: value for key, value in normalized.items() if value not in ("", None)}


def normalize_table(table: Dict[str, Any], planned_columns: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    columns = table.get("columns") or planned_columns or []
    normalized = {
        "table_id": table_id(table),
        "table_key": table.get("table_key") or table.get("tableKey") or "",
        "table_name": table.get("table_name") or table.get("tableName") or "",
        "description": table.get("description") or "",
        "columns": [normalize_column(column) for column in columns],
    }
    return {key: value for key, value in normalized.items() if value not in ("", None)}


def _merge_columns(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged = [json_safe(column) for column in existing]
    for column in incoming:
        normalized = normalize_column(column)
        key = normalized.get("column_key")
        cid = normalized.get("column_id")
        match_index = -1
        for index, current in enumerate(merged):
            if cid and current.get("column_id") == cid:
                match_index = index
                break
            if key and current.get("column_key") == key:
                match_index = index
                break
        if match_index >= 0:
            merged[match_index] = {**merged[match_index], **normalized}
        else:
            merged.append(normalized)
    return merged


def upsert_table_model(data_model: Dict[str, Any], table: Dict[str, Any], planned_columns: Optional[List[Dict[str, Any]]] = None) -> None:
    tables = data_model.setdefault("tables", [])
    incoming = normalize_table(table, planned_columns)
    tid = incoming.get("table_id")
    table_key = incoming.get("table_key")

    match_index = -1
    for index, current in enumerate(tables):
        if tid and current.get("table_id") == tid:
            match_index = index
            break
        if table_key and current.get("table_key") == table_key:
            match_index = index
            break

    if match_index >= 0:
        existing = tables[match_index]
        tables[match_index] = {
            **existing,
            **{key: value for key, value in incoming.items() if key != "columns"},
            "columns": _merge_columns(existing.get("columns") or [], incoming.get("columns") or []),
        }
    else:
        tables.append(incoming)


def upsert_column_model(data_model: Dict[str, Any], target_table_id: str, column: Dict[str, Any]) -> None:
    tables = data_model.setdefault("tables", [])
    for table in tables:
        if table.get("table_id") == target_table_id:
            table["columns"] = _merge_columns(table.get("columns") or [], [column])
            return
    tables.append({"table_id": target_table_id, "columns": [normalize_column(column)]})


def default_data_model() -> Dict[str, Any]:
    return {"tables": []}


def default_migrations_state() -> Dict[str, Any]:
    return {"migrations": [], "data_model": default_data_model()}


def default_html_app_memory_content() -> str:
    return f"""# MICRO-APP.md

这个文件是当前 workspace 中唯一微应用的项目记忆。HTML 页面不要读取它；README.md 不承担记忆职责。它只服务后续开发和迭代。

## 应用概览

- 暂未记录。

## 匿名与登录策略

- 暂未记录。

## 入口与文件

- 暂未记录。

## 已实现功能

- 暂未记录。

## MagicBase 数据模型

{MAGICBASE_MODEL_START}
- 暂无 MagicBase 表结构记录。
{MAGICBASE_MODEL_END}

## 运行说明

- 暂未记录。

## 铁律

- 暂未记录。

## 迭代历史

- 暂未记录。
"""


async def read_html_app_memory() -> str:
    path = html_app_memory_path()
    if await async_exists(path):
        return await async_read_text(path)
    legacy_path = legacy_html_app_memory_path()
    if await async_exists(legacy_path):
        return await async_read_text(legacy_path)
    return default_html_app_memory_content()


async def write_html_app_memory(content: str) -> None:
    await async_write_text(html_app_memory_path(), content)


async def read_migrations_state() -> Dict[str, Any]:
    path = magicbase_migrations_path()
    if not await async_exists(path):
        return default_migrations_state()

    data = await async_read_json(path)
    if not isinstance(data, dict):
        return default_migrations_state()
    migrations = data.get("migrations")
    if not isinstance(migrations, list):
        data["migrations"] = []
    data_model = data.get("data_model")
    if not isinstance(data_model, dict):
        data["data_model"] = default_data_model()
    if not isinstance(data["data_model"].get("tables"), list):
        data["data_model"]["tables"] = []
    return data


async def write_migrations_state(state: Dict[str, Any]) -> None:
    path = magicbase_migrations_path()
    await async_mkdir(path.parent, parents=True, exist_ok=True)
    await async_write_json(path, json_safe(state), ensure_ascii=False, indent=2)


def new_migration(operation: str, target: Dict[str, Any], planned_schema: Dict[str, Any], reason: str) -> Dict[str, Any]:
    return {
        "migration_id": f"mb_{operation}_{uuid.uuid4().hex[:8]}",
        "status": "Pending",
        "operation": operation,
        "target": json_safe(target),
        "planned_schema": json_safe(planned_schema),
        "reason": reason,
        "created_at": now_utc_text(),
    }


async def append_pending_migration(migration: Dict[str, Any]) -> None:
    state = await read_migrations_state()
    state["migrations"].append(migration)
    await write_migrations_state(state)


async def complete_migration(migration_id: str, status: str, error_summary: str = "") -> None:
    state = await read_migrations_state()
    for migration in state["migrations"]:
        if migration.get("migration_id") == migration_id:
            migration["status"] = status
            if status == "Success":
                migration["applied_at"] = now_utc_text()
            else:
                migration["failed_at"] = now_utc_text()
                migration["error_summary"] = error_summary
            break
    await write_migrations_state(state)


def _escape_md(value: Any) -> str:
    text = str(value or "").replace("\n", " ").strip()
    return text.replace("|", "\\|") or "-"


def render_magicbase_data_model_markdown(data_model: Dict[str, Any]) -> str:
    tables = data_model.get("tables") or []
    if not tables:
        return "- 暂无 MagicBase 表结构记录。"

    blocks: List[str] = []
    for table in tables:
        title = table.get("table_name") or table.get("table_key") or table.get("table_id") or "未命名表"
        blocks.append(f"### {title}")
        blocks.append("")
        blocks.append(f"- Table ID: `{_escape_md(table.get('table_id'))}`")
        if table.get("table_key"):
            blocks.append(f"- Table Key: `{_escape_md(table.get('table_key'))}`")
        if table.get("description"):
            blocks.append(f"- 说明：{_escape_md(table.get('description'))}")
        blocks.append("")
        columns = table.get("columns") or []
        if not columns:
            blocks.append("- 字段：暂未记录。")
            blocks.append("")
            continue
        blocks.append("| 字段 Key | 字段名 | 类型 | 必填 | Column ID |")
        blocks.append("| --- | --- | --- | --- | --- |")
        for column in columns:
            required = "是" if column.get("is_required") else "否"
            blocks.append(
                "| "
                f"`{_escape_md(column.get('column_key'))}` | "
                f"{_escape_md(column.get('column_name'))} | "
                f"`{_escape_md(column.get('data_type'))}` | "
                f"{required} | "
                f"`{_escape_md(column.get('column_id'))}` |"
            )
        blocks.append("")
    return "\n".join(blocks).rstrip()


def _replace_magicbase_section(content: str, markdown: str) -> str:
    block = f"{MAGICBASE_MODEL_START}\n{markdown.rstrip()}\n{MAGICBASE_MODEL_END}"
    start = content.find(MAGICBASE_MODEL_START)
    end = content.find(MAGICBASE_MODEL_END)
    if start >= 0 and end >= 0 and end > start:
        return content[:start] + block + content[end + len(MAGICBASE_MODEL_END):]

    heading = "## MagicBase 数据模型"
    heading_index = content.find(heading)
    if heading_index >= 0:
        next_heading = content.find("\n## ", heading_index + len(heading))
        if next_heading >= 0:
            return content[:heading_index] + f"{heading}\n\n{block}\n" + content[next_heading:]
        return content[:heading_index] + f"{heading}\n\n{block}\n"

    return content.rstrip() + f"\n\n{heading}\n\n{block}\n"


async def sync_html_app_magicbase_model(data_model: Dict[str, Any]) -> None:
    content = await read_html_app_memory()
    content = _replace_magicbase_section(content, render_magicbase_data_model_markdown(data_model))
    await write_html_app_memory(content)


async def record_table_success(migration_id: str, table: Dict[str, Any], planned_columns: List[Dict[str, Any]]) -> None:
    state = await read_migrations_state()
    upsert_table_model(state["data_model"], table, planned_columns)
    for migration in state["migrations"]:
        if migration.get("migration_id") == migration_id:
            migration["status"] = "Success"
            migration["applied_at"] = now_utc_text()
            migration["result_table_id"] = table_id(table)
            break
    await write_migrations_state(state)
    await sync_html_app_magicbase_model(state["data_model"])


async def record_column_success(migration_id: str, target_table_id: str, column: Dict[str, Any]) -> None:
    state = await read_migrations_state()
    upsert_column_model(state["data_model"], target_table_id, column)
    for migration in state["migrations"]:
        if migration.get("migration_id") == migration_id:
            migration["status"] = "Success"
            migration["applied_at"] = now_utc_text()
            migration["result_column_id"] = column_id(column)
            break
    await write_migrations_state(state)
    await sync_html_app_magicbase_model(state["data_model"])
