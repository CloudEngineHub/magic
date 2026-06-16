# 回收站恢复冲突处理 — 前端接口变更说明

> 后端版本：2026-05-21
> 涉及模块：`/api/v1/recycle-bin/check` 和 `/api/v1/recycle-bin/restore`

---

## 一、`POST /api/v1/recycle-bin/check` — 响应格式 Breaking Change

**背景：** 原接口只检测 Project/Topic 的父级是否存在。升级后统一检测所有资源类型的冲突：
- Project/Topic：检测父级是否存在（`parent_missing`）
- File（新增）：检测父级是否存在（`parent_missing`）+ 目标位置是否有同名文件（`name_conflict`）

### 旧响应格式

```json
{
  "items_need_move": [
    {
      "id": "1",
      "resource_type": 2,
      "resource_id": "100",
      "resource_name": "我的项目",
      "parent_id": "50"
    }
  ],
  "items_no_need_move": [...]
}
```

### 新响应格式

```json
{
  "items_with_conflict": [
    {
      "resource_id": "100",
      "resource_name": "我的项目",
      "is_directory": true,
      "conflict": {
        "type": "parent_missing",
        "original_parent_id": "50"
      }
    },
    {
      "resource_id": "200",
      "resource_name": "report.md",
      "is_directory": false,
      "conflict": {
        "type": "name_conflict",
        "existing_file_id": "999",
        "existing_is_directory": false
      }
    }
  ],
  "items_no_conflict": [
    {
      "resource_id": "300",
      "resource_name": "另一个文件",
      "is_directory": false
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `items_with_conflict` | array | 有冲突，需用户决策后才能恢复 |
| `items_no_conflict` | array | 无冲突，可直接恢复 |
| `resource_id` | string | 资源 ID |
| `resource_name` | string | 资源名称 |
| `is_directory` | bool | 是否为目录 |
| `conflict.type` | string | 冲突类型：`parent_missing` 或 `name_conflict` |
| `conflict.original_parent_id` | string\|null | 仅 `parent_missing`：原父目录 ID（已不存在） |
| `conflict.existing_file_id` | string\|null | 仅 `name_conflict`：目标位置已存在的同名文件 ID |
| `conflict.existing_is_directory` | bool\|null | 仅 `name_conflict`：已存在的同名项是否为目录 |

> **注意：** 每个 item 最多只有一个 `conflict`（`parent_missing` 和 `name_conflict` 互斥）。无冲突的 item 没有 `conflict` 字段。

---

## 二、`POST /api/v1/recycle-bin/restore` — 新增可选参数

恢复接口新增 `conflict_resolutions` 字段，用于告知后端如何处理冲突资源。

### 请求格式

```json
{
  "resource_ids": ["100", "200", "300"],
  "resource_type": 4,
  "conflict_resolutions": {
    "100": {
      "parent_missing": "restore_to_root"
    },
    "200": {
      "name_conflict": "overwrite"
    }
  }
}
```

### `conflict_resolutions` 结构

```
{
  [resource_id]: {
    [conflict_type]: resolution_strategy
  }
}
```

### `parent_missing` 可选策略

| 策略值 | 含义 |
|---|---|
| `restore_to_root` | 恢复到项目根目录 |
| `skip` | 跳过，不恢复该资源 |

### `name_conflict` 可选策略

| 策略值 | 含义 |
|---|---|
| `overwrite` | 删除目标位置的同名文件/目录（仅删除本体，不递归删除子文件），然后恢复 |
| `skip` | 跳过，不恢复该资源 |

> **重要：** 如果 `/check` 返回某资源有冲突，但 `/restore` 请求中没有提供对应的 `conflict_resolutions`，该资源**恢复失败**（不会静默跳过或自动处理）。

---

## 三、前端改动点梳理

| 改动位置 | 具体内容 |
|---|---|
| `/check` 响应解析 | `items_need_move` → `items_with_conflict`；`items_no_need_move` → `items_no_conflict` |
| `/check` 响应解析 | `id` / `resource_type` / `parent_id` 字段消失，改为 `conflict.type` + `conflict.original_parent_id` |
| Project/Topic 恢复流程 | 检测到 `parent_missing` 后，仍走原有 `/move-project` / `/move-topic` 端点，其余流程不变 |
| File 恢复流程（新增） | 检测到冲突后，让用户选择策略，在 `/restore` 请求中带上 `conflict_resolutions` |
| File `parent_missing` UI（新增） | 展示"原父目录已不存在，是否恢复到根目录？"确认弹窗 |
| File `name_conflict` UI（新增） | 展示"目标位置已存在同名文件，是否覆盖？"确认弹窗 |

---

## 四、典型交互流程（File 类型）

```
1. 用户选中若干文件点击"恢复"
        ↓
2. 前端调用 POST /check（resource_type=File）
        ↓
3. 后端返回 items_with_conflict + items_no_conflict
        ↓
4. items_no_conflict → 直接加入恢复列表，不需要用户干预
   items_with_conflict → 逐项提示用户：
     - parent_missing: "原父目录已被删除，是否恢复到项目根目录？"
       用户选择：[恢复到根目录] → restore_to_root  |  [跳过] → skip
     - name_conflict:  "目标位置已有同名文件，是否覆盖原文件？"
       用户选择：[覆盖] → overwrite  |  [跳过] → skip
        ↓
5. 前端构造 conflict_resolutions，调用 POST /restore
   {
     "resource_ids": ["all_ids"],
     "resource_type": 4,
     "conflict_resolutions": {
       "[id_with_parent_missing]": { "parent_missing": "restore_to_root" },
       "[id_with_name_conflict]":  { "name_conflict": "overwrite" }
     }
   }
        ↓
6. 后端按策略执行恢复，返回成功/失败列表
```
