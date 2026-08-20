---
name: canvas-manager
description: Manage a Canvas through its business tools — initialize and query projects, create Elements and Content candidates, frame Elements, and wait on generation. Load for any Canvas task. Layout strategies, Connections, video point estimation, video composition, image search, and asset reconciliation live in the references.
---

# Canvas Manager

## Purpose

You maintain a Canvas through its business tools only. Every read and write goes through these tools in Code mode; you never read or edit project files directly.

## Ground rules

- Act only on a concrete Canvas task from the user.
- Call Canvas tools only in Code mode and continue decisions only from `result.content`.
- Preserve the exact `project_path` supplied by the user or runtime; never guess, shorten, or replace it.
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

Layout strategies, Connections, video point estimation, final video composition, image search, and asset reconciliation are covered in the references below.

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
Final MP4 from a video-edit?                 → compose_canvas_video  (see video-production.md)
Search and import web images?                → search_canvas_images  (see image-search.md)
```

## Tool reference

### initialize_canvas

Initialize a new project or recover from `PROJECT_NOT_FOUND`. Idempotent; accepts only a full workspace-relative path.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full workspace-relative project path |

```python
tool.call("initialize_canvas", {"project_path": "Canvas/Product Launch"})
```

Read the created-or-existing status. Next: `query_canvas_overview` when you need to read state.

### query_canvas_overview

Use when element IDs are unknown, when resuming work, or when the user asks what is on the Canvas. Returns a lightweight Element index with compact relations.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `page` | No | 1-based; default 1 |
| `limit` | No | 1–100; default 50 |

```python
tool.call("query_canvas_overview", {"project_path": "Canvas/Product Launch", "page": 1, "limit": 50})
```

If it reports a next page, increment `page`. For full Content, hierarchy, or connections, pass the returned IDs to `query_canvas_element_details`.

### query_canvas_element_details

Query 1–10 exact element IDs; returns Content, status, media paths, Frame hierarchy, and related Connections.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `element_ids` | Yes | 1–10 exact Element IDs |

```python
tool.call("query_canvas_element_details", {
    "project_path": "Canvas/Product Launch",
    "element_ids": ["element-740000000000000001", "element-740000000000000002"],
})
```

Query before retrying, selecting a main version, deleting/replacing Connections, or any dependency-sensitive generation.

### add_canvas_elements

Create new logical Elements. Use for a new logical result; for a candidate on an existing Element, use `add_canvas_contents` instead.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref` and `element_type` required; `name`, `layout`, `content`, `connections` optional |

```python
tool.call("add_canvas_elements", {
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
```

Read each item's real `element_id`, `content_id`, status, and task ID. If a task ID is returned, call `wait_canvas_generation`. Ordinary images and videos use the default `row_incremental` layout; do not wire Connections here.

### frame_canvas_elements

Group exact sibling Elements into a new Frame.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref` and `element_ids` required; `name`, `padding` optional |

```python
tool.call("frame_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "hero-section",
               "element_ids": ["element-740000000000000001", "element-740000000000000002"],
               "name": "Hero section", "padding": 80}],
})
```

Confirm the exact sibling Element IDs first. Do not pass coordinates, size, or `children`; the tool computes the bounding box. Read the returned `frame_element_id` and `child_element_ids`. A Frame can be queried, laid out, and used as a Connection endpoint, but never receives ordinary Content, retries, or main-content switches.

### add_canvas_contents

Append a new Content candidate to an existing Element without overwriting previous candidates.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content` required |

```python
tool.call("add_canvas_contents", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "hero-v2", "element_id": "element-740000000000000002",
               "content": {"source": "generated", "content_type": "image",
                           "prompt": "keep the product identity, switch to a three-quarter close-up, soft rim light, no text"}}],
})
```

Read the new `content_id` and status. Show completed candidates to the user; never select a main Content without confirmation. Not valid on Frames.

### retry_canvas_content_generation

Retry an existing generated Content that is currently `failed`.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content_id` required; `generation_override` optional |

```python
tool.call("retry_canvas_content_generation", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "shot-1-retry",
               "element_id": "element-740000000000000010",
               "content_id": "element-740000000000000010-content-2",
               "generation_override": {"prompt": "retry the confirmed product shot, natural motion, no text watermark"}}],
})
```

Only with explicit user consent. At most 2 retries per Content. Never retry `processing` or `completed` Content.

### select_canvas_main_content

Set a confirmed candidate as the main Content.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content_id` required |

```python
tool.call("select_canvas_main_content", {
    "project_path": "Canvas/Product Launch",
    "items": [{"item_ref": "select-hero-v2",
               "element_id": "element-740000000000000002",
               "content_id": "element-740000000000000002-content-2"}],
})
```

Only after the user picks a candidate. Not valid on Frames, failed, or processing Content.

### wait_canvas_generation

Wait on any async task ID returned by add, append, or retry.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `tasks` | Yes | Each item: `generation_task_id` required |
| `max_wait_seconds` | No | 1–600; default 60 |

```python
tool.call("wait_canvas_generation", {
    "project_path": "Canvas/Product Launch",
    "tasks": [{"generation_task_id": "generation-task-740000000000000001"}],
    "max_wait_seconds": 120,
})
```

On `completed`, query details as needed. On `pending`, `processing`, or `timed_out=true`, keep waiting with the same task ID; do not resubmit. Only `failed` enters the controlled retry flow.

## Reference routing

Load references only when the matching task appears:

- `references/image-generation.md` — image generation, revision, reference images, or image retry.
- `references/video-production-ordinary.md` — ordinary (direct, one-shot) video generation, video recovery, and the `estimate_canvas_content_points` gate.
- `references/video-production.md` — detailed (staged) multi-shot production, storyboards, first frames, shot dependencies, layout strategies, Connections, and final `compose_canvas_video`.
- `references/image-search.md` — the user asks to search and import web images (`search_canvas_images`).
- `references/asset-reconciliation.md` — only when the user reports a mismatch between the Canvas and local `images`/`videos` folders.

No reference may widen the deletion, retry, or direct file-operation boundaries.
