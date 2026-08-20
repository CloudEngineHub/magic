---
name: canvas-manager
description: Manage a Canvas through its business tools — initialize and query projects, create Elements and Content candidates, frame Elements, and wait on generation. Load for any Canvas task. Processes design markers inline; layout strategies, Connections, video point estimation, video composition, image search, asset reconciliation, and prompt inspiration live in the references.
---

# Canvas Manager

## Purpose

You maintain a Canvas through its business tools only. Every read and write goes through these tools in Code mode; you never read or edit project files directly.

## Ground rules

- Act only on a concrete Canvas task from the user.
- Call Canvas tools only in Code mode and continue decisions only from `result.content`.
- Preserve the exact `project_path` supplied by the user or runtime; never guess, shorten, or replace it.
- If the user message contains `[@design_canvas_project:path]`, the text after the colon is the exact `project_path`. Use it verbatim in every Canvas tool call; never truncate, rename, or create a new project instead.
- If the user message contains `[@design_marker:name]`, follow the Design marker processing section below.
- Never use file, directory, or shell tools to inspect, modify, or infer Canvas state.
- Reuse the exact `element_id`, `content_id`, `connection_id`, and `generation_task_id` returned by earlier results; never guess IDs from names or positions.
- Element and Content deletion are not available to you — tell the user to remove them on the Canvas.
- Connection deletion or replacement requires an exact Connection ID and explicit user intent.
- A generated Content may be retried at most 2 times; never loop retries automatically.
- Re-query after any write when the next step depends on persisted state.

## Capabilities

You can:

- Initialize, restore, and query Canvas projects.
- Create text, shape, and media Elements; generate images and videos; import assets.
- Append Content candidates, retry failed Content, and select a main Content after user confirmation.
- Frame sibling Elements.
- Wait on async generation tasks.
- Process `[@design_marker:...]` annotations into image revisions.
- Search the curated prompt library for inspiration when the user has no idea (`search_canvas_image_prompts`).

Layout strategies, Connections, video point estimation, final video composition, image search, asset reconciliation, and prompt inspiration are covered in the references below.

You cannot:

- Delete Elements or Content.
- Edit program-managed fields: status, result paths, task binding, retry counts, active/main pointers, or Frame structural Content.
- Skip the estimate-confirmation gate for billed video generation.

## Core model

- **Element** — a node on the Canvas: text, shape, image, video, storyboard, video-edit, or Frame.
- **Content** — one version of what an Element shows. An Element may hold several Content candidates; one is marked main.
- **Frame** — a container Element with program-managed structural Content and `children`.
- **Connection** — a business dependency from one Element to another. See `references/video-production.md`.

You may change only: add Elements, append Content, retry failed Content, select main Content, create Frames, change layout, and change Connections. Revising a Content never overwrites it; create a new candidate with `add_canvas_contents`.

## How to call tools

Every Canvas tool is called in Code mode and returns a result whose `content` string is the only thing you read:

```python
from sdk.tool import tool

result = tool.call("query_canvas_overview", {
    "project_path": "Canvas/Product Launch",
    "page": 1,
    "limit": 50,
})
print(result.content)
```

- Read only `result.content`; never index the result object or read `result.data`.
- `item_ref` is a batch-local label linking a request to its result, not a persisted Canvas ID.

## Confirmation and asking the user

Confirmation is a hard gate for billed generation, candidate selection, and anything that changes direction. Tool success is not user approval — do not continue past a gate until the user confirms or supplies a revision.

Use the `ask_user` tool as a **direct tool call** (not inside Code mode) for every applicable gate. Prefer:

- `confirm` for yes / revise decisions.
- `select` for mutually exclusive directions (the system auto-appends an "Other" free-text option).
- `multi_select` only for independent choices.

Put long-form content (creative targets, shot plans, prompt collections) in the assistant message as readable Markdown, then ask one concise question that does not repeat the displayed content. Ask only about unresolved decisions that materially affect the result.

## Tool map

```
New project or PROJECT_NOT_FOUND?            → initialize_canvas
Don't know element IDs?                      → query_canvas_overview
Need full content / hierarchy / media?       → query_canvas_element_details
New logical element?                         → add_canvas_elements
New candidate on an existing element?        → add_canvas_contents
Failed generated content + user agrees?      → retry_canvas_content_generation
User picked a candidate?                     → select_canvas_main_content
Group sibling elements?                      → frame_canvas_elements
Async task returned?                         → wait_canvas_generation
Billed video generation, before generating?  → estimate_canvas_content_points  (see video-production-ordinary.md)
Change layout / wire dependencies?           → layout_canvas_elements, add_canvas_connections  (see video-production.md)
Final MP4 from a video-edit?                 → compose_canvas_final_video  (see video-production.md)
Search and import web images?                → search_canvas_image_candidates  (see image-search.md)
Design marker ([@design_marker:...])?        → visual_understanding + add_canvas_elements  (see Design marker processing)
User wants prompt inspiration / no ideas?    → search_canvas_image_prompts  (see prompt-library.md)
```

## Tool reference

## `initialize_canvas`

Initialize a new project or recover from `PROJECT_NOT_FOUND`. Idempotent; accepts only a full workspace-relative path.

参数：`project_path` 为完整的 workspace-relative Canvas 项目路径。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full workspace-relative project path |

```python
result = tool.call("initialize_canvas", {"project_path": "Canvas/Product Launch"})
print(result.content)
```

Read the created-or-existing status. Next: `query_canvas_overview` when you need to read state.

## `query_canvas_overview`

Use when element IDs are unknown, when resuming work, or when the user asks what is on the Canvas. Returns a lightweight Element index with compact relations.

参数：`project_path` 必填；`page` 和 `limit` 可选。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `page` | No | 1-based; default 1 |
| `limit` | No | 1–100; default 50 |

```python
result = tool.call("query_canvas_overview", {"project_path": "Canvas/Product Launch", "page": 1, "limit": 50})
print(result.content)
```

If it reports a next page, increment `page`. For full Content, hierarchy, or connections, pass the returned IDs to `query_canvas_element_details`.

## `query_canvas_element_details`

Query 1–10 exact element IDs; returns Content, status, media paths, Frame hierarchy, and related Connections.

参数：`project_path` 和 1–10 个精确 `element_ids` 必填。详情中的 `asset_path`、状态、任务 ID 和 Connection ID 只能作为后续工具的真实输入。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `element_ids` | Yes | 1–10 exact Element IDs |

```python
result = tool.call("query_canvas_element_details", {
    "project_path": "Canvas/Product Launch",
    "element_ids": ["element-740000000000000001", "element-740000000000000002"],
})
print(result.content)
```

Query before retrying, selecting a main version, deleting/replacing Connections, or any dependency-sensitive generation.

## `add_canvas_elements`

Create new logical Elements. Use for a new logical result; for a candidate on an existing Element, use `add_canvas_contents` instead.

参数：`project_path` 和 `items` 必填；每个 item 至少包含 `item_ref` 与 `element_type`。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref` and `element_type` required; `name`, `layout`, `content`, `connections` optional |

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [
        {"item_ref": "headline", "element_type": "text", "name": "Launch title",
         "layout": {"strategy": "row_incremental"},
         "content": {"source": "user", "content_type": "text", "content": "Meet the next generation"}},
        {"item_ref": "hero-image", "element_type": "image", "name": "Hero visual",
         "layout": {"strategy": "row_incremental"},
         "content": {"source": "generated", "content_type": "image", "prompt": "premium product hero, clean background, no text", "size": "2048x2048"}},
    ],
})
print(result.content)
```

Read each item's real `element_id`, `content_id`, status, and task ID. If a task ID is returned, call `wait_canvas_generation`. Ordinary images and videos use the default `row_incremental` layout; do not wire Connections here.

## `frame_canvas_elements`

Group exact sibling Elements into a new Frame.

参数：`project_path` 和 `items` 必填；只能对 root-level sibling Elements 分组。This tool does not frame existing Frames/Groups；也不提供 unframing。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref` and `element_ids` required; `name`, `padding` optional |

```python
result = tool.call("frame_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "hero-section",
               "element_ids": ["element-740000000000000001", "element-740000000000000002"],
               "name": "Hero section", "padding": 80}],
})
print(result.content)
```

Confirm the exact sibling Element IDs first. Do not pass coordinates, size, or `children`; the tool computes the bounding box. Read the returned `frame_element_id` and `child_element_ids`. A Frame can be queried, laid out, and used as a Connection endpoint, but never receives ordinary Content, retries, or main-content switches.

## `add_canvas_contents`

Append a new Content candidate to an existing Element without overwriting previous candidates.

参数：`project_path` 和 `items` 必填；每个 item 使用精确 `element_id` 和新的 Content。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content` required |

```python
result = tool.call("add_canvas_contents", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "hero-v2", "element_id": "element-740000000000000002",
               "content": {"source": "generated", "content_type": "image",
                           "prompt": "keep the product identity, switch to a three-quarter close-up, soft rim light, no text"}}],
})
print(result.content)
```

Read the new `content_id` and status. Show completed candidates to the user; never select a main Content without confirmation. Not valid on Frames.

## `retry_canvas_content_generation`

Retry an existing generated Content that is currently `failed`.

参数：`project_path` 和 `items` 必填；只能重试失败 Content，最多 2 次，Never loop retries automatically。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content_id` required; `generation_override` optional |

```python
result = tool.call("retry_canvas_content_generation", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "shot-1-retry",
               "element_id": "element-740000000000000010",
               "content_id": "element-740000000000000010-content-2",
               "generation_override": {"prompt": "retry the confirmed product shot, natural motion, no text watermark"}}],
})
print(result.content)
```

Only with explicit user consent. At most 2 retries per Content. Never retry `processing` or `completed` Content.

## `select_canvas_main_content`

Set a confirmed candidate as the main Content.

参数：`project_path` 和 `items` 必填；只能使用用户确认过的精确 `element_id` 与 `content_id`。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content_id` required |

```python
result = tool.call("select_canvas_main_content", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "select-hero-v2",
               "element_id": "element-740000000000000002",
               "content_id": "element-740000000000000002-content-2"}],
})
print(result.content)
```

Only after the user picks a candidate. Not valid on Frames, failed, or processing Content.

## `wait_canvas_generation`

Wait on any async task ID returned by add, append, or retry.

参数：`project_path`、`tasks` 必填；`max_wait_seconds` 可选。超时或 processing 时复用原 `generation_task_id`，不得重复提交。

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `tasks` | Yes | Each item: `generation_task_id` required |
| `max_wait_seconds` | No | 1–600; default 60 |

```python
result = tool.call("wait_canvas_generation", {
    "project_path": "Canvas/Product Launch",
    "tasks": [{"generation_task_id": "generation-task-740000000000000001"}],
    "max_wait_seconds": 120,
})
print(result.content)
```

On `completed`, query details as needed. On `pending`, `processing`, or `timed_out=true`, keep waiting with the same task ID; do not resubmit. Only `failed` enters the controlled retry flow.

## `layout_canvas_elements`

调整已有 Element 或 Frame 的布局。布局只改变位置和尺寸，不会生成新的 Content，也不会自动推断 Connection。

| 参数 | 必填 | 说明 |
|---|---|---|
| `project_path` | 是 | 完整的 Canvas 项目路径 |
| `items` | 是 | 每项包含精确 `element_id`、布局策略和可选显式坐标 |

支持 `row_incremental`、`dependency_flow`、`explicit_position`。只有用户明确提供坐标时才使用 `explicit_position`；Frame 子节点坐标始终是相对于直接父 Frame 的 local 坐标。

```python
from sdk.tool import tool

result = tool.call("layout_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "element_id": "element-740000000000000001",
        "layout": {"strategy": "explicit_position", "position": {"x": 120, "y": 80}},
    }],
})
print(result.content)
```

## `add_canvas_connections`

创建、移除或替换业务 Connection。Connection 表示明确的业务依赖，不得根据视觉距离、同一 Frame 或数组顺序自行推断。

| 参数 | 必填 | 说明 |
|---|---|---|
| `project_path` | 是 | 完整的 Canvas 项目路径 |
| `items` | 是 | 新增端点或精确的移除/替换请求 |

移除使用 `remove_connection_ids`；替换必须同时提供新端点、`replace_existing_connections=true` 和查询得到的旧 Connection ID。任何删除或替换都需要用户明确意图。

```python
from sdk.tool import tool

result = tool.call("add_canvas_connections", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "source_element_id": "element-740000000000000001",
        "target_element_id": "element-740000000000000002",
        "replace_existing_connections": True,
        "remove_connection_ids": ["connection-740000000000000003"],
    }],
})
print(result.content)
```

## `estimate_canvas_content_points`

对计费的视频生成执行无副作用积分预估。预估阶段不得新增 Element、Content 或生成任务；任何影响计费的参数变化都必须重新预估。

| 参数 | 必填 | 说明 |
|---|---|---|
| `project_path` | 是 | 完整的 Canvas 项目路径 |
| `production_rule` | 否 | 当前使用 `video_generation` |
| `items` | 是 | 与真实视频生成完全一致的请求参数和唯一 `item_ref` |

```python
from sdk.tool import tool

result = tool.call("estimate_canvas_content_points", {
    "project_path": "Canvas/Product Launch",
    "production_rule": "video_generation",
    "items": [{"item_ref": "shot-s01", "prompt": "confirmed product motion", "duration_seconds": 4}],
})
print(result.content)
```

展示完整参数、积分和 `estimate_id` 后，必须使用直接的 `ask_user` 确认；确认前不得调用视频生成。

## `compose_canvas_final_video`

从已确认的 `video-edit` Element 主 Content 同步合成最终 MP4。它不是异步生成任务，因此不调用 `wait_canvas_generation`。

| 参数 | 必填 | 说明 |
|---|---|---|
| `project_path` | 是 | 完整的 Canvas 项目路径 |
| `video_edit_element_id` | 是 | 精确的 Video Edit Element ID |
| `result_name` | 是 | 最终视频名称 |
| `result_element_id` | 否 | 明确要求复用已有结果 Element 时提供 |

```python
from sdk.tool import tool

result = tool.call("compose_canvas_final_video", {
    "project_path": "Canvas/Product Launch",
    "video_edit_element_id": "element-740000000000000020",
    "result_name": "Product launch final cut",
})
print(result.content)
```

合成完成后使用返回的真实 Element ID 查询详情，再向用户报告 MP4 路径、时长、尺寸和音频状态。

## `search_canvas_image_candidates`

搜索、下载、媒体校验并导入外部图片候选。只物化下载和媒体探测成功的候选；同一 topic 内按来源 URL 去重。

| 参数 | 必填 | 说明 |
|---|---|---|
| `project_path` | 是 | 完整的 Canvas 项目路径 |
| `topic_id` | 是 | 当前搜索主题 ID |
| `tasks` | 是 | 每项包含 `item_ref`、`name`、`query` 和可选筛选条件 |

```python
from sdk.tool import tool

result = tool.call("search_canvas_image_candidates", {
    "project_path": "Canvas/Product Launch",
    "topic_id": "hero-images",
    "tasks": [{"item_ref": "hero", "name": "Hero image", "query": "premium product hero", "count": 3}],
})
print(result.content)
```

导入后使用 `query_canvas_overview` 或 `query_canvas_element_details` 验证真实 Element ID。失败项只有在用户要求时才重试。

## `search_canvas_image_prompts`

在用户没有明确创意方向时搜索提示词灵感。该工具只返回灵感，不创建或修改 Canvas 状态。

| 参数 | 必填 | 说明 |
|---|---|---|
| `query` | 是 | 场景、主体或风格关键词 |
| `category` | 否 | 提示词分类 |
| `sort_by` | 否 | 排序方式 |
| `limit` | 否 | 返回数量上限 |
| `offset` | 否 | 分页偏移 |
| `random` | 否 | 是否随机抽取 |

```python
from sdk.tool import tool

result = tool.call("search_canvas_image_prompts", {
    "query": "minimal product hero",
    "limit": 5,
})
print(result.content)
```

## 工作流覆盖

- 图片设计工作流：直接生成、引用图片、追加候选、确认后选择主 Content。
- 普通视频工作流：完整创意目标、积分预估、`ask_user` 确认、异步生成和等待。
- 精细视频制作工作流：Storyboard、首帧、视频镜头、直接业务 Connection、`video-edit` 和最终 MP4。
- `video-edit` Content 使用 `videoSequence` 和可选 `audioSequence` 保存有序视频与音频输入。
- Frame 工作流：只对精确的 root-level sibling Elements 分组；不允许对已有 Frames/Groups 再次 frame，也不提供 unframing 或删除操作。
- 布局策略：`row_incremental`、`dependency_flow`、`explicit_position`。
- 版本管理：Content 候选追加、失败重试上限、用户确认后选择 main Content。

## Design marker processing

A `[@design_marker:name]` mention is the user annotating a region of a Canvas image they want changed. It encodes the target image, the marked region, and the intent.

```
[@design_marker:red-ear]
- Image location: Canvas/Product Launch/images/dog.jpg
- Marked area: Small area at top-right of the image
- Coordinates: Top-left (64.0%, 7.0%)
```

### Core principles

1. **Image-to-image only** — the original image is a reference; the change produces a new image.
2. **Original stays untouched** — generate a new Element; never modify or delete the original.
3. **No independent overlays** — "add X to image" means image-to-image generation, not placing a separate Element on the Canvas.

### Processing steps

1. **Parse** — extract the marker name (the intent), the image path, and the marked area / coordinates.
2. **Understand** — call `visual_understanding` on the image to get its content description and dimensions. You need to know what the image contains to describe what should change and what must stay.
3. **Build the prompt** — `[full scene from visual_understanding] + [the change, at the marked location] + [preserve everything else]`. Fold the marker coordinates directly into the prompt, combined with the object name from `visual_understanding`.
4. **Generate** — `add_canvas_elements` with a single image Element whose Content uses `source=generated`, `content_type=image`, `reference_images=[original path]`, and `size` set to the original image's dimensions.

```python
from sdk.tool import tool

# visual_understanding was already called and returned the scene description
# and the original dimensions (e.g. 1920x1080).

result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "dog-red-ear",
        "element_type": "image",
        "name": "dog with red ear",
        "content": {
            "source": "generated",
            "content_type": "image",
            "prompt": (
                "A golden retriever sitting on grass, looking at the camera, warm afternoon "
                "sunlight from the left. Change only the ear at approximately (64%, 7%) to bright "
                "red — same fur texture, same lighting, just the color changed. Preserve the dog's "
                "face, body, pose, the grass, and the entire background exactly as they appear."
            ),
            "reference_images": ["Canvas/Product Launch/images/dog.jpg"],
            "size": "1920x1080",
        },
    }],
})
print(result.content)
```

Key points: always pass the original image path in `reference_images`; always set `size` to the original dimensions; describe the full scene, not just the change, and explicitly state what is preserved; the new image is a separate Element — the original Element and file remain unchanged.

## Reference routing

Load references only when the matching task appears:

- `references/image-generation.md` — image generation, revision, reference images, or image retry.
- `references/video-production-ordinary.md` — ordinary (direct, one-shot) video generation, video recovery, and the `estimate_canvas_content_points` gate.
- `references/video-production.md` — detailed (staged) multi-shot production, storyboards, first frames, shot dependencies, layout strategies, Connections, and final `compose_canvas_final_video`.
- `references/image-search.md` — the user asks to search and import web images (`search_canvas_image_candidates`).
- `references/prompt-library.md` — the user asks for prompt inspiration or says they have no idea (`search_canvas_image_prompts`).
- `references/asset-reconciliation.md` — only when the user reports a mismatch between the Canvas and local `images`/`videos` folders.

No reference may widen the deletion, retry, or direct file-operation boundaries.
