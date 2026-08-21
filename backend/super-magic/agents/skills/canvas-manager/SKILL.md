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
- Never use file, directory, or shell tools to inspect, modify, or infer Canvas state. The only exception is writing the resumable task plan as Markdown under `.magic/video-production-plans/` for detailed professional video production (see `references/professional-video-production.md`); never read or edit any project file, including `magic.project.js`.
- Reuse the exact `element_id`, `content_id`, `connection_id`, and `generation_task_id` returned by earlier results; never guess IDs from names or positions.
- Element and Content deletion are not available to you — tell the user to remove them on the Canvas.
- Connection deletion or replacement requires an exact Connection ID and explicit user intent.
- A generated Content may be retried at most 2 times; never loop retries automatically.
- Re-query after any write when the next step depends on persisted state.
- You may read every Element type. You may create or edit only `frame`, `storyboard`, `video-edit`, `image`, `video`, and `audio`.
- `text`, `rectangle`, `ellipse`, `triangle`, `star`, and `group` are read-only. Never create them, change their Content or main selection, lay them out, retry them, or include them in `frame_canvas_elements`.

## Capabilities

You can:

- Initialize, restore, and query Canvas projects.
- Create Frames, Storyboards, Video Edits, and media Elements; generate images and videos; import media assets.
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

- **Element** — a node on the Canvas. All types are readable, but only Frame, Storyboard, Video Edit, Image, Video, and Audio Elements are writable by this Agent.
- **Content** — one version of what an Element shows. An Element may hold several Content candidates; one is marked main.
- **Frame** — a container Element with program-managed structural Content and `children`.
- **Connection** — a business dependency from one Element to another. Professional video-production relations are defined in `references/professional-video-production.md`.

Within the writable type set, you may add Elements, append Content, retry failed Content, select main Content, create Frames, change layout, and change Connections. Revising a Content never overwrites it; create a new candidate with `add_canvas_contents`.

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
Billed video generation?                    → estimate_canvas_content_points  (see the matching video reference)
Change layout / wire dependencies?           → layout_canvas_elements, add_canvas_connections  (see professional-video-production.md)
Final MP4 from a video-edit?                 → compose_canvas_final_video  (see professional-video-production.md)
Search and import web images?                → search_canvas_image_candidates  (see image-search.md)
Design marker ([@design_marker:...])?        → visual_understanding + add_canvas_elements  (see Design marker processing)
User wants prompt inspiration / no ideas?    → search_canvas_image_prompts  (see prompt-library.md)
```

## Tool reference

## `initialize_canvas`

Initialize a new project or recover from `PROJECT_NOT_FOUND`. Idempotent; accepts only a full workspace-relative path.

Parameters: `project_path` is the full workspace-relative Canvas project path.

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

Parameters: `project_path` required; `page` and `limit` optional.

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

Parameters: `project_path` and 1–10 exact `element_ids` required. The `asset_path`, status, task ID, and Connection ID in the details must only be used as real inputs to later tools.

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

Create new writable logical Elements: `storyboard`, `video-edit`, `image`, `video`, or `audio`. Frames are created with `frame_canvas_elements`. Use `add_canvas_contents` for a candidate on an existing writable Element.

Parameters: `project_path` and `items` required; each item needs at least `item_ref` and `element_type`.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref` and `element_type` required; `name`, `layout`, `content`, `connections` optional |

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [
        {"item_ref": "hero-image", "element_type": "image", "name": "Hero visual",
         "layout": {"strategy": "row_incremental"},
         "content": {"source": "generated", "content_type": "image", "name": "premium product hero", "prompt": "premium product hero, clean background, no text", "size": "2048x2048"}},
    ],
})
print(result.content)
```

Read each item's real `element_id`, `content_id`, status, and task ID. If a task ID is returned, call `wait_canvas_generation`. Basic Canvas images and videos use the default `row_incremental` layout and do not wire professional-production Connections. Professional video production is the exception: follow `references/professional-video-production.md` and create only its explicit direct business relations.

## `frame_canvas_elements`

Group exact sibling Elements into a new Frame.

Parameters: `project_path` and `items` required. Selected siblings must all be writable Element types. Never include `text`, `rectangle`, `ellipse`, `triangle`, `star`, or `group`. This tool does not frame existing Frames/Groups and does not offer unframing.

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

Append a new Content candidate to an existing writable Element without overwriting previous candidates. Read-only Element types must only be queried.

Parameters: `project_path` and `items` required; each item uses an exact `element_id` and new Content.

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

Parameters: `project_path` and `items` required; only failed Content can be retried, at most 2 times. Never loop retries automatically.

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

Set a confirmed candidate as the main Content of a writable Element.

Parameters: `project_path` and `items` required; use only the exact `element_id` and `content_id` the user confirmed.

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

Parameters: `project_path` and `tasks` required; `max_wait_seconds` optional. On timeout or `processing`, reuse the original `generation_task_id`; do not resubmit.

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

Adjust the layout of an existing writable Element or Frame. Never lay out read-only Element types. Layout only changes position and size; it does not generate new Content or infer Connections automatically.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `items` | Yes | Each item: exact `element_id`, layout strategy, and optional explicit coordinates |

Supports `row_incremental`, `dependency_flow`, and `explicit_position`. Use `explicit_position` only when the user explicitly provides coordinates; Frame child coordinates are always local to the direct parent Frame.

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

Create, remove, or replace a business Connection. A Connection represents an explicit business dependency; do not infer it from visual distance, the same Frame, or array order.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `items` | Yes | New endpoints or exact remove/replace requests |

For removal use `remove_connection_ids`; for replacement provide the new endpoint, `replace_existing_connections=true`, and the queried old Connection ID. Any removal or replacement requires explicit user intent.

A Connection declares only a direct business predecessor. Reference paths are generation inputs; they do not imply Connections. Wire upstream as follows:

- Initialization image: connect from every imported or confirmed Element materially combined into the result.
- Storyboard: connect from the confirmed initialization anchors only, not the original imported assets behind them.
- First frame: connect from the storyboard Element.
- Shot video: connect from exactly its corresponding first-frame Element only — never add initialization, product, scene, or storyboard Elements to a shot video's Connections.
- Video edit: include direct incoming Connections from every `videoSequence` and `audioSequence` Element in the same `add_canvas_elements` call. Use `add_canvas_connections` only for later standalone relationship maintenance.
- Final video: composition validates the confirmed Video Edit inputs before producing the result.

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

Perform a side-effect-free point estimate for billed video generation. The estimate phase must not create Elements, Content, or generation tasks; any parameter change that affects billing requires a re-estimate.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `production_rule` | No | Currently `video_generation` |
| `items` | Yes | Request parameters identical to the real video generation, plus a unique `item_ref` |

```python
from sdk.tool import tool

result = tool.call("estimate_canvas_content_points", {
    "project_path": "Canvas/Product Launch",
    "production_rule": "video_generation",
    "items": [{"item_ref": "shot-s01", "prompt": "confirmed product motion", "duration_seconds": 4}],
})
print(result.content)
```

After showing the full parameters, points, and `estimate_id`, you must confirm with a direct `ask_user`; do not call video generation before confirmation.

## `compose_canvas_final_video`

Synchronously compose the final MP4 from the main Content of a confirmed `video-edit` Element. It is not an async generation task, so do not call `wait_canvas_generation`.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `video_edit_element_id` | Yes | Exact Video Edit Element ID |
| `result_name` | Yes | Final video name |
| `result_element_id` | No | Provide when reusing an existing result Element is explicitly requested |

```python
from sdk.tool import tool

result = tool.call("compose_canvas_final_video", {
    "project_path": "Canvas/Product Launch",
    "video_edit_element_id": "element-740000000000000020",
    "result_name": "Product launch final cut",
})
print(result.content)
```

After composition, query details with the returned real Element ID, then report the MP4 path, duration, dimensions, and audio status to the user.

## `search_canvas_image_candidates`

Search, download, media-validate, and import external image candidates. Only materialize candidates that pass download and media probing; de-duplicate by source URL within the same topic.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `topic_id` | Yes | Current search topic ID |
| `tasks` | Yes | Each item: `item_ref`, `name`, `query`, and optional filters |

```python
from sdk.tool import tool

result = tool.call("search_canvas_image_candidates", {
    "project_path": "Canvas/Product Launch",
    "topic_id": "hero-images",
    "tasks": [{"item_ref": "hero", "name": "Hero image", "query": "premium product hero", "count": 3}],
})
print(result.content)
```

After import, verify the real Element IDs with `query_canvas_overview` or `query_canvas_element_details`. Retry failed items only when the user asks.

## `search_canvas_image_prompts`

Search for prompt inspiration when the user has no clear creative direction. This tool only returns inspiration; it does not create or modify Canvas state.

| Parameter | Required | Description |
|---|---|---|
| `query` | Yes | Scene, subject, or style keywords |
| `category` | No | Prompt category |
| `sort_by` | No | Sort order |
| `limit` | No | Maximum number of results |
| `offset` | No | Pagination offset |
| `random` | No | Whether to sample randomly |

```python
from sdk.tool import tool

result = tool.call("search_canvas_image_prompts", {
    "query": "minimal product hero",
    "limit": 5,
})
print(result.content)
```

## Workflow coverage

- Image design workflow: direct generation, referenced images, appended candidates, and main Content selection after confirmation.
- Ordinary video workflow: full creative target, point estimate, `ask_user` confirmation, async generation, and waiting.
- Detailed video production workflow: Storyboard, first frames, shot videos, direct business Connections, `video-edit`, and the final MP4.
- `video-edit` Content stores ordered inputs via `videoSequence` and optional `audioSequence`; create matching incoming Connections in the same `add_canvas_elements` call.
- Frame workflow: group only exact root-level writable sibling Elements; never include read-only Element types, do not re-frame existing Frames/Groups, and no unframing or deletion is offered.
- Layout strategies: `row_incremental`, `dependency_flow`, `explicit_position`.
- Version management: Content candidate appending, retry cap on failures, and main Content selection after user confirmation.

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
4. **Generate** — `add_canvas_elements` with a single image Element whose Content uses `source=generated`, `content_type=image`, `reference_images=[original project-relative path]`, and `size` set to the original image's dimensions.

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
            "reference_images": ["./images/dog.jpg"],
            "size": "1920x1080",
        },
    }],
})
print(result.content)
```

Key points: always pass the original image path in `reference_images`; always set `size` to the original dimensions; describe the full scene, not just the change, and explicitly state what is preserved; the new image is a separate Element — the original Element and file remain unchanged.

## Mandatory context loading

**Image generation:** When the user asks to generate an image — especially multiple views or angles of the same subject (fashion multi-view sheets, character design sheets, product 360° views) — your first tool call must directly read `references/image-generation.md` using the file-reading capability. Use the exact reference path; do not call any Canvas tool first. Do not answer or draft a prompt until that reference has been read. This is a context-loading requirement only; all image-generation rules, parameters, and the multi-view anchor-then-expand workflow are defined in that reference.

**Video generation:** Distinguish basic Canvas video generation from professional video production. For a basic request such as “generate a video” or “generate a promotional video” without professional-production intent, first read `references/video-generation.md`. For an explicit professional video-production request, or a request naming a storyboard, multiple shots, first frames, staged approvals, Connections, BGM replacement, or final composition, first read `references/professional-video-production.md`. Descriptions such as “professional-looking”, “premium”, or “cinematic” express output quality and do not by themselves request the professional production workflow. Use the exact reference path; do not call any Canvas tool first. Do not answer or draft a prompt until the matching reference has been read.

## Reference routing

Load references only when the matching task appears:

- `references/image-generation.md` — image generation, revision, reference images, or image retry.
- `references/video-generation.md` — basic Canvas video generation, equivalent to direct Canvas image generation, without professional-production Connections or staged workflow.
- `references/professional-video-production.md` — professional video production, including direct professional video with Connections and detailed staged production with storyboards, first frames, shot dependencies, layout strategies, and final `compose_canvas_final_video`.
- `references/image-search.md` — the user asks to search and import web images (`search_canvas_image_candidates`).
- `references/prompt-library.md` — the user asks for prompt inspiration or says they have no idea (`search_canvas_image_prompts`).
- `references/asset-reconciliation.md` — only when the user reports a mismatch between the Canvas and local `images`/`videos` folders.

No reference may widen the deletion, retry, or direct file-operation boundaries.
