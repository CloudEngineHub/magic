# MagicBase runtime operations

Use the existing runtime database methods. The engine supplies the project and authenticated user context; the model supplies only business arguments.

| Operation | Required arguments | Safety |
| --- | --- | --- |
| `query_magicbase_tables` | optional `app_id` when multiple micro-apps are bound | Read-only discovery |
| `query_magicbase_tables_all_mentioned_apps` | none (requires 2+ bound micro-apps) | Read-only batch discovery |
| `get_magicbase_table` | `table_id`, optional `app_id` | Read-only metadata |
| `query_magicbase_rows` | `table_id`, structured query, optional `app_id` | Read-only |
| `get_magicbase_row` | `table_id`, `record_id`, optional `app_id` | Read-only |
| `create_magicbase_row` | `table_id`, `data`, `confirmed_by_user=true`, optional `app_id` | Requires confirmation |
| `update_magicbase_row` | `table_id`, `record_id`, `data`, `confirmed_by_user=true`, optional `app_id` | Requires confirmation |
| `delete_magicbase_row` | `table_id`, `record_id`, `confirm_delete=true`, optional `app_id` | Requires confirmation |
| `batch_create_magicbase_rows` | `table_id`, `rows`, `confirmed_by_user=true`, optional `app_id` | Requires confirmation |
| `batch_delete_magicbase_rows` | `table_id`, `record_ids`, `confirm_delete=true`, optional `app_id` | Requires confirmation |

Always use the real `table_id` returned by `query_magicbase_tables`. Do not pass `project_id`, identity, authorization, or role fields as model arguments. When exactly one micro-app is bound, `app_id` is optional and the Engine selects its project automatically; passing that same `app_id` is also valid. When multiple micro-apps are bound, pass the canonical `app_id` from the typed link on every MagicBase call. Permission failures from MagicBase are final.

## Examples

### Discover a table and query rows

Run database tools through `run_sdk_snippet`, using the Engine tool names. The `python_code` value contains:

```python
from sdk.tool import tool

tables = tool.call("query_magicbase_tables", {})
if not tables.ok:
    print(tables.content)
else:
    print(tables.content)
    table_id = tables.data["tables"][0]["table_id"]
    rows = tool.call("query_magicbase_rows", {
        "table_id": table_id,
        "filter": {"status": {"eq": "open"}},
        "sort": [{"field": "created_at", "order": "desc"}],
        "page": 1,
        "page_size": 20,
        "select": ["id", "status", "created_at"],
    })
    print(rows.content)
```

Read `result.content` for status and `result.data` only for exact IDs needed by a later call. Always use a real `table_id` returned by the table query.

### Confirm and update one row

Read the row first, then call `ask_user` with a precise preview. Confirmation and writing are separate calls:

```python
from sdk.tool import tool

preview = tool.call("get_magicbase_row", {
    "table_id": "<real_table_id>",
    "record_id": "<real_record_id>",
    "select": ["id", "status"],
})
print(preview.content)
```

Ask the user using a `confirm` question that names the application, table, record, changed fields, and affected row count:

```xml
<question type="confirm" sub_id="confirm_update">Update micro-app “&lt;app_name&gt;”, table “&lt;table_name&gt;”, record “&lt;record_id&gt;”: set status from “open” to “done”. Affects 1 row. Continue?</question>
```

Only after an explicit affirmative answer, call the write tool with the same values:

```python
updated = tool.call("update_magicbase_row", {
    "table_id": "<real_table_id>",
    "record_id": "<real_record_id>",
    "data": {"status": "done"},
    "confirmed_by_user": True,
})
print(updated.content)
```

If the answer is cancelled, skipped, timed out, or does not affirm the preview, do not call the write tool. The current engine uses `confirmed_by_user` as the write-call flag; it is not an independently verifiable token.

### Batch create and delete

Preview the complete scope before asking for confirmation and keep it unchanged in the confirmed call:

```python
rows_to_create = [
    {"name": "<name>", "status": "open"},
    {"name": "<name>", "status": "open"},
]
result = tool.call("batch_create_magicbase_rows", {
    "table_id": "<real_table_id>",
    "rows": rows_to_create,
    "select": ["id", "name", "status"],
    "confirmed_by_user": True,
})
print(result.content)
```

For deletion, resolve every real record ID with a read first and use `confirm_delete: true` only after the user confirms the full list. Do not retry a timed-out write unless the service reports that no write occurred.

### Multiple mentioned applications

When multiple distinct micro-app Mentions are present, pass the target `app_id` from the Mention on each MagicBase call. Query each app separately for comparison tasks. For initial table discovery across all referenced apps, use `query_magicbase_tables_all_mentioned_apps` once, then pass `app_id` on follow-up reads and writes. Do not pass `project_id`, identity, or authorization fields; the Engine resolves `app_id` to the permitted project. If the business target is still unclear, call `ask_user` before writing.

```python
from sdk.tool import tool

overview = tool.call("query_magicbase_tables_all_mentioned_apps", {})
print(overview.content)
for app in overview.data.get("apps", []):
    print(app["app_id"], len(app.get("tables") or []))
    rows = tool.call("query_magicbase_rows", {
        "app_id": app["app_id"],
        "table_id": app["tables"][0]["table_id"],
        "page": 1,
        "page_size": 20,
    })
    print(rows.content)
```
