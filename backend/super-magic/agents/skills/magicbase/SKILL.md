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

## MagicBase Runtime Database API (`window.Magic.db`)

The HTML runtime database API only supports row-level operations on existing MagicBase tables. It does not create tables, create columns, or manage schema.

For data-oriented micro-apps, treat MagicBase persistence as the default. Surveys, forms, todos, CRUD apps, small admin panels, dashboards, trackers, and any app with user-submitted, editable, collected, analytical, searchable, exportable, or reusable data should prepare a MagicBase table before generating HTML. Skip persistence only for pure showcase/static pages, pure calculators, apps with no user data, or when the user explicitly says not to save data.

The data model must serve the full approved product loop, not the smallest possible CRUD shell. Derive fields from the planned object, attributes, lifecycle state, timestamps, category/grouping needs, notes/details, ordering, archive/deletion behavior, statistics, and filters. UI-only state should stay in JavaScript; anything needed for persistence, search, filtering, sorting, or later reuse belongs in MagicBase.

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
});
// newRow: { id: "rec_yyy", name: "Alice", age: 30, ... }
```

- Parameters: `tableId: string`、`data: Record<string, unknown>`、`select?: string[]`（可选，指定返回字段）
- Return: `Promise<object>` — the created row

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
});
```

- Parameters: `tableId: string`、`recordId: string`、`data: Record<string, unknown>`、`select?: string[]`
- Return: `Promise<object>` — the updated row

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
