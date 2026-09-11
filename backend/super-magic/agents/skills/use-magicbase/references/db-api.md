# MagicBase runtime operations

Use the existing runtime database methods. The engine supplies the project and authenticated user context; the
model supplies only business arguments.

| Operation | Required arguments | Safety |
| --- | --- | --- |
| `query_magicbase_tables` | none | Read-only discovery |
| `get_magicbase_table` | `table_id` | Read-only metadata |
| `query_magicbase_rows` | `table_id`, structured query | Read-only |
| `get_magicbase_row` | `table_id`, `record_id` | Read-only |
| `create_magicbase_row` | `table_id`, `data`, `confirmed_by_user=true` | Requires confirmation |
| `update_magicbase_row` | `table_id`, `record_id`, `data`, `confirmed_by_user=true` | Requires confirmation |
| `delete_magicbase_row` | `table_id`, `record_id`, `confirm_delete=true` | Requires confirmation |
| `batch_create_magicbase_rows` | `table_id`, `rows`, `confirmed_by_user=true` | Requires confirmation |
| `batch_delete_magicbase_rows` | `table_id`, `record_ids`, `confirm_delete=true` | Requires confirmation |

Always use the real `table_id` returned by `query_magicbase_tables`. Do not pass `project_id`, identity, authorization, or role
fields as model arguments. Permission failures from MagicBase are final.

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

When multiple distinct micro-app Mentions are present and the target is unclear, call `ask_user` to ask which application to use. Do not pass `app_id`, `project_id`, identity, or authorization fields to MagicBase tools; the Engine binds the selected structured Mention to the current authenticated request.
