# Professional video production

Load this reference for any video-production task that creates, continues, revises, or finishes a video from uploaded assets, existing Canvas Elements, generated anchors, a video storyboard, shot videos, audio, or an existing edit. It covers the ordinary direct workflow, direct professional production, and detailed staged production using the current Canvas tools.

## When to use

Use this reference when the user explicitly asks for video production, professional video production, an ordinary/simple/direct video-production workflow, or a production stage such as a storyboard, multiple shots, first frames, staged approvals, Connections, BGM replacement, or final composition.

For a minimal basic Canvas request such as “generate a video” or “animate this image” with no video-production intent, use `references/video-generation.md` instead. A request that mentions uploaded assets, an existing Canvas production, continuation, revision, or final delivery is a video-production task even when the user says ordinary or direct.

## Production modes

Select exactly one mode from the user's wording and the current task state:

- **Ordinary direct mode**: the user explicitly asks for ordinary, simple, or direct video production. Generate one final video directly with no storyboard, initialization images, first frames, `video-edit`, or separate final composition, while preserving direct business predecessors through explicit Connections.
- **Direct professional mode**: the user asks for professional video production without a detailed or staged workflow. Generate one final professional video directly, preserving direct business predecessors.
- **Detailed staged mode**: the user asks for detailed, fine-grained, staged, multi-shot production, or names storyboards, first frames, shot videos, staged approvals, BGM replacement, or final composition. Use all applicable stages below.

If a video-production task does not name a mode, use detailed staged mode. Do not silently switch modes during a task. If the user later requests a staged workflow after an ordinary or direct result, continue from the existing Canvas Elements and switch at the next incomplete stage.

All three modes share the same project binding, `result.content` reading, estimate gate for billed video, Content versioning, asset-reference, failure-recovery, and user-confirmation rules below.

### Ordinary direct mode

Use this mode only when the user explicitly asks for a simple, direct, or ordinary video-production workflow.

1. Understand all submitted assets and identify the subject, product treatment, scene, visual style, motion, pacing, audio expectation, duration, aspect ratio, resolution, model, and artifact exclusions.
2. Present one complete creative target and the final video prompt in readable Markdown. Ask one concise confirmation question after presenting it; ask again after any material revision.
3. Freeze the complete billable request, estimate points, and wait for explicit confirmation unless the user explicitly opts out in the current request and accepts an unknown cost.
4. After confirmation, create one `video` Element with `add_canvas_elements`, use `dependency_flow` layout for the production relation, put all used reference paths in the corresponding arrays, and add Connections only for submitted Canvas Elements that directly contribute to the final video. Reference-only assets stay in the arrays without a Connection.
5. Wait immediately on any returned generation task, query the completed Element, present the candidate, and select its main Content only after user confirmation.
6. For a revision, append a candidate to the same Video Element with `add_canvas_contents`; do not create a duplicate logical Element. If the user asks for a storyboard, staged approvals, BGM replacement, or separate composition, preserve the current result and continue in detailed staged mode.

Example using the current Canvas tools:

```python
from sdk.tool import tool

estimate = tool.call("estimate_canvas_content_points", {
    "project_path": "Demo",
    "production_rule": "video_generation",
    "items": [{
        "item_ref": "direct-video",
        "name": "Product launch video",
        "prompt": "Create the confirmed 15-second product video from [image1] and [image2]. Preserve product identity and scene details. Smooth commercial motion, no text, watermark, captions, or interface artifacts.",
        "model_id": "model-from-media-model-info",
        "reference_image_paths": ["./images/product.webp", "./images/scene.webp"],
        "duration_seconds": 15,
        "aspect_ratio": "9:16",
        "resolution": "1080p",
    }],
})
print(estimate.content)
```

After the estimate is confirmed, submit the same `item_ref` and frozen request through `add_canvas_elements` with one generated `video` Content. Add only the confirmed direct predecessor Connections; do not change any billable prompt field after confirmation:

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "direct-video",
        "element_type": "video",
        "name": "Product launch video",
        "layout": {"strategy": "dependency_flow"},
        "connections": [
            {"source_element_id": "product-element-id"},
            {"source_element_id": "scene-element-id"},
        ],
        "content": {
            "source": "generated",
            "content_type": "video",
            "name": "Product launch video",
            "prompt": "Create the confirmed 15-second product video from [image1] and [image2]. Preserve product identity and scene details. Smooth commercial motion, no text, watermark, captions, or interface artifacts.",
            "estimate_id": "confirmed-estimate-id",
            "model_id": "model-from-media-model-info",
            "input_mode": "image_reference",
            "task": "generate",
            "reference_image_paths": ["./images/product.webp", "./images/scene.webp"],
            "duration_seconds": 15,
            "aspect_ratio": "9:16",
            "resolution": "1080p",
        },
    }],
})
print(result.content)
```

### Direct professional mode

This is the default after the user asks for professional video production but does not request a detailed or staged workflow.

- Generate one final video directly.
- Preserve the direct business predecessor relations from the submitted source Elements.
- Do not create a storyboard, initialization images, first frames, a `video-edit`, or a separate final composition.
- The generated video Element is the final result for this mode.

Use the exact parameter confirmation, estimate, generation, wait, and candidate-selection gates described below.

### Detailed staged mode

Use this mode only when the user explicitly asks for detailed, fine-grained, staged, or multi-shot production, or names workflow stages such as a storyboard, first frames, shot videos, staged approvals, BGM replacement, or final composition.

## Direct professional mode workflow

1. Understand the submitted assets and identify the intended subject, scene, motion, style, duration, aspect ratio, resolution, output model, and audio expectations. Provider-managed asset URIs such as `asset://virtual-human-asset-id` are opaque generation inputs: keep them in the supported reference array and do not send them to `visual_understanding`, read them as workspace files, import them into Canvas, or create synthetic Elements for them.
2. Present one complete creative target and the final video prompt before generating anything. Ask one concise confirmation question for unresolved material choices.
3. By default, before calling `estimate_canvas_content_points`, freeze the complete final prompt and request, including every reference binding token and prompt constraint. Call the estimate with that exact request, then wait for explicit confirmation of the estimate. Only when the user explicitly says in the current request that estimation is unnecessary and accepts an unknown point cost may you skip the estimate and set `skip_point_estimate=true`.
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

For a provider-managed virtual-human asset, keep the opaque URI in `reference_image_paths`, bind it as `[image1]` in the prompt, and do not import it, call `visual_understanding` on it, or create a synthetic Canvas Element. Use this path only with a currently supported Seedance-series model.

Use this reference-mode mapping for generated videos:

| Situation | `input_mode` | Required inputs |
|---|---|---|
| Prompt-only generation | `standard` | No reference paths or frame paths |
| One or more image references | `image_reference` | `reference_image_paths` and ordered `[imageN]` bindings |
| Mixed image, video, or audio references | `omni_reference` | Matching reference arrays and ordered bindings |
| Start/end frame transition | `keyframe_guided` | `frame_start_path` and optional `frame_end_path`; do not duplicate as reference images |

If the current `<media_model_info>` does not declare a mode, do not use it. A reference path controls generation input; only an explicit Connection creates a Canvas business relation.

## Shared video generation estimate gate

All professional video generation is billable. Estimate the exact request first, show the full parameters and per-item points, and wait for explicit confirmation by default. Only an explicit current-request opt-out that accepts an unknown point cost may use `skip_point_estimate=true` without an `estimate_id`. If the parameters change, estimate again before generating unless the user has explicitly opted out for that generation.

## Core rules

- Adapt the workflow to the current request and existing results; do not restart completed stages.
- Treat the current Canvas as the source of truth. The Markdown plan is recovery context, not a replacement for querying current Elements.
- Every confirmation is a hard gate: tool success is not user approval. Do not continue past a gate until the user confirms or requests a revision.
- Infer established facts and reasonable defaults before asking. Ask only about unresolved decisions that materially affect the result.
- Use the user's language for plans, names, descriptions, prompts, and confirmations. Keep tool names, IDs, and paths unchanged.
- In Chinese replies, use “视频分镜” or “分镜” instead of the English word “Storyboard”.
- Keep each task bound to its current Canvas project. If a tool fails, do not call `initialize_canvas`, invent a new project suffix, or change `project_path` to bypass the error. Recover in the current project: read the failure from `result.content`, inspect the referenced Element or Content, repair it with the available tools, and retry only after the repair is complete. If safe recovery is impossible, tell the user the blocking reason and stop.
- Do not repeat a paid image or video generation call speculatively. After a failure, first inspect and repair the current Canvas state or correct the referenced workspace path; regenerate only when the user has approved the revised generation or the retry is an exact, safe retry of the failed task.

## Confirmation gates

- Infer established facts and reasonable defaults before asking questions, but ask about every unresolved choice that materially changes the result. Resolve no more than one to three related decisions in one confirmation round.
- Present a complete direction, storyboard, first-frame prompt collection, or other long-form material as readable Markdown in the assistant message. Then use `ask_user` with one concise question that does not repeat the displayed content.
- Treat direction approval, storyboard approval, first-frame prompt approval, initialization or first-frame candidate approval, the first trial video, edit configuration, and final composition as hard gates when they apply.
- A revision request is not approval. Keep the current candidate unconfirmed, append a new candidate to the same logical Element, and ask for confirmation again after the result returns.
- After resuming from a pause or interruption, query the relevant Elements before continuing.

## Content versioning and retries

Use the current Canvas Content lifecycle rather than creating replacement Elements:

- New logical result: omit `element_id` and `content_id` in `add_canvas_elements`.
- New candidate for an existing result: pass the existing `element_id` and omit `content_id`; use `add_canvas_contents` when appending to an existing writable Element.
- Exact retry: use `retry_canvas_content_generation` with the exact `element_id`, `content_id`, and original `item_ref` returned by the latest result or query. Never add `-retry`, `-new`, or a counter to `item_ref`.
- Select main Content only after the user confirms the exact candidate, using `select_canvas_main_content` with the exact Element and Content IDs.
- Never identify an existing result by name alone. Preserve every returned Element ID, Content ID, task ID, video ID, status, and media path.
- Retry only failed Content with explicit user consent, at most twice. Never retry `pending`, `processing`, `queued`, `running`, or `completed` Content.
- If waiting times out or returns a still-running task, call `wait_canvas_generation` again with the exact returned `generation_task_id`; never submit a duplicate generation request.

## Asset and prompt fidelity

- Treat all submitted compatible assets as required source material by default. Use every relevant path in the appropriate reference array and map every materially contributing Canvas Element separately to direct Connections.
- Exclude an asset only when the user explicitly asks to ignore it or the current generation tool cannot accept its media type. If relevance is unclear, ask before omitting it.
- Before each generation call, verify that every used asset appears in the correct reference array and that direct Connections contain only the intended upstream Element IDs.
- Reference media may contain watermarks, captions, interface marks, compression artifacts, unwanted backgrounds, or accidental crops. Preserve intended subject information but explicitly exclude those defects from generated prompts unless the user requests them.
- Use only model IDs, `input_mode`, task values, aspect ratios, resolutions, durations, FPS values, and other generation fields declared by the current `<media_model_info>`.
- Provider-managed asset URIs such as `asset://virtual-human-asset-id` are opaque generation inputs. Keep them in supported reference arrays, bind them in the prompt, and never inspect, import, or create synthetic Canvas Elements for them.

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
For every imported root Element without an upstream source, pass `layout: {"strategy": "dependency_flow"}` explicitly. This keeps professional-production roots in a vertical root column; omitting `layout` invokes the generic horizontal `row_incremental` layout. After importing, query the returned Elements and verify their Element IDs, Content IDs, status, project-relative paths, and dimensions before continuing.

For imported media, the source file must be passed as `content.asset_path`. This is the tool input path, not the final Canvas `src`; the import service validates and materializes the file into the project's canonical media directory before storing its project-local `src`. Do not use `path`, `media_path`, `file_path`, or `src` as synonyms for `asset_path`.

Use this shape for each imported item:

```python
{
    "item_ref": "import-product",
    "element_type": "image",
    "name": "Product reference",
    "layout": {"strategy": "dependency_flow"},
    "content": {
        "source": "imported",
        "content_type": "image",
        "asset_path": "Project/imports/product.webp",
    },
}
```

If validation reports `Unknown parameter`, do not try alternate path field names. Re-read the `add_canvas_elements` schema and retry with `content.asset_path`; do not proceed to asset understanding until the import returns successfully.

### 2. Understand the assets

Use `visual_understanding` to identify subjects, products, scenes, text, style, distinguishing details, defects, and factual constraints. Separate direct observations from uncertain inferences.
Imported assets are original reference material only. They do not count as initialization visual anchors, storyboard first frames, or confirmed main Content unless a newly generated anchor has been created and confirmed through the stage below.
Treat uncertain brand marks, product categories, and feature claims as inferences rather than facts. If a requested selling point is not supported by the submitted assets, identify the gap and ask the user to confirm it before putting the claim into a generation prompt.

### 3. Confirm the creative direction

Draft a concise direction covering objective, subject, setting, story line, visual tone, opening, development, and ending. Display it as Markdown and confirm before creating media or saving a storyboard.

### 4. Generate and confirm initialization images

Generate only the visual anchors the direction requires: a character look, product hero, location, prop, or style reference.

This stage is mandatory before creating or saving a storyboard in detailed mode. Do not treat an imported asset as completion of this stage. If the direction appears to need no new anchor, state the reason and obtain explicit user confirmation before proceeding without one.

Before generating, confirm any missing aspect ratio, total duration, and output resolution. Suggest defaults but do not silently choose them.
Canvas node arrangement and final video aspect ratio are separate decisions. Do not infer the final video aspect ratio from the dimensions of one imported image.

Map every submitted source medium to its Canvas Element. Pass every media path as generation evidence and every owning Element as a direct upstream source — do not rely on prompt text alone to represent an imported subject.

Confirm each generated anchor and select its main Content before depending on it downstream. If the user requests a change, append a candidate to the same Element, confirm again, and only then select main.

The confirmation sequence is mandatory: generate the initialization candidate, wait for completion, query its Element, show or summarize the candidate, call `ask_user`, and wait. A successful tool result or visual inspection is not user approval.

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
            "generationConfig": {
                "model_id": "confirmed-image-model",
                "size": "1600x900",
                "resolution": "2K",
                "aspect_ratio": "16:9",
            },
            "shots": [
                {"id": "S01", "description": "Shot: reveal — Scene: dark stage — Camera: slow push-in — Action: product emerges — Focus: establish tone"},
                {"id": "S02", "description": "Shot: detail — Scene: three-quarter angle — Camera: orbit — Action: product rotates — Focus: material finish"},
            ],
        },
    }],
})
```

A storyboard update is the latest working storyboard; it is not a user-selectable media candidate. For a partial revision, append or update only the changed shot descriptions while preserving the existing storyboard Element and generation settings. For a confirmed complete replacement, removal, or reorder, replace the full shot list in one update. Never save unconfirmed generation prompts as storyboard shot descriptions. If shot count or order changes, update the storyboard before rebuilding the downstream video sequence.
The persisted Storyboard generation configuration must include the selected model, size, resolution, and aspect ratio. The Canvas protocol stores it as `model_id`, `size`, `resolution`, and `image_generation_config.aspect_ratio`; do not leave model or aspect ratio implicit and do not invent unsupported settings.

### 6. Generate and confirm first frames

Do not generate a first frame immediately after saving. First display the opening shot's complete first-frame prompt, call `ask_user`, and wait for explicit approval or revisions. Only after approval should you generate the opening frame.

After the opening frame returns, wait for its task if needed, query the exact Element, show or summarize the candidate, call `ask_user`, and wait for explicit approval. Only after the opening frame is confirmed may you draft and confirm the remaining prompts. Every first-frame request must pass all confirmed initialization assets in `reference_images` (and the corresponding project paths when required by the provider), not just the asset most relevant to that shot. Generate one independent image task per shot, verify every requested shot succeeded, preserve successful frames, and retry only missing or rejected shots.

Use one generated `image` Element per shot. The storyboard Element is the direct upstream source of each first-frame Element; reference paths are generation inputs. A first-frame revision appends a new Content to the same first-frame Element and does not create a duplicate logical Element:

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "first-frame-s01",
        "element_type": "image",
        "name": "Opening shot first frame",
        "layout": {"strategy": "dependency_flow"},
        "connections": [{"source_element_id": "storyboard-element-id"}],
        "content": {
            "source": "generated",
            "content_type": "image",
            "name": "Opening shot first frame",
            "prompt": "The confirmed opening shot composition, subject identity, scene, camera framing, lighting, and artifact exclusions.",
            "reference_images": ["./images/product-anchor.webp", "./images/scene-anchor.webp", "./images/style-anchor.webp"],
            "size": "1080x1920",
        },
    }],
})
print(result.content)
```

Read the returned `element_id`, `content_id`, status, generation task ID, and media path from `result.content`. Call `wait_canvas_generation` for a returned task ID, then `query_canvas_element_details`; never treat `pending`, `processing`, or a successful tool call as user approval.

### 7. Generate and confirm shot videos

Before each shot-video call, inspect the current `<media_model_info>` and use only a declared mode such as `standard`, `image_reference`, `omni_reference`, or `keyframe_guided`. Bind every reference token by array order. Use exactly the corresponding confirmed first-frame Element as the shot video's direct upstream Connection; additional initialization or product references may remain generation inputs but must not become direct Connections.

Generate the first shot video as a trial; wait or query until its state is known, present the completed candidate, and confirm motion, subject consistency, camera behavior, pacing, and visual direction before generating the rest. Then generate the remaining confirmed shots in supported batches. `pending`, `processing`, `queued`, and `running` are submitted states, not failures; preserve their IDs and do not submit duplicates. Preserve successful videos and revise only affected shots. Each billed shot video still goes through the shared estimate gate in this reference unless the user's explicit current-request opt-out covers that shot generation.

For each shot video, freeze and estimate the exact request first. After confirmation, create one generated `video` Element with a Connection from exactly its corresponding first-frame Element:

```python
result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
    "items": [{
        "item_ref": "shot-video-s01",
        "element_type": "video",
        "name": "Opening shot video",
        "layout": {"strategy": "dependency_flow"},
        "connections": [{"source_element_id": "first-frame-s01-element-id"}],
        "content": {
            "source": "generated",
            "content_type": "video",
            "name": "Opening shot video",
            "prompt": "Animate the confirmed first frame [image1] with stable subject identity, natural motion, and the approved camera behavior. No text or watermark.",
            "estimate_id": "confirmed-estimate-id",
            "model_id": "model-from-media-model-info",
            "input_mode": "image_reference",
            "task": "generate",
            "reference_image_paths": ["./images/shot-s01-first-frame.webp"],
            "duration_seconds": 4,
            "aspect_ratio": "9:16",
            "resolution": "1080p",
        },
    }],
})
print(result.content)
```

Use `standard` for prompt-only generation, `image_reference` for image references, `omni_reference` for mixed media references, and `keyframe_guided` only when the current model declares it. For `keyframe_guided`, pass `frame_start_path` and optional `frame_end_path`; do not duplicate those files in `reference_image_paths`. Bind every reference token by array order before estimating.

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

An empty `audioSequence` preserves audio already present in the source videos when available. When revising an existing Video Edit, preserve its Element, append or update the appropriate Content, rebuild `videoSequence` from the currently confirmed shot Video Element IDs, and confirm the edit configuration again before composing. Adding, replacing, or removing BGM requires importing or reusing the Audio Element, updating `audioSequence`, confirming the new edit, and composing again. Recalculate the expected total duration after adding, removing, or changing shot durations.

### 9. Compose and deliver

Create the final Video Element through `add_canvas_elements` only after the user confirms the edit configuration. Declare the `video-edit -> final-video` Connection and `dependency_flow` layout in that request. Use generated Video Content with `task="compose"`, `input_mode="video_edit"`, and `videoEditElementId` set to the confirmed Video Edit Element ID. Then verify the returned final Element with `query_canvas_element_details` and present the MP4 path, duration, dimensions, and audio status.

The final output is the current Video Edit's main Content. Composition is synchronous and does not use `wait_canvas_generation`. If composition fails, preserve the failed Content and active/main pointers, repair the inputs or configuration, ask the user before retrying, and verify the returned result Element after a successful retry.

## Canvas tool mapping for migrated video-production scenarios

Use the current Canvas tools below; do not call the removed video-production tool names:

| Production need | Current Canvas tool |
|---|---|
| Create or recover a project | `initialize_canvas` |
| Import uploaded media | `add_canvas_elements` with `source="imported"` and `content.asset_path` |
| Read the current project index | `query_canvas_overview` |
| Read exact Content, status, paths, and Connections | `query_canvas_element_details` |
| Create or update a storyboard | `add_canvas_elements` / `add_canvas_contents` with `storyboard` Content |
| Generate an initialization image or first frame | `add_canvas_elements` / `add_canvas_contents` with generated `image` Content |
| Generate a direct video or shot video | `add_canvas_elements` / `add_canvas_contents` with generated `video` Content |
| Wait for image or video generation | `wait_canvas_generation` |
| Retry one failed Content | `retry_canvas_content_generation` |
| Select the confirmed main Content | `select_canvas_main_content` |
| Estimate billed video generation | `estimate_canvas_content_points` |
| Change layout | `layout_canvas_elements` |
| Add, remove, or replace a Connection | `manage_canvas_connections` |
| Configure an ordered edit | `add_canvas_elements` / `add_canvas_contents` with `video-edit` Content |
| Compose the final MP4 | `add_canvas_elements` with generated Video Content and `task="compose"` |

The table above is authoritative for this workflow. Translate every scenario to the current Canvas tool and Content lifecycle; do not invent alternate tool names or bypass the Canvas business tools.

## Direct upstream relations

A Connection declares only a direct business predecessor. Reference paths are generation inputs; they do not imply Connections.

- Direct professional video: connect from every submitted Canvas Element that materially contributes to the final video. Do not infer a Connection from a reference path whose owning Element was not submitted as a business predecessor.
- Initialization image: connect from every imported or confirmed Element materially combined into the result.
- Storyboard: connect from the confirmed initialization anchors only, not the original imported assets behind them.
- First frame: connect from the storyboard Element.
- Shot video: connect from exactly its corresponding first-frame Element only — never add initialization, product, scene, or storyboard Elements to a shot video's Connections.
- Video edit: create direct incoming Connections from every Element listed in `videoSequence` and `audioSequence` in the same `add_canvas_elements` call. Use `manage_canvas_connections` only for later standalone relationship maintenance. Composition validates these Video Edit input Connections before producing the result.

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
- If the media is correct but a Canvas relation is wrong, repair only the relation with `manage_canvas_connections`: query the exact current Connection IDs first, provide the complete intended endpoints, and do not regenerate media. Remove or replace relations only with explicit user intent.

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

## manage_canvas_connections

Add, remove, or replace an explicit Connection.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `items` | Yes | Add: `source_element_id` + `target_element_id`. Remove: `remove_connection_ids`. Replace: new endpoints + `replace_existing_connections=true` + exact old IDs |

```python
tool.call("manage_canvas_connections", {
    "project_path": "Demo",
    "items": [{"item_ref": "storyboard-to-frame",
               "source_element_id": "element-740000000000000005",
               "target_element_id": "element-740000000000000006"}],
})
```

Query and obtain the exact Connection ID before removing or replacing; never guess it from names, positions, or endpoints. Remove or replace only with explicit user intent.

## Final composition through `add_canvas_elements`

The final MP4 is a normal generated Video Element. The model owns the Element declaration, Connection, and layout; the application only executes FFmpeg and writes the result into the pending Content.

```python
tool.call("add_canvas_elements", {
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
            "task": "compose",
            "input_mode": "video_edit",
            "videoEditElementId": "element-740000000000000020",
        },
    }],
})
```

Composition is synchronous and does not use `wait_canvas_generation`. If `audioSequence` is empty, preserve source-video audio when available. Do not call `video_understanding` after composition; query Canvas metadata only. On failure, keep the failed Content for diagnosis and preserve active/main pointers; fix inputs or configuration, ask the user before retrying, and submit a new final Video Element through `add_canvas_elements`.
