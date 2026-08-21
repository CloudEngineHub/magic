# Professional video production

Load this reference only for professional video production. It covers both the default direct professional mode and the optional detailed staged mode.

## When to use

Use this reference only when the user explicitly asks for professional video production or names a professional production stage such as a storyboard, multiple shots, first frames, staged approvals, Connections, BGM replacement, or final composition.

Do not use this reference for a basic Canvas video request such as “generate a video” or “generate a promotional video” when the user has not requested professional production.

## Production modes

### Direct professional mode

This is the default after the user asks for professional video production but does not request a detailed or staged workflow.

- Generate one final video directly.
- Preserve the direct business predecessor relations from the submitted source Elements.
- Do not create a storyboard, initialization images, first frames, a `video-edit`, or a separate final composition.
- The generated video Element is the final result for this mode.

Use the exact parameter confirmation, estimate, generation, wait, and candidate-selection gates described below.

### Detailed professional mode

Use this mode only when the user explicitly asks for detailed, fine-grained, staged, or multi-shot production, or names workflow stages such as a storyboard, first frames, shot videos, staged approvals, BGM replacement, or final composition.

## Direct professional mode workflow

1. Understand the submitted assets and identify the intended subject, scene, motion, style, duration, aspect ratio, resolution, output model, and audio expectations. Provider-managed asset URIs such as `asset://virtual-human-asset-id` are opaque generation inputs: keep them in the supported reference array and do not send them to `visual_understanding`, read them as workspace files, import them into Canvas, or create synthetic Elements for them.
2. Present one complete creative target and the final video prompt before generating anything. Ask one concise confirmation question for unresolved material choices.
3. Before calling `estimate_canvas_content_points`, freeze the complete final prompt and request, including every reference binding token and prompt constraint. Call the estimate with that exact request, then wait for explicit confirmation of the estimate.
4. After the estimate is confirmed, call `add_canvas_elements` once with one `video` Element. Carry the returned `estimate_id` unchanged in the generated Content and copy the estimated request byte-for-byte. Do not add `[imageN]` bindings, watermark instructions, or other prompt text after confirmation. If anything changes, estimate again and ask for confirmation again before generation.
5. When a submitted Canvas Element is a direct business predecessor, add its exact Element ID in the new video's `connections`. Reference paths alone never create Connections.
6. Call `wait_canvas_generation` immediately when the generated Content returns a task ID.
7. Query the generated Element, present the candidate, and select its main Content only after the user confirms it.

Do not create a storyboard, initialization image, first frame, `video-edit`, or final composition in this mode. If the user later requests staged production, continue from the existing result and switch to detailed professional mode without silently mixing the two workflows.

### Direct professional mode references

For a generated video Content, use `prompt`, `model_id`, `estimate_id`, `name`, `input_mode`, `task`, `reference_image_paths`, `reference_video_paths`, `reference_audio_paths`, `frame_start_path`, `frame_end_path`, `size`, `duration_seconds`, `aspect_ratio`, `resolution`, `fps`, `seed`, and `watermark` as supported by the current `<media_model_info>`.

Bind reference assets in the prompt by array order:

- `reference_image_paths[0]` → `[image1]`, `reference_image_paths[1]` → `[image2]`
- `reference_video_paths[0]` → `[video1]`, `reference_video_paths[1]` → `[video2]`
- `reference_audio_paths[0]` → `[audio1]`, `reference_audio_paths[1]` → `[audio2]`

Place each token next to the subject, action, or source media it controls. Do not put file paths in the prompt.

Use `task="edit"` and `input_mode="video_edit"` only for an explicit video-to-video edit. For prompt-only generation, omit reference arrays. For image, video, or audio references, populate the corresponding arrays and bind every reference in the prompt.

Keep one clear scene and one main action unless the user explicitly asks for a sequence. Cover the subject, action, scene, camera, lighting, pacing, and any requested sound, narration, or dialogue. Preserve requested narration or dialogue verbatim.

## Shared video generation estimate gate

All professional video generation is billable. Estimate the exact request first, show the full parameters and per-item points, and wait for explicit confirmation. Pass the returned `estimate_id` unchanged to the real generation call. If the parameters change, estimate again before generating.

## Core rules

- Adapt the workflow to the current request and existing results; do not restart completed stages.
- Treat the current Canvas as the source of truth. The Markdown plan is recovery context, not a replacement for querying current Elements.
- Every confirmation is a hard gate: tool success is not user approval. Do not continue past a gate until the user confirms or requests a revision.
- Infer established facts and reasonable defaults before asking. Ask only about unresolved decisions that materially affect the result.
- Use the user's language for plans, names, descriptions, prompts, and confirmations. Keep tool names, IDs, and paths unchanged.
- In Chinese replies, use “视频分镜” or “分镜” instead of the English word “Storyboard”.
- Keep each task bound to its current Canvas project. If a tool fails, do not call `initialize_canvas`, invent a new project suffix, or change `project_path` to bypass the error. Recover in the current project: read the failure from `result.content`, inspect the referenced Element or Content, repair it with the available tools, and retry only after the repair is complete. If safe recovery is impossible, tell the user the blocking reason and stop.
- Do not repeat a paid image or video generation call speculatively. After a failure, first inspect and repair the current Canvas state or correct the referenced workspace path; regenerate only when the user has approved the revised generation or the retry is an exact, safe retry of the failed task.

## Asking the user

Use the `ask_user` tool as a direct tool call for every applicable confirmation gate. Prefer `confirm` for yes-or-revise decisions, `select` for mutually exclusive directions, and `multi_select` only for independent choices. Put long-form content (directions, shot plans, prompt collections) in the assistant message as readable Markdown, then ask one concise question that does not repeat the displayed content.

## Detailed mode task plan and recovery

This section applies only to detailed professional mode.

Store each resumable task as Markdown under `.magic/video-production-plans/`.

At the start of a task:

1. Search plan filenames and contents for the task topic, Element IDs, and media filenames.
2. Continue the matching plan; if several match, ask the user which one.
3. Create a task-specific plan when none matches.
4. Query known Element IDs in batches of 1–10 before relying on saved state.
5. Resume from the earliest incomplete confirmation gate.

Keep the plan concise and update it after each confirmation, generation result, failure, revision, or changed next step.

## Detailed production stages

### 1. Set up the Canvas

Create or reuse the project with `initialize_canvas`. Import user-supplied images, videos, or audio that need stable Element IDs with `add_canvas_elements` using `source=imported`.

### 2. Understand the assets

Use `visual_understanding` to identify subjects, products, scenes, text, style, distinguishing details, defects, and factual constraints. Separate direct observations from uncertain inferences.

### 3. Confirm the creative direction

Draft a concise direction covering objective, subject, setting, story line, visual tone, opening, development, and ending. Display it as Markdown and confirm before creating media or saving a storyboard.

### 4. Generate and confirm initialization images

Generate only the visual anchors the direction requires: a character look, product hero, location, prop, or style reference.

Before generating, confirm any missing aspect ratio, total duration, and output resolution. Suggest defaults but do not silently choose them.

Map every submitted source medium to its Canvas Element. Pass every media path as generation evidence and every owning Element as a direct upstream source — do not rely on prompt text alone to represent an imported subject.

Confirm each generated anchor and select its main Content before depending on it downstream. If the user requests a change, append a candidate to the same Element, confirm again, and only then select main.

### 5. Draft, confirm, and save the storyboard

Draft about four shots when no count is specified (fewer for simple tasks). Each shot covers name, scene, framing or camera, action, focus, and duration.

Display and confirm the complete shot plan before saving. Save the confirmed shot descriptions as a storyboard Content:

```python
tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "storyboard",
        "element_type": "storyboard",
        "name": "Product launch storyboard",
        "layout": {"strategy": "dependency_flow"},
        "content": {
            "source": "user",
            "content_type": "storyboard",
            "generationConfig": {"aspect_ratio": "16:9", "resolution": "1080p"},
            "shots": [
                {"id": "S01", "description": "Shot: reveal — Scene: dark stage — Camera: slow push-in — Action: product emerges — Focus: establish tone"},
                {"id": "S02", "description": "Shot: detail — Scene: three-quarter angle — Camera: orbit — Action: product rotates — Focus: material finish"},
            ],
        },
    }],
})
```

A storyboard update is the latest working storyboard; it is not a user-selectable media candidate.

### 6. Generate and confirm first frames

Do not generate a first frame immediately after saving. First confirm the opening shot's complete first-frame prompt, then generate. After the opening frame is confirmed, confirm the remaining prompts, then generate one independent image task per shot. Verify every requested shot succeeded; preserve successful frames and retry only missing or rejected shots.

### 7. Generate and confirm shot videos

Generate the first shot video as a trial; confirm motion, subject consistency, camera behavior, and pacing before generating the rest. Then generate the remaining shots in supported batches. Preserve successful videos and revise only affected shots. Each billed shot video still goes through the shared estimate gate in this reference.

### 8. Configure the edit and optional audio

Import user-provided audio when needed. The initial composition accepts zero or one audio track. After the user chooses to create the complete video, build the `video-edit` Content with the confirmed ordered Video Element IDs:

```python
tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "final-edit",
        "element_type": "video-edit",
        "name": "Product launch final edit",
        "layout": {"strategy": "dependency_flow"},
        "connections": [
            {"source_element_id": "element-740000000000000010"},
            {"source_element_id": "element-740000000000000011"},
            {"source_element_id": "element-740000000000000014"},
        ],
        "content": {
            "source": "user",
            "content_type": "video-edit",
            "videoSequence": ["element-740000000000000010", "element-740000000000000011"],
            "audioSequence": ["element-740000000000000014"],
            "output": {"aspectRatio": "16:9", "resolution": "1080p", "format": "mp4"},
        },
    }],
})
```

An empty `audioSequence` preserves audio already present in the source videos when available.

### 9. Compose and deliver

Call `compose_canvas_final_video` with the confirmed Video Edit Element, then verify with `query_canvas_element_details` and present the MP4 path, duration, dimensions, and audio status.

## Direct upstream relations

A Connection declares only a direct business predecessor. Reference paths are generation inputs; they do not imply Connections.

- Direct professional video: connect from every submitted Canvas Element that materially contributes to the final video. Do not infer a Connection from a reference path whose owning Element was not submitted as a business predecessor.
- Initialization image: connect from every imported or confirmed Element materially combined into the result.
- Storyboard: connect from the confirmed initialization anchors only, not the original imported assets behind them.
- First frame: connect from the storyboard Element.
- Shot video: connect from exactly its corresponding first-frame Element only — never add initialization, product, scene, or storyboard Elements to a shot video's Connections.
- Video edit: create direct incoming Connections from every Element listed in `videoSequence` and `audioSequence` in the same `add_canvas_elements` call. Use `add_canvas_connections` only for later standalone relationship maintenance. Composition validates these Video Edit input Connections before producing the result.

For a new direct professional video, create the initial relations in the same `add_canvas_elements` call:

```python
tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "professional-direct-video",
        "element_type": "video",
        "name": "Product launch video",
        "layout": {"strategy": "dependency_flow"},
        "connections": [
            {"source_element_id": "element-740000000000000001"},
            {"source_element_id": "element-740000000000000002"},
        ],
        "content": {
            "source": "generated",
            "content_type": "video",
            "prompt": "Show the confirmed product [image1] in a premium studio scene with a slow push-in, stable product identity, and no text or watermark.",
            "estimate_id": "confirmed-estimate-id",
            "reference_image_paths": ["Demo/images/product.png"],
        },
    }],
})
```

Use `dependency_flow` for professional production relations. Basic Canvas image and video generation outside this reference remains `row_incremental` and does not create these production Connections.

## Failure and revision

- Preserve confirmed results and all successful media.
- Regenerate only affected initialization images, frames, or shot videos.
- After a first-frame change, update the corresponding shot and regenerate only dependent videos.
- When a shot video changes, keep its Element ID, append a candidate Content, confirm, and select main before composing again.
- When changing shot count or order, update the storyboard first, preserve unaffected outputs, rebuild the ordered sequence, confirm the edit, and compose again.
- When adding, replacing, or removing BGM, import or reuse the Audio Element, update `audio_sequence`, confirm the edit, and compose again.
- If a video task returns `processing`, keep its IDs and do not submit a duplicate; retry a failed task with its existing IDs.
- At most 2 retries per Content; never loop.
- A new direction appends a candidate with `add_canvas_contents`; it does not create a duplicate logical Element.
- Select main Content only after the user confirms the completed candidate.

## Provider-managed assets

Only Seedance-series video models support provider-managed asset URIs such as `asset://virtual-human-asset-id`. Keep a supported provider asset URI in the appropriate reference array, bind it in the prompt, and do not read it as a workspace file, import it into the Canvas, or create a synthetic Element for it. For other video models, use a workspace-relative media path.

## Layout strategies

Use `layout_canvas_elements` to arrange the production chain. It changes layout only; never touches Content or Connections.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Each item: `item_ref`, `element_id`, `layout` required |

| Strategy | Use | Notes |
|---|---|---|
| `row_incremental` | Default for design scenes | Omit `position` |
| `dependency_flow` | Storyboards, first frames, shot videos — any clear dependency chain | Omit `position` |
| `explicit_position` | Only when the user gives exact coordinates | Pass `position.x`, `position.y` |

```python
tool.call("layout_canvas_elements", {
    "project_path": "Demo",
    "items": [
        {"item_ref": "layout-storyboard", "element_id": "element-740000000000000005", "layout": {"strategy": "dependency_flow"}},
        {"item_ref": "layout-shot-1", "element_id": "element-740000000000000010", "layout": {"strategy": "dependency_flow"}},
    ],
})
```

Use `explicit_position` only when the user gives coordinates; otherwise omit `position`. Frame children use coordinates local to their direct Frame. Do not regenerate Content to change layout, do not move nodes to add Content, and do not infer Connections from visual distance.

## add_canvas_connections

Add, remove, or replace an explicit Connection.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Add: `source_element_id` + `target_element_id`. Remove: `remove_connection_ids`. Replace: new endpoints + `replace_existing_connections=true` + exact old IDs |

```python
tool.call("add_canvas_connections", {
    "project_path": "Demo",
    "items": [{"item_ref": "storyboard-to-frame",
               "source_element_id": "element-740000000000000005",
               "target_element_id": "element-740000000000000006"}],
})
```

Query and obtain the exact Connection ID before removing or replacing; never guess it from names, positions, or endpoints. Remove or replace only with explicit user intent.

## compose_canvas_final_video

Synchronously compose the final MP4 from a Video Edit Element's main Content.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `video_edit_element_id` | Yes | The Video Edit Element to compose |
| `result_name` | Yes | Name of the final video result |
| `result_element_id` | No | Only an explicit target Video Element |

```python
tool.call("compose_canvas_final_video", {
    "project_path": "Demo",
    "video_edit_element_id": "element-740000000000000020",
    "result_name": "Product launch final cut",
})
```

Composition is synchronous and does not use `wait_canvas_generation`. Verify the returned `result_element_id` with `query_canvas_element_details`. On failure, keep the failed Content for diagnosis and preserve active/main pointers; fix inputs or config, then ask the user before composing again.
