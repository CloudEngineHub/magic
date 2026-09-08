---
name: canvas-manager
version: 1.1.0
description: "Manage a Canvas through its business tools only — initialize and query projects, create Elements and Content candidates, frame Elements, wait on generation, and process design markers. Use when the user asks to create, edit, or generate anything on a Canvas, such as images, videos, storyboards, video edits, or a final composed video, or when the message contains [@design_canvas_project:...] or [@design_marker:...]. Also use when the user says 'generate an image on my canvas', 'make a video from this canvas project', 'add a new element to my design', or 'edit the marked region of this image'. Layout strategies, Connections, video point estimation, video composition, image search, asset reconciliation, and prompt inspiration live in the references."
---

# Canvas Manager

## Purpose

You maintain a Canvas through its business tools first. Every normal read and write goes through these tools in Code mode. Only the controlled recovery fallback described below may read or edit the target project's `magic.project.js` after the Canvas tools cannot complete a user-requested repair.

## Ground rules

- Act only on a concrete Canvas task from the user.
- Call Canvas tools only in Code mode and continue decisions only from `result.content`.
- Preserve the exact `project_path` supplied by the user or runtime; never guess, shorten, or replace it.
- Treat every Canvas path returned by a query or write result as authoritative. A path such as `./images/foo.webp` is relative to the current Canvas project, not automatically relative to the workspace. Reuse it verbatim for Canvas generation fields. When passing that asset to a workspace-anchored tool such as `visual_understanding`, convert it deterministically to a workspace-relative path by prefixing the exact current `project_path` (for example, `My Canvas` + `/images/foo.webp` becomes `My Canvas/images/foo.webp`); do not guess a directory, filename, or Element ID. If the returned path is already workspace-relative or the conversion is ambiguous, query the exact Element details and stop rather than inventing a path.
- When an existing video needs FFmpeg or another media transformation, perform the transformation in a system temporary directory first. Keep the Canvas workspace dedicated to persistent project assets and Canvas state. Import the completed result only after the runtime capability returns an exact Canvas-importable media reference, then use the imported result for later Canvas operations.
- Treat an uploaded image that already appears as a Canvas Image Element as an existing asset, not a new import candidate. Query the Canvas first, then reuse its exact `element_id`, Content ID, and project-relative `src` for visual understanding and generation. Do not call `add_canvas_elements` or `import_canvas_assets` with `source=imported` for that same asset. Import only when the supplied workspace file has no matching Canvas Element.
- Write `prompt`, `name`, and all user-facing text (plans, descriptions, confirmation messages) in the user's language. Keep tool names, parameter names, IDs, paths, and code identifiers unchanged.
- Use one language consistently for user-facing Canvas terminology. Translate product nouns, table labels, action text, confirmation questions, cost summaries, status summaries, and error explanations into the user's language; do not mix translated sentences with English product nouns.
- Match Canvas product terminology to the user's language. Use these established term pairs when responding:
  `画布` = `Canvas`, `积分` = `Points`, `元素` = `Element`, `内容` = `Content`, `连接` = `Connection`, `分镜` = `Storyboard`, `视频剪辑` = `Video Edit`, `图片` = `Image`, `视频` = `Video`, `音频` = `Audio`, `项目` = `Project`, and `预估费用` = `Estimated cost`.
  Use the Chinese term set consistently in Chinese responses and the English term set consistently in English responses.
- Keep exact tool names, parameter names, IDs, paths, code identifiers, and protocol values unchanged inside code or when identifying a returned field. In prose, use the product terminology that matches the user's language.
- Keep each sentence and its product terms in one language. For example, in an English response write `Estimated cost: 151 Points. Confirm to submit the generation task.` For other languages, translate both the sentence and the product terms consistently.
- Examples use a one-level, space-free path such as `Demo`. This is only an example convention; when the user or runtime provides a path, preserve that exact path, including valid nested directories or spaces.
- Never use file, directory, or shell tools to inspect or modify Canvas state during normal operations. The only exception is the controlled `magic.project.js` recovery fallback described in the asset-reconciliation reference.
- Reuse the exact `element_id`, `content_id`, `connection_id`, and `generation_task_id` returned by earlier results; never guess IDs from names or positions.
- Element and Content deletion are not available to you — tell the user to remove them on the Canvas.
- Connection deletion or replacement requires an exact Connection ID and explicit user intent.
- A generated Content may be retried at most 2 times, only when its status is explicitly `failed`, and only with the user's explicit consent; never loop retries automatically and never retry `pending`, `processing`, `queued`, `running`, or `completed` Content.
- A timeout or a `pending`, `processing`, `queued`, or `running` state is a waiting state, not a failure. Waiting for an asynchronous task is conditional: wait when the next step needs the completed media, its path, dimensions, status, or user preview; otherwise return the submitted state and preserve the exact task ID for later tracking. When waiting, use bounded follow-up calls with the same generation task ID and never submit a duplicate generation request. Only an explicit failed status enters the retry flow.
- The first Content of any Element is automatically its main Content; never ask whether to make it main and never call the main-selection tool for it. For a later candidate appended to an Element that already has a main Content, show the completed candidate and select it as main only after explicit user confirmation. Revising a Content never overwrites it; create a new candidate instead.
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
- Generation tasks: when a write result returns `generation_task_id`, decide whether the current workflow needs the completed media immediately. Wait when a downstream operation, confirmation, or final response depends on it; otherwise keep the submitted result and preserve the exact `generation_task_id`, `element_id`, `content_id`, and `item_ref` for later tracking. A timeout or a `pending`, `processing`, `queued`, or `running` state is not a failure and must not trigger another generation submission. Only an explicit `status=failed` enters controlled retry.
- Paths: Canvas-returned `./images/...`, `./videos/...`, and `./audios/...` paths are for fields scoped to the current Canvas project. Before passing one to a Workspace tool, combine the exact `project_path` with the project-relative path after removing its leading `./`. Without an authoritative returned path, never construct one from a name, directory guess, or file listing.

If the preflight cannot be satisfied, query the current Canvas state or report the missing information to the user. Do not bypass preflight with guessed values, empty strings, placeholder IDs, or extra file operations.

## Capabilities

You can:

- Initialize, restore, and query Canvas projects.
- Create Frames, Storyboards, Video Edits, and media Elements; generate images and videos; import media assets.
- Create or add the first Content as the automatic main Content; append later candidates, retry failed Content, and select an appended candidate as main after user confirmation.
- Frame sibling Elements.
- Track async generation tasks and wait only when the current workflow needs a completed result.
- Process `[@design_marker:...]` annotations into image revisions.
- Search the curated prompt library for inspiration when the user has no idea (`search_canvas_image_prompts`).

Layout strategies, Connections, video point estimation, final video composition, image search, asset reconciliation, and prompt inspiration are covered in the references below.

## Real-asset repair boundary

When the user asks to restore real assets from `.tmp`, another Workspace location, or an explicitly supplied local absolute path, use only source paths that actually exist and were supplied by the user or system. Never create, download, generate, copy, or rename substitute files. Never use shell commands such as `mkdir` or `cp` to modify Canvas state, and never represent a missing source file as a successful repair.

If the original asset is missing, inaccessible, or cannot be mapped reliably to a supplied local path, report that no real asset is available for repair and stop the import. After a successful import, call `query_canvas_element_details` with the exact returned `element_id` and verify the actual Content, status, and media path. Never claim that restoration is complete from an overview, file listing, or name alone.

When the user has explicitly requested a Canvas repair and the available Canvas tools cannot complete it, use the controlled `magic.project.js` recovery fallback in `references/asset-reconciliation.md`. Modify only the exact target project's file, preserve its JSONP wrapper and unrelated fields, decode and re-encode only the `MAGICPROJECTDESIGNDATA://` canvas value with gzip + Base64, keep sidecars and version fields intact, write atomically, and re-read the file to verify the repaired pointers. Do not use this fallback for ordinary Canvas edits, unsupported project versions, or guessed project paths.

## Execution and test-reporting boundary

When reporting a Canvas workflow, distinguish `passed`, `initial call failed but recovered`, `partially passed`, `external resource failed`, `skipped at the user's request`, `not tested`, and `invalid test`. A task that completes after a wait timeout is a recovery case, not a generation failure. An external candidate download or validation failure is not automatically a Canvas workflow failure. Never claim full coverage, end-to-end success, or a 100% success rate for tools or stages that were not actually executed.

You cannot:

- Delete Elements or Content.
- Edit program-managed fields: status, result paths, task binding, retry counts, active/main pointers, or Frame structural Content, except when the controlled `magic.project.js` recovery fallback is repairing persisted state after Canvas tools cannot complete the user-requested repair.
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
Async task returned?                         → wait_canvas_generation only when the completed result is needed now; otherwise preserve the task ID
Billed video generation?                    → estimate_canvas_content_points first, then ask for confirmation before generation
Change layout / wire dependencies?           → layout_canvas_elements, manage_canvas_connections  (see professional-video-production.md)
Compose existing videos or audio?            → add_canvas_elements with task="compose" and composition.videoSequence/composition.audioSequence
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

Parameters: `project_path` is required; `page` and `limit` are optional.

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

Parameters: `project_path` and 1–10 exact `element_ids` are required. Use the `asset_path`, status, task ID, and Connection ID returned in the details only as real inputs to later tools.

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

Parameters: `project_path` and `items` are required; each item needs at least `item_ref` and `element_type`.

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

Read each item's real `element_id`, `content_id`, status, and task ID. If a task ID is returned, wait only when the completed result is needed for the next operation, a confirmation, or the final response; otherwise preserve the task ID and continue independent work. Basic Canvas images and videos use the default `row_incremental` layout and do not wire professional-production Connections. Professional video production is the exception: follow `references/professional-video-production.md` and create only its explicit direct business relations. Before submitting a new item with `layout.strategy="dependency_flow"`, query every existing connection source and inspect its direct parent; a new item is root-level unless the tool explicitly says otherwise, so do not use `dependency_flow` when that would cross a container boundary.

Before calling this tool, validate every nested item against the preflight checklist above. In particular, do not omit `content.name` for generated image/video Content, and do not omit `content.content_type` for imported media. A missing `name` or `content_type` is a request-construction error, not a generation failure.

For imported media, set `content.source="imported"` and pass the exact local file path supplied by the user or by the runtime media-processing capability as `content.asset_path`. Absolute paths may point to any local directory; relative paths must stay inside the workspace. The input is materialized into the project's canonical media directory and becomes the Content's project-local `src`; do not use `path`, `media_path`, `file_path`, or `src` as the import input field.

Do not create a manual `imports/` staging directory or perform FFmpeg writes against the Canvas workspace. For media processed in a system temporary directory, pass the exact import reference returned by the runtime capability. Canvas materializes images into `./images/`, videos into `./videos/`, and audio into `./audios/`, then returns the canonical project-local path. Use only that returned path in later calls.

When a user requests a transformation of an existing Canvas video, guide the workflow with this pattern:

```text
1. Locate the requested source video and read its authoritative Canvas media path.
2. Run the requested media transformation in a system temporary directory.
3. Wait for the runtime result and obtain its exact Canvas-importable media reference.
4. Import the result as a new Video Element with source="imported".
5. Reuse the returned Element, Content, and project-local media path for later operations.
6. Add a Connection from the source video when the processed video is its direct business result.
7. Keep the source video available for other versions and future processing.
```

## `frame_canvas_elements`

Group exact sibling Elements into a new Frame.

Parameters: `project_path` and `items` are required. Selected siblings must all be writable Element types. Never include `text`, `rectangle`, `ellipse`, `triangle`, `star`, or `group`. This tool does not frame existing Frames/Groups and does not offer unframing.

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

Parameters: `project_path` and `items` are required; each item uses an exact `element_id` and new Content.

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

Parameters: `project_path` and `items` are required; only failed Content can be retried, at most 2 times. Never loop retries automatically.

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

Parameters: `project_path` and `items` are required; use only the exact `element_id` and `content_id` confirmed by the user.

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

Wait on an asynchronous task when the current workflow needs its completed media or final status. Do not wait merely because a task ID was returned; if the user asked to submit work in the background or the next steps are independent, preserve the task ID and continue without waiting.

Parameters: `project_path` and `tasks` are required; `max_wait_seconds` is optional. On timeout or `processing`, continue with the original `generation_task_id`.

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

On `completed`, query details when the workflow needs the output. On `pending`, `processing`, `queued`, `running`, or `timed_out=true`, either continue bounded follow-up calls with the same task ID when the result is needed now, or stop waiting and retain the task ID for later tracking. Never resubmit `add_canvas_elements`, `add_canvas_contents`, or retry. A timeout means that this wait call ended before completion, not that generation failed. Only an explicit `status=failed` enters the controlled retry flow.

## `layout_canvas_elements`

Adjust the layout of an existing writable Element or Frame. Never lay out read-only Element types. Layout only changes position and size; it does not generate new Content or infer Connections automatically.

Parameters: `project_path` and `items` are required; use exact IDs returned by a query when creating, removing, or replacing Connections.

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

Parameters: `project_path` and `items` are required; use exact IDs returned by a query when creating, removing, or replacing Connections.

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
- Final video composition: pass ordered Video and Audio Element IDs in `composition.videoSequence` and `composition.audioSequence`. When a Video Edit is the direct predecessor, connect only the Video Edit to the final video; direct media Connections are used when composing without a Video Edit.

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

Parameters: `project_path` and `items` are required; `production_rule` is optional.

Freeze the complete billable generation request before estimating. This includes the final prompt, every `[imageN]`/`[videoN]`/`[audioN]` binding token, reference arrays, model, duration, aspect ratio, resolution, and all fields accepted by the estimate tool. The estimate tool intentionally does not accept `audioPolicy`; keep the audio decision in the frozen workflow state and add it only to the actual generation or composition request. After the user confirms, copy the frozen parameters byte-for-byte into `add_canvas_elements`, then apply the exact request-shape rule below. The estimate result and `estimate_id` are informational and are not required by the generation tool. Do not add a reference binding token, a watermark constraint, or any other prompt wording after confirmation. If any field or prompt text must change, estimate again and ask for confirmation again before submitting.

For direct generated video Content, pass the canonical field as `items[].content.audioPolicy` with the value `auto`, `generate`, or `mute`. Use `mute` when the confirmed result must be silent, `generate` when generated audio is explicitly requested, and omit the field when no audio behavior was requested and no model rule requires an explicit default. Treat an omitted audio capability as unknown, not unsupported; do not tell the user that narration or audio is impossible unless the model explicitly declares audio output unsupported. Distinguish generated voice from recording the user's real voice. For `task="compose"`, do not use the direct-generation field; pass `items[].content.output.audioPolicy` as `preserve` or `mute`. Do not include either field in the point-estimate request. Do not pass provider-specific fields such as `sound`, `generateAudio`, or `audio`. The internal normalized field `generation.audio_policy` must not be used as the external Canvas tool shape. When the selected model declares `native_mute=false` and `mute_fallback=compose`, generate the source video first and create the final Video Element through explicit video composition with `output.audioPolicy="mute"`. If `mute_fallback=unsupported`, ask the user to choose another model or accept a non-silent result.

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

## `search_canvas_image_candidates`

Search for external image candidates and import successfully validated results into the current Canvas project.

Parameters: `project_path`, `topic_id`, and `tasks` are required; each task contains `item_ref`, `name`, and `query`, with optional `count` and aspect-ratio requirements.

```python
result = tool.call("search_canvas_image_candidates", {
    "project_path": "Demo",
    "topic_id": "product-hero",
    "tasks": [{
        "item_ref": "hero-candidates",
        "name": "Product hero candidates",
        "query": "premium product studio photography",
        "count": 3,
    }],
})
print(result.content)
```

Read each returned Element ID and project-local path; a batch may partially succeed.

## `search_canvas_image_prompts`

Search prompts only when the user explicitly wants inspiration or has no direction, and present candidate directions in the user's language.

Parameters: `query` is required; `category`, `sort_by`, `limit`, `offset`, and `random` are optional.

```python
result = tool.call("search_canvas_image_prompts", {
    "query": "product storyboard",
    "category": "Product & Brand",
    "limit": 5,
})
print(result.content)
```

Show 3–5 candidate directions first, then generate images only after the user confirms.

## Final video composition through `add_canvas_elements`

Create the final MP4 as a generated Video Element. Provide ordered Element IDs in `composition.videoSequence`, optional `composition.audioSequence`, layout, and requested export settings in the same request. The composition service resolves each ID to the selected media Content.

When a reusable Video Edit is present, connect only that Video Edit to the final video. Connect the source media to the Video Edit when the edit plan is created. For a direct composition without a Video Edit, connect the contributing source media directly to the final video.

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "final-video",
        "element_type": "video",
        "name": "Product launch final cut",
        "layout": {"strategy": "dependency_flow"},
        "connections": [{"source_element_id": "element-video-edit"}],
        "content": {
            "source": "generated",
            "content_type": "video",
            "name": "Product launch final cut",
            "task": "compose",
            "composition": {
                "videoSequence": ["element-shot-01", "element-shot-02"],
                "audioSequence": ["element-music"],
            },
            "output": {"aspectRatio": "16:9", "resolution": "1080p", "format": "mp4", "audioPolicy": "preserve"},
        },
    }],
})
print(result.content)
```

After the request completes, query the final Video Element with `query_canvas_element_details`. Specify the export settings in each composition request. Reuse the same `composition.videoSequence` and `composition.audioSequence` IDs to create separate 16:9, 9:16, 720p, or other requested versions. Set `output.audioPolicy` to `preserve` for audio or `mute` for a silent MP4.

Use preset or numeric short-side resolutions in `output`, such as `1080p` or `768p`. For exact dimensions, provide both `width` and `height`; these values determine the exported size.

## Workflow coverage

- Image design workflow: direct generation, referenced images, appended candidates, and main Content selection after confirmation only for appended candidates.
- Ordinary video workflow: full creative target, point estimate and `ask_user` confirmation, then async generation and waiting.
- Detailed video production workflow: Storyboard, first frames, shot videos, direct business Connections, `video-edit`, and the final MP4.
- `video-edit` Content stores an editable ordered plan via `videoSequence` and optional `audioSequence`; create matching incoming Connections in the same `add_canvas_elements` call when a reusable edit plan is needed.
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

**Video generation:** Decide the mode first, then load exactly one reference.

Video-intent decision rules:

1. The request names storyboards, multiple shots, first frames, staged approvals, Connections, BGM replacement, or final composition → detailed staged production; read `references/professional-video-production.md`.
2. The request asks for professional or premium production but names none of the above stages → direct professional production; read `references/professional-video-production.md`.
3. The request only says "generate a video" or "animate this image", with no uploaded-asset production, no existing Canvas production, and no continuation, revision, delivery, or production intent → basic video generation; read `references/video-generation.md`.
4. The request involves uploaded assets, an existing Canvas production, continuation, revision, or final delivery — even when the user says "simple" or "quick" → video production; read `references/professional-video-production.md`.
5. The mode is still unclear → ask the user one question: one direct video, or a storyboard with per-shot confirmation.

Quality words such as "professional-looking", "premium", or "cinematic" describe output quality and never by themselves request the production workflow. "Simple" or "quick" never cancels a production workflow that is otherwise present. Use the exact reference path; do not call any Canvas tool first. Do not answer or draft a prompt until the matching reference has been read.

## Reference routing

Load references only when the matching task appears:

- `references/image-generation.md` — image generation, revision, reference images, or image retry.
- `references/video-generation.md` — minimal basic Canvas video generation, equivalent to direct Canvas image generation, without uploaded-asset production, professional-production Connections, staged workflow, or continuation/revision orchestration.
- `references/professional-video-production.md` — the complete video-production workflow, including ordinary direct production, direct professional video with Connections, detailed staged production with storyboards, first frames, shot dependencies, layout strategies, revisions, recovery, audio, and final composition through `add_canvas_elements`.
- `references/image-search.md` — the user asks to search and import web images (`search_canvas_image_candidates`).
- `references/prompt-library.md` — the user asks for prompt inspiration or says they have no idea (`search_canvas_image_prompts`).
- `references/asset-reconciliation.md` — only when the user reports a mismatch between the Canvas and local `images`/`videos` folders.

No reference may widen the deletion or retry boundaries. Direct file operations remain forbidden except for the controlled `magic.project.js` recovery fallback described in the asset-reconciliation reference.
