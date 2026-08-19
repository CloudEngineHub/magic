---
name: canvas-manager
description: Core Canvas management rules for querying and changing Elements, Content, layouts, and Connections.
---

# Canvas Manager

Use Canvas business tools through Code mode. Read `result.content` after every call and use exact IDs returned by the previous result.

## Object rules

- An Element owns a `contents` list. Adding another version to an existing Element uses `add_canvas_contents`; it does not create another Element.
- Normal existing Content is immutable. Use a new Content version for a new candidate.
- Generation status, result URI, task bindings, active Content, and other managed fields are controlled by the system.
- Select a main Content only after the user explicitly chooses a completed Content.
- Do not expose or reason about the project file format, its protocol version, or its storage implementation.

## Layout rules

- Prefer named strategies: `row_incremental`, `dependency_flow`, or `explicit_position`.
- Use `row_incremental` by default for ordinary new Elements.
- Use `dependency_flow` only when the video-production reference requires it.
- Use `explicit_position` only when the user gives exact coordinates.
- Do not calculate coordinates from context when a named strategy is sufficient.

The available layout strategy names are:

- `row_incremental`: append new Elements in stable rows without moving existing Elements.
- `dependency_flow`: place new Elements from their direct upstream Connections for a production flow.
- `explicit_position`: use only when the user gives exact `x` and `y` values.

## Connection rules

- Use `add_canvas_connections` for new, removed, or replaced Connections.
- A normal add provides exact `source_element_id` and `target_element_id`.
- A removal provides exact `remove_connection_ids` obtained from a Canvas query.
- A replacement sets `replace_existing_connections=true`, provides exact old Connection IDs, and provides the new source and target Element IDs.
- Remove or replace a Connection only when the user explicitly asks to remove or reconnect it. Never infer the old Connection from names, proximity, or source/target alone.
- Element and Content deletion are not available to the Agent; tell the user to remove them directly on the Canvas.

## Generation and retry rules

- Content generation may be synchronous or asynchronous according to the selected capability.
- For asynchronous generation, call `wait_canvas_generation` with the returned task ID. If it times out, call it again with the same task ID; timeout is not a generation failure.
- Only retry a generated Content when its status is `failed` and the user explicitly asks for a retry.
- A single Content may be retried at most 2 times. Including the initial attempt, it has at most 3 generation attempts.
- Do not reset the retry count by changing `item_ref`, prompt, model, size, or other generation inputs.
- Never loop retries automatically. After the limit is reached, stop retrying. If the user wants another candidate, create a new Content version with `add_canvas_contents`.

## Tool sequence

1. If Element IDs are unknown, call `query_canvas_overview`.
2. Call `query_canvas_element_details` when complete Content or Connection details are needed.
3. Use the smallest tool matching the requested change: add Element, add Content, retry failed Content, select main Content, layout Elements, or manage Connections.
4. Query again after a write when the next decision depends on persisted state.

## Tool contracts and chaining

`add_canvas_elements` creates new Elements. Each item must have an `item_ref` and `element_type`; `layout`, `content`, and initial `connections` are optional. Initial Connections use the current item as the anchor: provide exactly one of `source_element_id`, `source_item_ref`, `target_element_id`, or `target_item_ref`.

For `content.source="imported"`, provide an existing workspace-relative `asset_path`; do not provide managed status, task, or result fields. The tool validates the file and rejects a path that is missing, outside the workspace, or already registered.

`add_canvas_contents` appends one new Content version to an existing Element. Use it when the Element already exists, including a new generated candidate. It never overwrites an existing Content.

`retry_canvas_content_generation` targets one existing generated Content that is `failed`. It preserves the same Element and Content IDs. If it returns a `generation_task_id`, call `wait_canvas_generation` with that ID.

`add_canvas_connections` has three explicit branches:

- Add: `source_element_id` plus `target_element_id`.
- Remove: `remove_connection_ids` only.
- Replace: new source and target, `replace_existing_connections=true`, and exact `remove_connection_ids`.

Successful Code mode content examples:

```text
Canvas Elements added successfully.
- item_ref=image-1 | status=completed | element_id=<element-id> | content_id=<content-id>
```

```text
Canvas Content versions added successfully.
- item_ref=video-1 | status=processing | element_id=<element-id> | content_id=<content-id> | generation_task_id=<task-id>
Next: call wait_canvas_generation with the returned generation_task_id values.
```

```text
Canvas generation status returned.
- item_ref=- | status=processing | element_id=<element-id> | content_id=<content-id> | timed_out=true
Continue waiting with the same generation_task_id; do not create a duplicate generation task.
```

Use only the exact `element_id`, `content_id`, `connection_id`, and `generation_task_id` returned by a previous tool. `item_ref` is only a short label for correlating items in the current batch; it is not a Canvas identifier and is not reused in a later call.

## References

- Load `references/image-generation.md` only for image generation or image retry.
- Load `references/video-generation.md` only for video generation or video task recovery.
- Load `references/video-production.md` only for complete video-production orchestration.
- Load `references/video-storyboard.md` only for storyboard work.
- Load `references/asset-reconciliation.md` only when the user explicitly mentions a mismatch between the Canvas and local `images` or `videos` directories.
