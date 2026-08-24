---
name: canvas-manager
description: "Manage a Canvas through its business tools only — initialize and query projects, create Elements and Content candidates, frame Elements, wait on generation, and process design markers. Use when the user asks to create, edit, or generate anything on a Canvas, such as images, videos, storyboards, video edits, or a final composed video, or when the message contains [@design_canvas_project:...] or [@design_marker:...]. Also use when the user says 'generate an image on my canvas', 'make a video from this canvas project', 'add a new element to my design', or 'edit the marked region of this image'. Layout strategies, Connections, video point estimation, video composition, image search, asset reconciliation, and prompt inspiration live in the references."
---

# Canvas Manager

## Purpose

You maintain a Canvas through its business tools only. Every read and write goes through these tools in Code mode; you never read or edit project files directly.

## Ground rules

- Act only on a concrete Canvas task from the user.
- Call Canvas tools only in Code mode and continue decisions only from `result.content`.
- Preserve the exact `project_path` supplied by the user or runtime; never guess, shorten, or replace it.
- Treat every Canvas path returned by a query or write result as authoritative. A path such as `./images/foo.webp` is relative to the current project's `magic.project.js` (project-relative), not automatically relative to the workspace. Reuse it verbatim for Canvas generation fields. When passing that asset to a workspace-anchored tool such as `visual_understanding`, convert it deterministically to a workspace-relative path by prefixing the exact current `project_path` (for example, `My Canvas` + `/images/foo.webp` becomes `My Canvas/images/foo.webp`); do not guess a directory, filename, or Element ID. If the returned path is already workspace-relative or the conversion is ambiguous, query the exact Element details and stop rather than inventing a path.
- Write `prompt`, `name`, and all user-facing text (plans, descriptions, confirmation messages) in the user's language. Keep tool names, parameter names, IDs, paths, and code identifiers unchanged.
- Examples use a one-level, space-free path such as `Demo`. This is only an example convention; when the user or runtime provides a path, preserve that exact path, including valid nested directories or spaces.
- Never use file, directory, or shell tools to inspect, modify, or infer Canvas state; never read or edit any project file, including `magic.project.js`.
- Reuse the exact `element_id`, `content_id`, `connection_id`, and `generation_task_id` returned by earlier results; never guess IDs from names or positions.
- Element and Content deletion are not available to you — tell the user to remove them on the Canvas.
- Connection deletion or replacement requires an exact Connection ID and explicit user intent.
- A generated Content may be retried at most 2 times; never loop retries automatically.
- Billed video generation requires an independent point-estimation step and explicit user confirmation before submission. The estimate ID is not a generation-tool credential.
- Re-query after any write when the next step depends on persisted state.
- Provider-managed asset URIs such as `asset://...` are generation references, not workspace files. Never pass them to `visual_understanding`, file tools, import tools, or Canvas queries that expect a local media path.
- You may read every Element type. You may create or edit only `frame`, `storyboard`, `video-edit`, `image`, `video`, and `audio`.
- `text`, `rectangle`, `ellipse`, `triangle`, `star`, and `group` are read-only. Never create them, change their Content or main selection, lay them out, retry them, or include them in `frame_canvas_elements`.

## Mandatory request preflight

Before every write-tool call, validate the request against the minimum structures below. Do not depend on server errors to discover omitted fields, and do not substitute similarly named fields for protocol fields.

- `add_canvas_elements`: every item must have a unique `item_ref` and a valid `element_type`. When `content` is present, it must explicitly provide `source` and `content_type`. Generated image/video Content must have a `name` that describes the actual result. Imported Content must have `asset_path` and the correct `content_type`. Every entry in `connections` must contain `source_element_id`; keep a stable `item_ref` for every item so batch results remain traceable.
- `add_canvas_contents`: every item must contain `item_ref`, the exact `element_id`, and `content`. Content must explicitly provide `source` and `content_type`; generated image/video Content must have `name`. Never substitute `element_id`, `content_id`, and `item_ref` for one another.
- `manage_canvas_connections`: every item must have a unique `item_ref`. Creation or replacement requires exact `source_element_id` and `target_element_id`; removal or replacement also requires the exact queried Connection ID and explicit user intent.
- Generation tasks: when a write result returns `generation_task_id`, wait immediately. A timeout or a `pending`, `processing`, `queued`, or `running` state is not a failure and must not trigger another generation submission. Only an explicit `status=failed` enters controlled retry, using the original `item_ref`, `element_id`, and `content_id`.
- Paths: Canvas-returned `./images/...`, `./videos/...`, and `./audios/...` paths are for fields scoped to the current Canvas project. Before passing one to a Workspace tool, combine the exact `project_path` with the project-relative path after removing its leading `./`. Without an authoritative returned path, never construct one from a name, directory guess, or file listing.

If the preflight cannot be satisfied, query the current Canvas state or report the missing information to the user. Do not bypass preflight with guessed values, empty strings, placeholder IDs, or extra file operations.

## Capabilities

You can:

- Initialize, restore, and query Canvas projects.
- Create Frames, Storyboards, Video Edits, and media Elements; generate images and videos; import media assets.
- Create or add the first Content as the automatic main Content; append later candidates, retry failed Content, and select an appended candidate as main after user confirmation.
- Frame sibling Elements.
- Wait on async generation tasks.
- Process `[@design_marker:...]` annotations into image revisions.
- Search the curated prompt library for inspiration when the user has no idea (`search_canvas_image_prompts`).

Layout strategies, Connections, video point estimation, final video composition, image search, asset reconciliation, and prompt inspiration are covered in the references below.

## Real-asset repair boundary

When the user asks to restore real assets from `.tmp` or another Workspace location, use only source paths that actually exist and were supplied by the user or system. Never create, download, generate, copy, or rename substitute files. Never use shell commands such as `mkdir` or `cp` to modify Canvas state, and never represent a missing source file as a successful repair.

If the original asset is missing, inaccessible, or cannot be mapped reliably to a Workspace path, report that no real asset is available for repair and stop the import. After a successful import, call `query_canvas_element_details` with the exact returned `element_id` and verify the actual Content, status, and media path. Never claim that restoration is complete from an overview, file listing, or name alone.

## Execution and test-reporting boundary

When reporting a Canvas workflow, distinguish `passed`, `initial call failed but recovered`, `partially passed`, `external resource failed`, `skipped at the user's request`, `not tested`, and `invalid test`. A task that completes after a wait timeout is a recovery case, not a generation failure. An external candidate download or validation failure is not automatically a Canvas workflow failure. Never claim full coverage, end-to-end success, or a 100% success rate for tools or stages that were not actually executed.

You cannot:

- Delete Elements or Content.
- Edit program-managed fields: status, result paths, task binding, retry counts, active/main pointers, or Frame structural Content.
- Skip point estimation (see the point-estimation rule in Ground rules).

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
    "project_path": "Demo",
    "page": 1,
    "limit": 50,
})
print(result.content)
```

- The `from sdk.tool import tool` import is required in every snippet; it is shown once above and omitted in all later examples for brevity.
- Read only `result.content`; never index the result object or read `result.data`.
- `item_ref` is a batch-local label linking a request to its result, not a persisted Canvas ID.

## Confirmation and asking the user

Confirmation is a hard gate for billed generation, candidate selection, and anything that changes direction. The first Content of an Element, whether created with the Element or added to an otherwise empty Element, is automatically its main Content; do not ask whether to make that first Content main and do not call `select_canvas_main_content` for it. Tool success is not user approval — do not continue past an applicable gate until the user confirms or supplies a revision. In staged video work, confirm the first completed first frame before generating the remaining first frames, confirm the first completed trial shot video before generating the remaining shots, and confirm the final Video Edit configuration including `audioPolicy` before composing.

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
User picked an appended candidate?           → select_canvas_main_content
Group sibling elements?                      → frame_canvas_elements
Async task returned?                         → wait_canvas_generation
Billed video generation?                    → estimate_canvas_content_points first, then ask for confirmation before generation
Change layout / wire dependencies?           → layout_canvas_elements, manage_canvas_connections  (see professional-video-production.md)
Final MP4 from a video-edit?                 → add_canvas_elements with task="compose" (see professional-video-production.md)
Search and import web images?                → search_canvas_image_candidates  (see image-search.md)
Design marker ([@design_marker:...])?        → visual_understanding + add_canvas_elements  (see Design marker processing)
User wants prompt inspiration / no ideas?    → search_canvas_image_prompts  (see prompt-library.md)
```

## Tool reference

Each tool below is documented with when to use it, its parameters, and a minimal example. Read every result only from `result.content` and reuse returned IDs verbatim.

## `initialize_canvas`

Initialize a new project or recover from `PROJECT_NOT_FOUND`. Idempotent; accepts only a full workspace-relative path.

Parameters: `project_path` is the full workspace-relative Canvas project path.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full workspace-relative project path |

```python
result = tool.call("initialize_canvas", {"project_path": "Demo"})
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
result = tool.call("query_canvas_overview", {"project_path": "Demo", "page": 1, "limit": 50})
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
    "project_path": "Demo",
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
    "project_path": "Demo",
    "items": [
        {"item_ref": "hero-image", "element_type": "image", "name": "Hero visual",
         "layout": {"strategy": "row_incremental"},
         "content": {"source": "generated", "content_type": "image", "name": "premium product hero", "prompt": "premium product hero, clean background, no text", "size": "2048x2048"}},
    ],
})
print(result.content)
```

Read each item's real `element_id`, `content_id`, status, and task ID. If a task ID is returned, call `wait_canvas_generation`. Basic Canvas images and videos use the default `row_incremental` layout and do not wire professional-production Connections. Professional video production is the exception: follow `references/professional-video-production.md` and create only its explicit direct business relations. Before submitting a new item with `layout.strategy="dependency_flow"`, query every existing connection source and inspect its direct parent; a new item is root-level unless the tool explicitly says otherwise, so do not use `dependency_flow` when that would cross a container boundary.

Before calling this tool, validate every nested item against the preflight checklist above. In particular, do not omit `content.name` for generated image/video Content, and do not omit `content.content_type` for imported media. A missing `name` or `content_type` is a request-construction error, not a generation failure.

For imported media, set `content.source="imported"` and pass the original workspace path as `content.asset_path`. This input is materialized into the project's canonical media directory and becomes the Content's project-local `src`; do not use `path`, `media_path`, `file_path`, or `src` as the import input field.

Do not create a manual `imports/` staging directory and do not copy a `.tmp` file into `imports/` with shell commands. Pass the original workspace path in `content.asset_path`; Canvas materializes images into `./images/`, videos into `./videos/`, and audio into `./audios/`, then returns the canonical project-local path. Use only that returned path in later calls.

## `frame_canvas_elements`

Group exact sibling Elements into a new Frame.

Parameters: `project_path` and `items` required. Selected siblings must all be writable Element types. Never include `text`, `rectangle`, `ellipse`, `triangle`, `star`, or `group`. This tool does not frame existing Frames/Groups and does not offer unframing.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref` and `element_ids` required; `name`, `padding` optional |

```python
result = tool.call("frame_canvas_elements", {
    "project_path": "Demo",
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
    "project_path": "Demo",
    "items": [{"item_ref": "hero-v2", "element_id": "element-740000000000000002",
               "content": {"source": "generated", "content_type": "image",
                           "name": "three-quarter product close-up",
                           "prompt": "keep the product identity, switch to a three-quarter close-up, soft rim light, no text"}}],
})
print(result.content)
```

Read the new `content_id` and status. When this appends a later candidate to an existing Element, keep the current main Content unchanged, show the completed candidate, and select it as main only after explicit user confirmation. If the Element was otherwise empty, this first Content is already main and does not require a selection call. Not valid on Frames.

Before calling this tool, preserve the exact current `element_id` and use a new stable `item_ref` for the append operation. Generated image/video Content must include its own `name`, even when the parent Element already has a name.

## `retry_canvas_content_generation`

Retry an existing generated Content that is currently `failed`.

Retry rules:

- Reuse the exact `item_ref` from the original generation request or the latest failed Content result. `item_ref` is a stable correlation label for the operation; it is not a retry attempt name. Never add suffixes such as `-retry`, `-new`, or a counter.
- Reuse the exact `element_id` and `content_id` from the latest Canvas query or the failed Content result.
- The failed-content retry tool only retries existing Content and does not receive or validate point-estimation credentials. If the user changes billable parameters, the workflow may independently call `estimate_canvas_content_points`, obtain confirmation, and then call the retry tool; the estimate result is not a retry-tool submission parameter.
- A failed final video composition is retried in place: reuse the exact final video `element_id` and `content_id`. Do not call `add_canvas_elements` to create `final-video-v2` or another duplicate Element.

Parameters: `project_path` and `items` required; only failed Content can be retried, at most 2 times. Never loop retries automatically.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content_id` required; `generation_override` optional |

```python
result = tool.call("retry_canvas_content_generation", {
    "project_path": "Demo",
    "items": [{"item_ref": "shot-1",
               "element_id": "element-740000000000000010",
               "content_id": "element-740000000000000010-content-2"}],
})
print(result.content)
```

Only with explicit user consent. At most 2 retries per Content. Never retry `processing` or `completed` Content.

## `select_canvas_main_content`

Set a confirmed later candidate as the main Content of a writable Element.

Parameters: `project_path` and `items` required; use only the exact `element_id` and `content_id` the user confirmed.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `content_id` required |

```python
result = tool.call("select_canvas_main_content", {
    "project_path": "Demo",
    "items": [{"item_ref": "select-hero-v2",
               "element_id": "element-740000000000000002",
               "content_id": "element-740000000000000002-content-2"}],
})
print(result.content)
```

Use only after the user picks a later candidate on an Element that already has a main Content. The first Content of any Element is already main and must not be selected again. Not valid on Frames, failed, or processing Content.

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
    "project_path": "Demo",
    "tasks": [{"generation_task_id": "generation-task-740000000000000001"}],
    "max_wait_seconds": 120,
})
print(result.content)
```

On `completed`, query details as needed. On `pending`, `processing`, `queued`, `running`, or `timed_out=true`, keep waiting in bounded follow-up calls with the same task ID; do not resubmit `add_canvas_elements`, `add_canvas_contents`, or retry. A timeout means that this wait call ended before completion, not that generation failed. Only an explicit `status=failed` enters the controlled retry flow.

## `layout_canvas_elements`

Adjust the layout of an existing writable Element or Frame. Never lay out read-only Element types. Layout only changes position and size; it does not generate new Content or infer Connections automatically.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `items` | Yes | Each item: exact `element_id`, layout strategy, and optional explicit coordinates |

Supports `row_incremental`, `dependency_flow`, and `explicit_position`. Use `explicit_position` only when the user explicitly provides coordinates; Frame child coordinates are always local to the direct parent Frame. Before using `dependency_flow`, query the exact endpoint Elements and inspect `parent_element_id`: all connected endpoints must share the same direct parent. If endpoints are in different containers, do not force `dependency_flow`; use `row_incremental` or an explicit user-provided position, then create the business Connection separately when the relation itself is valid. Never change `project_path` or reinitialize the Canvas to bypass a layout error.

```python
result = tool.call("layout_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "element_id": "element-740000000000000001",
        "layout": {"strategy": "explicit_position", "position": {"x": 120, "y": 80}},
    }],
})
print(result.content)
```

## `manage_canvas_connections`

Create, remove, or replace a business Connection. A Connection represents an explicit business dependency; do not infer it from visual distance, the same Frame, or array order.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `items` | Yes | New endpoints or exact remove/replace requests |

For removal use `remove_connection_ids`; for replacement provide the new endpoint, `replace_existing_connections=true`, and the queried old Connection ID. Any removal or replacement requires explicit user intent. Every create/remove/replace item must include a stable `item_ref`; every create or replacement item must include exact `source_element_id` and `target_element_id`.

A Connection declares only a direct business predecessor. Reference paths are generation inputs; they do not imply Connections. Wire upstream as follows:

- Initialization image: connect from every imported or confirmed Element materially combined into the result.
- Storyboard: connect from the confirmed initialization anchors only, not the original imported assets behind them.
- First frame: connect from the storyboard Element.
- Shot video: connect from exactly its corresponding first-frame Element only — never add initialization, product, scene, or storyboard Elements to a shot video's Connections.
- Video edit: include direct incoming Connections from every `videoSequence` and `audioSequence` Element in the same `add_canvas_elements` call. Use `manage_canvas_connections` only for later standalone relationship maintenance.
- Final video: composition validates the confirmed Video Edit inputs before producing the result.

```python
result = tool.call("manage_canvas_connections", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "replace-product-source",
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

Freeze the complete generation request before estimating. This includes the final prompt, every `[imageN]`/`[videoN]`/`[audioN]` binding token, reference arrays, model, duration, aspect ratio, resolution, and all other billable fields. After the user confirms, copy those parameters byte-for-byte into `add_canvas_elements`; the estimate result and `estimate_id` are informational and are not required by the generation tool. Do not add a reference binding token, a watermark constraint, or any other prompt wording after confirmation. If any field or prompt text must change, estimate again and ask for confirmation again before submitting.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Full Canvas project path |
| `production_rule` | No | Currently `video_generation` |
| `items` | Yes | Request parameters identical to the real video generation, plus a unique `item_ref` |

```python
result = tool.call("estimate_canvas_content_points", {
    "project_path": "Demo",
    "production_rule": "video_generation",
    "items": [{"item_ref": "shot-s01", "prompt": "confirmed product motion", "duration_seconds": 4}],
})
print(result.content)
```

After showing the full parameters and estimated points, you must confirm with a direct `ask_user`; do not call video generation before confirmation. The generation tool remains independent and does not receive or validate an `estimate_id`.

## Final video composition through `add_canvas_elements`

Treat the final MP4 as an ordinary generated Video Element. The model must declare the final Element, its `video-edit -> final-video` Connection, and dependency layout in the same request. The Canvas application creates a pending generated Content and runs internal FFmpeg composition against that Content; it does not create Elements, Connections, or layout automatically.

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "final-video",
        "element_type": "video",
        "name": "Product launch final cut",
        "layout": {"strategy": "dependency_flow"},
        "connections": [{"source_element_id": "element-740000000000000020"}],
        "content": {
            "source": "generated",
            "content_type": "video",
            "name": "Product launch final cut",
            "task": "compose",
            "input_mode": "video_edit",
            "videoEditElementId": "element-740000000000000020",
        },
    }],
})
print(result.content)
```

Composition is synchronous and does not use `wait_canvas_generation`. After success, query the final Video Element with `query_canvas_element_details`. The final audio state follows the Video Edit `audioPolicy`: `preserve` keeps configured or source-video audio, while `mute` produces a silent MP4.

Video Edit output supports preset or numeric short-side resolutions, such as `1080p` or `768p`. For exact pixel dimensions, provide both `width` and `height` in the Video Edit `output`; explicit dimensions take precedence over `aspectRatio` and `resolution`.

## Workflow coverage

- Image design workflow: direct generation, referenced images, appended candidates, and main Content selection after confirmation only for appended candidates.
- Ordinary video workflow: full creative target, point estimate and `ask_user` confirmation, then async generation and waiting.
- Detailed video production workflow: Storyboard, first frames, shot videos, direct business Connections, `video-edit`, and the final MP4.
- `video-edit` Content stores ordered inputs via `videoSequence` and optional `audioSequence`; create matching incoming Connections in the same `add_canvas_elements` call.
- Frame workflow: group only exact root-level writable sibling Elements; never include read-only Element types, do not re-frame existing Frames/Groups, and no unframing or deletion is offered.
- Layout strategies: `row_incremental`, `dependency_flow`, `explicit_position`.
- Version management: the first Content is automatically main; appended candidates require user confirmation before main Content selection, with a retry cap on failures.

## Design marker processing

A `[@design_marker:name]` mention is the user annotating a region of a Canvas image they want changed. It encodes the target image, the marked region, and the intent.

```
[@design_marker:red-ear]
- Image location: Demo/images/dog.jpg
- Marked area: Small area at top-right of the image
- Coordinates: Top-left (64.0%, 7.0%)
```

### Core principles

1. **Image-to-image only** — the original image is a reference; the change produces a new image.
2. **Original stays untouched** — generate a new Element; never modify or delete the original.
3. **No independent overlays** — "add X to image" means image-to-image generation, not placing a separate Element on the Canvas.

### Processing steps

1. **Parse** — extract the marker name (the intent), the image path, and the marked area / coordinates.
2. **Understand** — call `visual_understanding` on the image to get its content description and dimensions. Convert the marker's Canvas project-relative path to a Workspace-relative path by prefixing the exact `project_path` before this call (for example, `./images/dog.jpg` in project `Demo` becomes `Demo/images/dog.jpg`). Do not pass the bare `./images/...` path to `visual_understanding`. You need to know what the image contains to describe what should change and what must stay.
3. **Build the prompt** — `[full scene from visual_understanding] + [the change, at the marked location] + [preserve everything else]`. Fold the marker coordinates directly into the prompt, combined with the object name from `visual_understanding`.
4. **Generate** — `add_canvas_elements` with a single image Element whose Content uses `source=generated`, `content_type=image`, a specific `name`, `reference_images=[original project-relative path]`, and `size` set to the original image's dimensions.

```python
# visual_understanding was already called and returned the scene description
# and the original dimensions (e.g. 1920x1080).

result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "dog-red-ear",
        "element_type": "image",
        "name": "dog with red ear",
        "content": {
            "source": "generated",
            "content_type": "image",
            "name": "dog with red ear",
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

**Video generation:** Distinguish minimal basic Canvas video generation from a video-production task. For a minimal request such as “generate a video” or “animate this image” without uploaded-asset production, an existing Canvas task, continuation, revision, delivery, or professional-production intent, first read `references/video-generation.md`. For ordinary/direct video production, professional video production, uploaded-asset production, continuation, revision, final delivery, or a request naming a storyboard, multiple shots, first frames, staged approvals, Connections, BGM replacement, or final composition, first read `references/professional-video-production.md`. Descriptions such as “professional-looking”, “premium”, or “cinematic” express output quality and do not by themselves request the professional production workflow. Use the exact reference path; do not call any Canvas tool first. Do not answer or draft a prompt until the matching reference has been read.

## Reference routing

Load references only when the matching task appears:

- `references/image-generation.md` — image generation, revision, reference images, or image retry.
- `references/video-generation.md` — minimal basic Canvas video generation, equivalent to direct Canvas image generation, without uploaded-asset production, professional-production Connections, staged workflow, or continuation/revision orchestration.
- `references/professional-video-production.md` — the complete video-production workflow, including ordinary direct production, direct professional video with Connections, detailed staged production with storyboards, first frames, shot dependencies, layout strategies, revisions, recovery, audio, and final composition through `add_canvas_elements`.
- `references/image-search.md` — the user asks to search and import web images (`search_canvas_image_candidates`).
- `references/prompt-library.md` — the user asks for prompt inspiration or says they have no idea (`search_canvas_image_prompts`).
- `references/asset-reconciliation.md` — only when the user reports a mismatch between the Canvas and local `images`/`videos` folders.

No reference may widen the deletion, retry, or direct file-operation boundaries.
