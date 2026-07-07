---
name: magicbase
description: "Use when an HTML micro-app needs MagicBase persistence, window.Magic.db row operations, current-user context through window.Magic.getContext, creators, owners, assignees, permissions, CRUD, forms, surveys, todos, dashboards, filters, statistics, exports, or any saved user data."
---

# MagicBase for HTML Micro-apps

Use this skill when an HTML micro-app needs persistent data, current-user identity, ownership, permissions, or runtime row-level database operations.

MagicBase has two layers:

- Schema work is done by agent tools before HTML generation: `query_magicbase_tables`, `get_magicbase_table`, `create_magicbase_table`, and `create_magicbase_column`.
- Runtime row operations are done inside HTML with `window.Magic.db`, using real table IDs returned by MagicBase tools.

Do not expose schema creation inside HTML pages. HTML code should only read and write rows on tables that already exist.

Project memory uses `HTML-APP.md` for the latest human-readable data model. Do not edit it directly with file-editing tools. MagicBase schema tools maintain `.magicbase/migrations.json`; after successful table or column changes, they refresh the latest MagicBase data model in `HTML-APP.md`. If tools report a `Pending` migration at the start of a later task, query MagicBase first so confirmable records can be repaired before more schema work.

MagicBase exposes a simplified MySQL-like column model. Use only these `data_type` values when creating tables or columns: `text`, `number`, `datetime`, `boolean`, `json`.

Model UI choices with MySQL-like columns:

- Single-choice UI values use `text`.
- Multiple-choice UI values use `json` and write an array, such as `["office", "gaming"]`.
- User IDs, department IDs, attachment IDs/URLs, and foreign-key values use `text` unless the app truly needs a JSON array/object.
- Do not use low-code field types such as `single_select`, `multi_select`, `user`, `department`, `attachment`, or `reference`; MagicBase no longer exposes them as column types.
- Relations are separate metadata. Create ordinary key columns such as `customer_id: text`, then create a MagicBase relation between source and target columns when joined reads are needed.

## Current User Context (`window.Magic.getContext`)

Use `window.Magic.getContext()` whenever a micro-app needs current-user display, creators, owners, assignees, collaborators, "my data versus all data", or edit/delete permission checks.

`getContext()` is hosted by the parent application. It uses the current login state to query magic-service user information and returns a normalized current-user profile. HTML business code should not call `/api/v1/contact/users/queries` directly for the current user, should not hard-code tokens, and should not read `.credentials` files.

```javascript
const context = await window.Magic.getContext();
// context: {
//   userId: "usi_xxx",
//   userName: "Alice",
//   user: { user_id, real_name, nickname, avatar_url, phone, email, ... },
//   organizationCode: "org_xxx",
//   language: "zh-CN"
// }
```

For data apps with ownership or collaboration:

- Call `window.Magic.getContext()` during initialization before user-dependent reads or writes.
- Store stable identity fields in MagicBase, such as `creator_user_id`, `creator_name`, `owner_user_id`, `owner_name`, and `updated_by_user_id`, choosing only fields the app actually needs.
- When creating a row, write `creator_user_id: context.userId` and `creator_name: context.userName` or the scenario's equivalent owner fields.
- When rendering edit/delete/archive/transfer buttons, compare `context.userId` with the row's stable identity field. Display names are not permission keys.
- If `getContext()` fails, disable user-dependent create, edit, delete, ownership, and transfer operations and show an understandable error. Never write fake identities such as `unknown`, `guest`, `visitor`, `访客`, or `未命名用户` into MagicBase.

Recommended pattern:

```javascript
let context = null;

async function initRuntime() {
  context = await window.Magic.getContext();
  if (!context?.userId || !context?.userName) {
    throw new Error("Current user information is unavailable");
  }
}

async function createTask(data) {
  if (!context) {
    throw new Error("Current user information is not initialized");
  }

  return window.Magic.db.createRow(TASK_TABLE_ID, {
    ...data,
    creator_user_id: context.userId,
    creator_name: context.userName,
  });
}

function canEdit(row) {
  return Boolean(context?.userId && row.creator_user_id === context.userId);
}
```

---

## MagicBase Dynamic Permissions

MagicBase `dynamic_permissions` are the backend security boundary. Frontend filters, hidden buttons, and `canEdit()` checks are only product experience safeguards. They must not be treated as the only permission control when the user asks for private or owner-only data.

When the user says that each person can only see their own data, only edit their own data, "my data", personal private data, creator-only access, owner-only access, or similar requirements, `create_magicbase_table` must include row-level `private_user` dynamic permissions:

Pass `dynamic_permissions` as a nested object in the tool arguments, not as a JSON string. Do not stringify it or wrap the object in quotes. If the tool rejects `dynamic_permissions` with "expected object", retry with the same permission intent as an object; do not remove the permission field or fall back to a public table.

```json
{
  "dynamic_permissions": {
    "table": {
      "read_scope": "public",
      "insert_scope": "public"
    },
    "row": {
      "read_scope": "private_user",
      "edit_scope": "private_user",
      "delete_scope": "private_user"
    },
    "columns": {}
  }
}
```

Still store stable business identity fields such as `creator_user_id`, `creator_name`, `owner_user_id`, and `owner_name` when the app needs display, filtering, or UI permission checks. HTML should still query with filters such as `creator_user_id: context.userId` for better user experience, but that filter is not the security boundary. The backend boundary is MagicBase `dynamic_permissions`.

Scope selection:

- `public`: public collaborative data that every permitted project user may access.
- `private_user`: only the row creator may read, edit, or delete. Use this for personal todos, personal records, my applications, my drafts, and owner-only data.
- `private_department`: users may access rows created by people in overlapping departments. Use only when the user explicitly asks for department-level isolation.
- `private_org`: users in the same organization may access the data. Use for organization-shared data.
- `disabled`: dynamic permissions do not grant access; use only when the app intentionally relies on static permissions or administrators.

Correct `create_magicbase_table` pattern for personal todos:

```json
{
  "table_key": "tasks",
  "table_name": "Tasks",
  "description": "Personal todo tasks",
  "columns": [
    {
      "column_key": "title",
      "column_name": "Title",
      "data_type": "text",
      "is_required": true
    },
    {
      "column_key": "status",
      "column_name": "Status",
      "data_type": "text",
      "is_required": true,
      "default_value": "pending"
    },
    {
      "column_key": "creator_user_id",
      "column_name": "Creator User ID",
      "data_type": "text",
      "is_required": true
    },
    {
      "column_key": "creator_name",
      "column_name": "Creator Name",
      "data_type": "text",
      "is_required": true
    }
  ],
  "dynamic_permissions": {
    "table": {
      "read_scope": "public",
      "insert_scope": "public"
    },
    "row": {
      "read_scope": "private_user",
      "edit_scope": "private_user",
      "delete_scope": "private_user"
    },
    "columns": {}
  }
}
```

If `query_magicbase_tables` or `get_magicbase_table` finds an existing table whose row permissions are `public`, do not claim that backend private permissions are already enforced. If there is no tool available to update table dynamic permissions, explain that the current implementation can only add frontend filtering and UI checks for the existing table, and recommend adding a MagicBase permission-update tool before claiming full backend enforcement.

---

## MagicBase Runtime Database API (`window.Magic.db`)

The HTML runtime database API only supports row-level operations on existing MagicBase tables. It does not create tables, create columns, or manage schema.

For data-oriented micro-apps, treat MagicBase persistence as the default. Surveys, forms, todos, CRUD apps, small admin panels, dashboards, trackers, and any app with user-submitted, editable, collected, analytical, searchable, exportable, or reusable data should prepare a MagicBase table before generating HTML. Skip persistence only for pure showcase/static pages, pure calculators, apps with no user data, or when the user explicitly says not to save data.

The data model must serve the full approved product loop, not the smallest possible CRUD shell. Derive fields from the planned object, attributes, lifecycle state, category/grouping needs, notes/details, ordering, archive/deletion behavior, statistics, and filters. UI-only state should stay in JavaScript; anything needed for persistence, search, filtering, sorting, or later reuse belongs in MagicBase.

System fields are not dynamic business columns. MagicBase automatically maintains fields such as `id`, `record_id`, `created_at`, `updated_at`, `created_by`, `project_id`, `table_id`, and `organization_code`. HTML code may read, display, select, filter, or sort by supported system fields, but must not put system fields into the `data` object passed to `createRow` or `updateRow`. Only dynamic business fields that appear in the table's `columns` list as `column_key` may be written in `data`.

1. Call `query_magicbase_tables` to check whether the required table already exists.
2. If the table is missing, call `create_magicbase_table`; the tool automatically records migration history in `.magicbase/migrations.json` and refreshes the latest MagicBase data model in `HTML-APP.md`.
3. If columns are missing, call `create_magicbase_column`; the tool automatically records migration history in `.magicbase/migrations.json` and refreshes the latest MagicBase data model in `HTML-APP.md`.
4. Generate HTML only after you have a real `table.id` from MagicBase tools or from a successful reconciliation against MagicBase.

Never pass `table_key` or `table_name` as `tableId` to `window.Magic.db`. The HTML code must use the real table id returned by MagicBase tools.

Database API calls are automatically associated with the current project inside the iframe, so HTML code does not pass `projectId`.

### List tables `getTables()`

```javascript
const tables = await window.Magic.db.getTables();
// tables: [{ id: "1234567890", name: "users", ... }, ...]
```

- Return: `Promise<Array<{ id: string; name: string; ... }>>` — table summaries

### Get table details `getTable(tableId)`

```javascript
const table = await window.Magic.db.getTable(TABLE_ID_FROM_MAGICBASE_TOOL);
// table: { id: "1234567890", name: "users", fields: [...], ... }
```

- Parameters: `tableId: string` — 表 ID
- Return: `Promise<object>` — table details, including field definitions

### Create a row `createRow(tableId, data, select?)`

```javascript
const newRow = await window.Magic.db.createRow(TABLE_ID_FROM_MAGICBASE_TOOL, {
  name: "Alice",
  age: 30,
  email: "alice@example.com",
}, ["id", "name", "email", "created_at", "updated_at"]);
// newRow: { id: "rec_yyy", name: "Alice", age: 30, ... }
```

- Parameters: `tableId: string`、`data: Record<string, unknown>`、`select?: string[]`（可选，指定返回字段）
- Return: `Promise<object>` — the created row
- The `data` object must contain only dynamic column keys from the actual table schema. Do not write `created_at`, `updated_at`, `id`, `record_id`, `created_by`, `project_id`, `table_id`, or `organization_code` into `data`; request them through `select` if you need them in the response.
- Match values to the MySQL-like column type. For `json` columns, pass arrays/objects directly; do not stringify or join arrays before calling `createRow`.

### Query rows `queryRows(tableId, query)`

```javascript
const result = await window.Magic.db.queryRows(TABLE_ID_FROM_MAGICBASE_TOOL, {
  filter: { name: { $contains: "Ali" } },
  sort: [{ field: "created_at", direction: "desc" }],
  select: ["name", "email"],
  page: 1,
  page_size: 20,
});
// result: { list: [...], total: 42, page: 1, page_size: 20 }
const rows = result.list;
```

- Parameters: `tableId: string`、`query: object`
  - `filter?` — 过滤条件
  - `sort?` — 排序规则
  - `select?: string[]` — 返回字段列表
  - `page?: number` — 页码（默认 1）
  - `page_size?: number` — 每页行数（默认 20）
  - `with?` — 关联查询配置
- Return: `Promise<{ list: Array<object>; total: number; page: number; page_size: number }>` — 分页结果。行数组字段是 `list`，不要使用 `rows`
- **超时**：30 秒（其他操作为 15 秒）

Use this defensive read pattern when handling existing or uncertain runtime responses:

```javascript
const result = await window.Magic.db.queryRows(TABLE_ID_FROM_MAGICBASE_TOOL, {
  page: 1,
  page_size: 100,
});
const rows = Array.isArray(result?.list)
  ? result.list
  : Array.isArray(result?.data?.list)
    ? result.data.list
    : [];
```

Prefer `result.list` in new code. The `result.data?.list` fallback is only a compatibility guard for uncertain host responses. Do not use `result.rows`.

### 获取单行 `getRow(tableId, recordId, select?)`

```javascript
const row = await window.Magic.db.getRow(TABLE_ID_FROM_MAGICBASE_TOOL, "rec_yyy");
```

- Parameters: `tableId: string`、`recordId: string`、`select?: string[]`
- Return: `Promise<object>` — 行数据

### Update a row `updateRow(tableId, recordId, data, select?)`

```javascript
const updated = await window.Magic.db.updateRow(TABLE_ID_FROM_MAGICBASE_TOOL, "rec_yyy", {
  name: "Bob",
  age: 25,
}, ["id", "name", "age", "updated_at"]);
```

- Parameters: `tableId: string`、`recordId: string`、`data: Record<string, unknown>`、`select?: string[]`
- Return: `Promise<object>` — the updated row
- The `data` object must contain only dynamic column keys from the actual table schema. Do not write system fields such as `updated_at`; MagicBase updates them automatically and they can be returned through `select`.
- Match values to the MySQL-like column type. For `json` columns, pass arrays/objects directly; do not stringify or join arrays before calling `updateRow`.

### Delete a row `deleteRow(tableId, recordId)`

```javascript
await window.Magic.db.deleteRow(TABLE_ID_FROM_MAGICBASE_TOOL, "rec_yyy");
```

- Parameters: `tableId: string`、`recordId: string`
- Return: `Promise<void>`

### 获取relation list `getRelations()`

```javascript
const relations = await window.Magic.db.getRelations();
```

- Return: `Promise<Array<object>>` — 当前项目的表relation list

### Database error handling

```javascript
try {
  const row = await window.Magic.db.getRow(TABLE_ID_FROM_MAGICBASE_TOOL, "rec_notfound");
} catch (err) {
  console.error("Database operation failed:", err.message);
  // 可能的错误：
  // - "No project selected" — 未选中项目
  // - "getRow: tableId must be a non-empty string" — 参数校验失败
  // - HTTP 错误信息（404, 500 等）
}
```

---
