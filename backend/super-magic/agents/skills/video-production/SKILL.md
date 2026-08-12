---
name: video-production
description: Use when the user wants to create, continue, revise, or finish a video-production task from uploaded assets, existing Canvas Elements, generated images, a video storyboard, shot videos, audio, or an existing edit. Provides an adaptive workflow for asset understanding, creative direction, initialization images, storyboard planning, first frames, shot videos, revisions, recovery, and final MP4 delivery.
---

# Core Rules

- Adapt the workflow to the user's current request and existing results. Do not restart completed stages.
- Select the production mode from the user's explicit wording. If the user explicitly requests “普通模式” (or an equivalent direct-generation mode), use the ordinary workflow below. If the user explicitly requests “精细模式” (or an equivalent storyboard workflow), use the detailed workflow. If the user does not name a mode, always use the detailed workflow by default.
- Call Canvas tools through Code Mode with `sdk.tool.call(...)`.
- Read tool outputs from `result.content`, then carry the returned IDs, media paths, counts, and statuses into the plan and later calls. Do not depend on `result.data`.
- Use the user's language for plans, analysis, names, descriptions, prompts, and confirmation text. Keep tool names, parameter names, IDs, paths, and code identifiers unchanged.
- In Chinese replies, use “视频分镜” or “分镜” instead of the English word “Storyboard”.
- Treat current Canvas results as the production source of truth. The Markdown plan is recovery context, not a replacement for querying current Elements.

# Production Modes

The mode changes the amount of planning and the number of generation stages. Do not expose internal Canvas or DSL details to the user; describe the selected mode in terms of the creative workflow and expected result.

## Ordinary Mode

Use this mode only when the user explicitly asks for a simple, direct, or ordinary video workflow.

1. Understand all user-provided assets and identify the intended subjects, products, scenes, style, motion, duration, aspect ratio, resolution, and output model.
2. Present one complete creative target in readable Markdown before generating anything. Include the final video objective, subject and product treatment, scene, visual style, motion and pacing, audio expectation, output specifications, reference-material usage, artifact exclusions, and the complete final video prompt.
3. If duration, aspect ratio, resolution, or model is missing, propose suitable values and ask the user to confirm them in the same confirmation round.
4. Ask one concise confirmation question after the complete creative target. Do not repeat the full plan or prompt inside the question. Treat any requested change as a revision and ask for confirmation again.
5. After explicit confirmation, call `generate_video_production_videos` once with one task. Put every relevant reference path in the task's reference arrays and put every submitted Canvas Element that directly contributes to the final video in `source_element_ids`.
6. Do not call `upsert_storyboard`, generate initialization images, generate first-frame images, `configure_video_edit`, or `compose_canvas_video` for the ordinary workflow. The generated video Element is the final video result for this mode.
7. If the user later asks to revise the ordinary-mode video, preserve its Element, append a new candidate Content, wait for confirmation, and promote the confirmed Content. If the user asks for a multi-shot storyboard, staged approvals, BGM replacement, or a separate final composition, continue in detailed mode using the existing results instead of silently mixing workflows.

Ordinary-mode example:

```python
from sdk.tool import tool

result = tool.call("generate_video_production_videos", {
    "project_path": "city-travel-short-film",
    "model_id": "model-from-media-model-info",
    "tasks": [{
        "name": "City Travel Final Video",
        "prompt": "Create the complete 15-second vertical travel video from [image1] and [image2]. Show the traveler arriving at the city overlook, walking through the lively street, and ending with a confident view of the skyline. Maintain the confirmed subject identity, clothing, products, and visual style. Use smooth cinematic motion, clear visual progression, and no text, watermarks, captions, or interface artifacts.",
        "aspect_ratio": "9:16",
        "input_mode": "image_reference",
        "task": "generate",
        "reference_image_paths": [
            "images/traveler-upload.webp",
            "images/city-upload.webp"
        ],
        "duration_seconds": 15,
        "resolution": "1080p",
        "source_element_ids": [
            "element-747400000000000001",
            "element-747400000000000002"
        ]
    }]
})
print(result.content)
```

In ordinary mode, `source_element_ids` describes the direct business relationship from the submitted assets to the final video. Reference paths describe generation inputs; if a reference is used only for visual guidance and is not a direct business predecessor, keep its path in the reference array but omit its Element ID from `source_element_ids`.

## Detailed Mode

Use the existing detailed workflow for all other requests. It covers staged creative confirmation, initialization assets, video storyboard, first frames, shot videos, optional audio, edit configuration, and final MP4 composition. The detailed workflow below remains the default when the user does not explicitly select a mode.

# Task Plan and Recovery

Store each resumable task as ordinary Markdown under:

```text
.magic/video-production-plans/
```

At the start of a task:

1. Search plan filenames and contents for the task topic, mentioned Element IDs, and media filenames.
2. Continue the matching plan. If several plans match, ask the user which one to continue.
3. Create a task-specific Markdown plan when no plan matches.
4. Query known Element IDs in batches of 1 to 10 before relying on saved state.
5. Resume from the earliest incomplete confirmation gate.

Use task-fitting headings and human-readable progress. Keep the plan concise and update it after a confirmation, generation result, failure, revision, or changed next step. Include only useful state such as:

```markdown
# City Travel Short Film

## Goal

Create a 30-second, 16:9 city travel short film.

## Confirmed Decisions

- Lively documentary style
- No narration

## Relevant Results

- Storyboard Element: element-747400000000000005
- Confirmed opening frame: element-747400000000000006 / element-747400000000000006-content-2

## Current State

Opening frame confirmed; remaining frame prompts are awaiting confirmation.

## Next Step

Confirm the remaining frame prompts.
```

# Confirmation Gates

- Infer established facts and reasonable defaults before asking questions.
- Ask only about unresolved decisions that materially affect the result. Resolve no more than one to three related decisions in one confirmation round.
- Present story directions, shot plans, and prompt collections as readable Markdown in the assistant message. Then use `ask_user` with one concise question that does not repeat the displayed content.
- Treat direction approval, storyboard approval, prompt approval, generated-media approval, the first trial video, and final composition as hard gates when they apply.
- A revision request is not an approval. If the user asks to change, regenerate, or adjust a result, keep the current candidate unconfirmed, revise that same logical Element, and ask for confirmation again after the new candidate is returned.
- Tool success is not user approval. Do not continue through a required gate until the user confirms or supplies revisions.
- After resuming from a pause or interruption, query the relevant Elements before continuing.

# Media Versions

Apply one versioning contract to generated images and videos:

- New logical result: omit `element_id` and `content_id`.
- New candidate for an existing result: pass `element_id`, omit `content_id`, and normally omit `set_as_main`.
- Retry or update one exact Content: pass its existing `content_id`; also pass `element_id` when available so ownership is validated.
- Confirmed candidate: call `promote_canvas_content` with the exact returned Element ID and Content ID.
- Use `set_as_main=True` only when the user has explicitly requested that the new result become main without a later comparison or confirmation step.
- When a user requests a change to an existing generated result, preserve its `element_id`, omit `content_id` to append a new candidate Content, and do not promote it until the user confirms the revised candidate.
- Never identify an existing result by name alone. Preserve every returned Element ID, Content ID, and media path.

# Direct Upstream Relations

`source_element_ids` declares only the direct business predecessors of a newly generated or updated Element. It is not a list of every reference file used by the model.

- Reference image, video, audio, and frame paths are generation inputs. They do not imply Canvas relations.
- When the user submits or confirms multiple assets for the current production task, treat all of them as required source material by default. Do not silently select only one file.
- Pass each submitted asset's path in the appropriate reference field when it is used as generation evidence. Add an Element ID to `source_element_ids` only when that Element is the direct business predecessor that should be connected on Canvas.
- When the user submits multiple compatible assets for one result, use all of them by default when they are relevant to generation. This does not mean that every referenced asset should become a direct Canvas connection.
- Exclude a submitted asset only when the user explicitly asks to ignore it or its media type cannot be used by the current generation tool; if relevance is unclear, ask before omitting it.
- Before each generation call, verify that every used asset appears in the appropriate reference path array, then separately verify that `source_element_ids` contains only the intended direct business predecessors.
- When updating an existing Element, omit `source_element_ids` to preserve its current upstream relations.
- Pass `source_element_ids=[]` only when the user intentionally removes managed upstream relations.
- Do not manage relation IDs or placement values.
- Use `repair_video_production_connections` only when the user asks to correct or remove an existing Canvas relation without regenerating the related media. Do not call it for ordinary media generation or revision.
- For a relation-only repair, provide the complete direct source list for every affected target. An empty list intentionally removes all video-production-managed incoming relations for that target. Never infer a relation from a reference path alone.

Use this default production chain when it matches the task:

```text
Imported assets -> Initialization images -> Video storyboard -> First-frame images -> Shot videos -> Video edit -> Final video
```

Specific relation inputs:

- Initialization image: include every imported or confirmed Element materially combined into the result. For example, an image of a subject wearing an imported product in an imported location must include the subject, product, and location Element IDs that actually contribute to the result.
- Video storyboard: use only the confirmed initialization Element IDs that represent the immediate visual anchors for the storyboard. Do not also connect the original imported assets that were used to create those anchors; those assets are already upstream of the initialization Elements.
- Storyboard first frame: use `storyboard_element_id` and `shot_id`; omit task-level `source_element_ids`.
- Shot video: use exactly one direct source: the corresponding confirmed first-frame Image Element ID as `source_element_ids`. Never add initialization assets, character references, product references, scene references, storyboard Element IDs, or any other reference-image Element IDs to a shot video's connections. Those files may still appear in `reference_image_paths` when the model needs them.
- Video edit: `video_sequence` and `audio_sequence` already define its upstream Elements.
- Final video: `video_edit_element_id` already defines its upstream Element.

# Default Workflow

Run only the stages needed for the current task.

## 1. Resume or Set Up the Canvas

Read the task plan and query known Elements. Create a Canvas project only when no suitable project exists. Import user-supplied images, videos, or audio that need stable Element IDs and persistent media paths.

## 2. Understand the Assets

Use `visual_understanding` when images need analysis. Identify usable subjects, products, scenes, text, style, distinguishing details, defects, and factual constraints. Separate direct observations from uncertain inferences.

Summarize the useful assets and likely production roles. Ask only about high-impact uncertainty.

## 3. Confirm the Creative Direction

Draft a concise story or content direction using only relevant sections, such as objective, subject, setting, story line, visual tone, opening, development, ending, or scenario-specific priorities.

Display the direction as Markdown and confirm it before creating production media or saving a storyboard.

## 4. Generate and Confirm Initialization Images

Generate only the visual anchors required by the confirmed direction, such as a character look, product hero, location, prop, costume, creature, vehicle, environment, or style reference. A person or character look is required only when the task needs one.

Before generating the first initialization image, check whether the user has provided the target aspect ratio, total video duration, and output resolution. If any of these specifications is missing, ask the user to confirm the missing values together before generating initialization images. You may suggest suitable defaults based on the task and current model capabilities, but do not silently choose unspecified values.

Use source media as generation evidence when useful. Reference media may contain watermarks, captions, interface marks, compression artifacts, unwanted backgrounds, or accidental crops; instruct the model to preserve intended information without copying unwanted defects.

Before generating an initialization image, map every submitted source medium to its Canvas Element. Use all submitted assets by default: pass every media path as generation evidence and every owning Element ID as a direct upstream source. Do not rely on prompt text alone to represent an imported subject, product, or scene that should remain traceable in the Canvas.

Confirm the generated anchors and promote the selected image or video Contents before depending on them downstream.

The confirmation sequence is mandatory: generate the initialization candidate, show or summarize the result, call `ask_user`, and wait. If the user requests a change such as changing the subject's gender, update the same existing Element by appending a candidate Content, then call `ask_user` again. Only after explicit approval may you promote the Content and continue to the storyboard.

## 5. Draft, Confirm, and Save the Video Storyboard

Draft approximately four shots when the user has not specified a count, using fewer for simple tasks. Each shot should cover the shot name, scene, framing or camera approach, action, focus, and duration.

Display and confirm the complete shot plan before calling `upsert_storyboard`. Save confirmed shot descriptions without unconfirmed generation prompts. Use a suitable image model, aspect ratio, and resolution from current model capabilities and delivery requirements. A storyboard update is the latest working storyboard by default; do not treat storyboard Content as a user-selectable media candidate and do not call `promote_canvas_content` for ordinary storyboard edits.

## 6. Generate and Confirm First Frames

After the storyboard is saved, do not generate a first frame immediately. First display the opening shot's complete first-frame prompt as Markdown, call `ask_user`, and wait for explicit approval or revisions. Only after approval should you update that shot description and call `generate_video_production_images`.

After generating the opening first frame, call `ask_user` and wait for approval before drafting or generating the remaining prompts. A generated or visually inspected result never counts as approval by itself.

After the opening frame is confirmed, draft and confirm the remaining prompts together when practical. Generate one independent image task for every required shot. Verify from `result.content` that every requested `shot_id` succeeded. Preserve successful frames and retry only missing or rejected shots.

## 7. Generate and Confirm Shot Videos

Generate only the first shot video as a trial. Confirm motion, subject consistency, camera behavior, pacing, and visual direction before generating the remaining videos.

Generate the remaining confirmed shots in supported batches. Preserve successful videos and revise only affected shots.

## 8. Configure the Edit and Optional Audio

Import user-provided audio when needed. The initial composition capability accepts zero or one final audio track.

After the user chooses to create the complete video, call `configure_video_edit` with the confirmed ordered Video Element IDs, optional Audio Element ID, and output settings. When updating an existing Video Edit, the latest configuration is the current working configuration and becomes its main Content after a successful update.

## 9. Compose and Deliver

Call `compose_canvas_video` with the confirmed Video Edit Element. Present the returned MP4 path, duration, dimensions, and audio status. For later revisions, pass the existing final Video Element through `result_element_id` when the user wants to keep the same logical result node; show the new candidate and promote it after confirmation.

# General Capabilities

## `visual_understanding`

Use it before creative planning when supplied images need analysis, or after generation when a critical result needs visual verification. Analyze closely related images together when comparison helps continuity.

## `ask_user`

Use it for applicable confirmation gates. Prefer `confirm` for yes-or-revise decisions, `select` for mutually exclusive directions, and `multi_select` only for independent choices. Put long-form content in the assistant message, not inside the question.

# Canvas Tools

## `create_canvas`

Create a project only when no suitable Canvas project exists. Keep the returned workspace-relative project path for every later call.

```python
from sdk.tool import tool

result = tool.call("create_canvas", {
    "project_path": "city-travel-short-film"
})
print(result.content)
```

## `import_canvas_assets`

Import related user-supplied media together. Retain each returned Element ID, Content ID, and media path.

```python
from sdk.tool import tool

result = tool.call("import_canvas_assets", {
    "project_path": "city-travel-short-film",
    "assets": [
        {
            "name": "Traveler Reference",
            "path": ".tmp/traveler.webp"
        },
        {
            "name": "City Reference",
            "path": ".tmp/city.webp"
        }
    ]
})
print(result.content)
```

## `query_canvas_elements`

Query only known Element IDs, with 1 to 10 IDs per call. Use the returned current state for recovery and later tool inputs.

```python
from sdk.tool import tool

result = tool.call("query_canvas_elements", {
    "project_path": "city-travel-short-film",
    "element_ids": [
        "element-747400000000000005",
        "element-747400000000000006",
        "element-747400000000000010"
    ]
})
print(result.content)
```

## `promote_canvas_content`

Call it only after the user confirms the exact candidate Content.

```python
from sdk.tool import tool

result = tool.call("promote_canvas_content", {
    "project_path": "city-travel-short-film",
    "element_id": "element-747400000000000006",
    "content_id": "element-747400000000000006-content-2",
    "confirmed_by_user": True,
    "confirmation_text": "The user confirmed this first frame."
})
print(result.content)
```

# Video Production Tools

## `upsert_storyboard`

Create or update the confirmed ordered shots. `generation_config` is required for a new storyboard and may be omitted on later updates to preserve it. Updates merge shots by ID; use `replace_all_shots=True` only for a confirmed complete replacement, removal, or reordering.

Use `source_element_ids` for direct upstream initialization Elements. Do not use the same Element as both a storyboard source and a shot's `output_image_element_id`.

```python
from sdk.tool import tool

result = tool.call("upsert_storyboard", {
    "project_path": "city-travel-short-film",
    "name": "City Travel Storyboard",
    "source_element_ids": [
        "element-747400000000000003",
        "element-747400000000000004"
    ],
    "shots": [
        {
            "id": "S01",
            "duration_seconds": 4.0,
            "description": "Shot name: Sunrise arrival\nScene: City overlook\nCamera: Wide slow push-in\nAction: The traveler watches the skyline\nFocus: Establish the location and tone"
        },
        {
            "id": "S02",
            "duration_seconds": 4.0,
            "description": "Shot name: Market walk\nScene: Lively market street\nCamera: Medium tracking shot\nAction: The traveler walks through the crowd\nFocus: Natural movement and local atmosphere"
        }
    ],
    "generation_config": {
        "image_model_id": "current-supported-image-model",
        "aspect_ratio": "16:9",
        "resolution": "1K"
    }
})
print(result.content)
```

For a partial update, pass the returned `element_id` and include only changed shots. The tool keeps the newest storyboard Content as both active and main. Pass an existing `content_id` only when the caller explicitly needs to update that exact stored storyboard Content.

## `generate_video_production_images`

Each task creates one initialization image or one storyboard first frame. Use a complete prompt that states the subject, what must remain consistent, the scene, composition, style, and unwanted artifacts.

### Detailed use case: create an initialization image

Use this when the confirmed direction needs a visual anchor such as a product hero, character look, location, prop, or visual style. Put every materially used reference in `reference_images`; put only the Elements that are direct business predecessors of the new initialization image in `source_element_ids`.

```python
from sdk.tool import tool

result = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "tasks": [{
        "name": "Traveler in Rainy City Street",
        "size": "1440x2560",
        "prompt": "A confident young traveler in a dark waterproof jacket walks through a rainy city street at dawn. Use the first reference for the traveler's appearance and clothing, and the second reference for the wet street environment. Preserve the intended product shape, colors, and subject identity, but do not copy watermarks, captions, interface marks, compression artifacts, or accidental crops. Realistic commercial photography, natural overcast light, full-body vertical composition.",
        "reference_images": [
            "images/traveler-upload.webp",
            "images/rainy-street-upload.webp"
        ],
        "source_element_ids": [
            "element-747400000000000001",
            "element-747400000000000002"
        ]
    }]
})
print(result.content)
```

Read `result.content` and retain the returned `element_id`, `content_id`, `media_path`, and `status`. If the result is a candidate for an existing image, call the tool again with that `element_id` and no `content_id` to append another Content. If one exact Content failed, retry with both its `element_id` and `content_id`; do not create a duplicate. After showing the candidate and receiving explicit user approval, call `promote_canvas_content` with the exact returned IDs.

Revision and exact retry example:

```python
# The user asks to change the approved direction but keep the same logical image.
revision = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "tasks": [{
        "name": "Traveler in Rainy City Street",
        "element_id": "element-747400000000000001",
        "prompt": "Keep the same traveler, jacket, and rainy street, but change the composition to a closer waist-up shot with the traveler looking toward the street lights.",
        "reference_images": ["images/traveler-upload.webp", "images/rainy-street-upload.webp"]
    }]
})
print(revision.content)

# If the backend reports one exact failed Content, retry that Content in place.
retry = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "tasks": [{
        "name": "Traveler in Rainy City Street",
        "element_id": "element-747400000000000001",
        "content_id": "element-747400000000000001-content-2",
        "prompt": "Retry the same rainy street image with the confirmed subject, clothing, composition, and artifact exclusions.",
        "reference_images": ["images/traveler-upload.webp", "images/rainy-street-upload.webp"]
    }]
})
print(retry.content)
```

### Detailed use case: generate storyboard first frames

Use this only after the storyboard and the opening first-frame prompt have been confirmed. The storyboard supplies the current image model, aspect ratio, and resolution, so do not repeat those settings in each task.

```python
result = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "storyboard_element_id": "element-747400000000000005",
    "tasks": [
        {
            "name": "Opening Skyline First Frame",
            "shot_id": "S01",
            "prompt": "Wide sunrise view of the confirmed traveler overlooking the modern city skyline, warm natural light, realistic documentary style, stable clothing and product details, strong opening composition.",
            "reference_images": [
                "images/traveler-anchor.webp",
                "images/city-anchor.webp"
            ]
        },
        {
            "name": "Market Walk First Frame",
            "shot_id": "S02",
            "prompt": "Medium tracking-shot composition of the confirmed traveler entering a lively market street, natural movement implied, consistent outfit and visual tone.",
            "reference_images": [
                "images/traveler-anchor.webp",
                "images/market-anchor.webp"
            ]
        }
    ]
})
print(result.content)
```

For every requested `shot_id`, verify that `result.content` reports a successful image and its IDs. Preserve successful frames and retry only missing or failed shots. A storyboard frame update is the latest storyboard output; do not use `promote_canvas_content` for ordinary storyboard edits.

## `generate_video_production_videos`

Each task generates one shot video. First inspect the current `<media_model_info>` and use the model's exact mode name, task, duration, resolution, and aspect-ratio values. Bind reference tokens by array order: `reference_image_paths[0]` is `[image1]`, `reference_video_paths[0]` is `[video1]`, and `reference_audio_paths[0]` is `[audio1]`.

### Detailed use case: animate a confirmed first frame

Use `image_reference` when the first frame is a visual reference and the prompt should describe motion while preserving the image's subject and style. Do not use an invented mode such as `first_frame`; if the model requires start/end keyframes, use the keyframe example below instead.

```python
result = tool.call("generate_video_production_videos", {
    "project_path": "city-travel-short-film",
    "model_id": "model-from-media-model-info",
    "tasks": [{
        "name": "City Skyline Opening Shot",
        "prompt": "Animate the confirmed opening frame [image1]: the traveler takes two calm steps toward the skyline, coat fabric moves naturally in the breeze, and the camera makes a slow stable push-in. Preserve the subject identity, clothing, composition, and lighting; do not introduce text or watermarks.",
        "aspect_ratio": "16:9",
        "input_mode": "image_reference",
        "task": "generate",
        "reference_image_paths": [
            "images/opening-skyline-first-frame.webp"
        ],
        "duration_seconds": 4,
        "resolution": "1080p",
        "fps": 24,
        "source_element_ids": [
            "element-747400000000000006"
        ]
    }]
})
print(result.content)
```

The first-frame Element is the only direct Canvas predecessor for a shot video, so put only that one ID in `source_element_ids`. The reference path controls generation input and does not replace the source ID. If the prompt also uses an initialization image, product image, or scene image as a reference, keep its path in `reference_image_paths` but do not add its Element ID to `source_element_ids`. Read `result.content` and retain `element_id`, `content_id`, `video_id` (when processing), `media_path` (when completed), and `status`. `processing`, `queued`, and `running` are submitted states, not failures. After the user confirms a completed candidate, promote that exact Content; for a revision, pass the existing `element_id` without `content_id` to append a new candidate.

Before calling this tool, perform this final relation check:

```python
# Correct: the video is connected only from the corresponding first-frame image.
task["source_element_ids"] = [first_frame_element_id]

# The initialization image may still be used as a model reference, but its Element ID
# must not be added to source_element_ids.
task["reference_image_paths"] = [first_frame_path, initialization_reference_path]
```

When the result is still processing, report the submitted IDs and continue only with work that does not depend on the video file. Use the returned `video_id` with the available video-result/status flow when the next stage needs the completed media. Do not submit a second task merely because the first call returned `processing`.

Video revision example:

```python
revision = tool.call("generate_video_production_videos", {
    "project_path": "city-travel-short-film",
    "model_id": "model-from-media-model-info",
    "tasks": [{
        "name": "City Skyline Opening Shot",
        "element_id": "element-747400000000000010",
        "prompt": "Use the confirmed first frame [image1], but make the camera movement slower and keep the traveler centered throughout.",
        "aspect_ratio": "16:9",
        "input_mode": "image_reference",
        "task": "generate",
        "reference_image_paths": ["images/opening-skyline-first-frame.webp"],
        "duration_seconds": 4,
        "resolution": "1080p",
        "fps": 24,
        "source_element_ids": ["element-747400000000000006"]
    }]
})
print(revision.content)
```

### Detailed use case: control a transition with start and end frames

Use `keyframe_guided` only when the model context declares that mode. Start and end frames belong in `frame_start_path` and `frame_end_path`; do not also put them in `reference_image_paths`.

```python
result = tool.call("generate_video_production_videos", {
    "project_path": "city-travel-short-film",
    "model_id": "model-from-media-model-info",
    "tasks": [{
        "name": "Traveler Reaches the Overlook",
        "prompt": "Create a smooth cinematic transition from the starting frame to the ending frame. Keep the same traveler, clothing, weather, and visual style throughout; the camera follows the movement naturally and ends on the overlook composition.",
        "aspect_ratio": "16:9",
        "input_mode": "keyframe_guided",
        "task": "generate",
        "frame_start_path": "images/shot-02-start.webp",
        "frame_end_path": "images/shot-02-end.webp",
        "duration_seconds": 5,
        "resolution": "1080p",
        "fps": 24,
        "source_element_ids": [
            "element-747400000000000007"
        ]
    }]
})
print(result.content)
```

### Reference-mode checklist

| Situation | Use | Required input relationship |
|---|---|---|
| Prompt-only generation | `standard` | No reference paths or frame paths |
| One or more image references | `image_reference` | Use `reference_image_paths` and cite `[image1]`, `[image2]` in order |
| Mixed image, video, or audio references | `omni_reference` | Use the corresponding arrays and cite each token in order |
| Start/end frame transition | `keyframe_guided` | Use `frame_start_path` and optional `frame_end_path`; do not duplicate them as reference images |

If a mode is not listed in `<media_model_info>`, do not use it. If a generation fails, preserve the failed IDs returned in `result.content` and retry the exact Element or Content rather than creating another logical result.

## `configure_video_edit`

Set the confirmed playback order with `video_sequence`, optional audio with `audio_sequence`, and delivery settings with `output`. The initial release accepts at most one Audio Element and MP4 output.

```python
from sdk.tool import tool

result = tool.call("configure_video_edit", {
    "project_path": "city-travel-short-film",
    "name": "City Travel Final Edit",
    "video_sequence": [
        "element-747400000000000010",
        "element-747400000000000011",
        "element-747400000000000012",
        "element-747400000000000013"
    ],
    "audio_sequence": ["element-747400000000000014"],
    "output": {
        "aspect_ratio": "16:9",
        "resolution": "1080P",
        "format": "mp4"
    }
})
print(result.content)
```

When revising an existing edit, pass its returned `element_id`; pass `content_id` only to update one exact Content. `audio_sequence` is an explicit replacement track: when it contains an Audio Element, the final composition uses that audio. When it is empty, the final composition preserves audio already present in the ordered source videos when available.

## `compose_canvas_video`

Compose the confirmed Video Edit into the final MP4.

```python
from sdk.tool import tool

result = tool.call("compose_canvas_video", {
    "project_path": "city-travel-short-film",
    "video_edit_element_id": "element-747400000000000015",
    "result_name": "City Travel Final Video"
})
print(result.content)
```

# Failure and Revision Handling

- Preserve confirmed results and all successful media.
- Regenerate only affected initialization images, frames, or shot videos.
- If a batch result is incomplete, identify the missing IDs from `result.content`, query uncertain Elements, and stop before claiming the stage is complete.
- After a first-frame change, update the corresponding shot and regenerate only dependent videos.
- Rebuild `video_sequence` from the currently confirmed shot Video Element IDs after shot changes.
- When an initialization image changes, regenerate only first frames or shot videos that actually depend on it; keep unrelated shots and confirmed media unchanged.
- When a shot video changes, keep its existing Video Element ID, append a candidate Content, confirm it, and promote it before composing again. The Video Edit sequence normally continues to reference that same Element ID.
- When adding, replacing, or removing BGM, import or reuse the Audio Element, update `audio_sequence`, confirm the edit configuration, and compose again. An explicit audio input overrides source-video audio; an empty audio sequence preserves source-video audio when available.
- When changing shot count or order, update the storyboard first, preserve unaffected outputs, rebuild the ordered video sequence, confirm the edit, and compose again.
- If a video task returns `processing`, record its `element_id`, `content_id`, and `video_id`; query the Element before any dependent operation. Do not submit a duplicate while the Content is still processing. Retry a failed task using its existing IDs.
- If a connection is wrong but the media itself is correct, call `repair_video_production_connections` with the target Element and its complete intended direct sources. This tool changes only managed incoming relations and does not move nodes or regenerate media.

## `repair_video_production_connections`

Use this tool only for a relation-only correction, such as removing an accidental source, restoring a missing direct source, or replacing an incorrect direct source. Do not use it as part of every generation call.

```python
from sdk.tool import tool

result = tool.call("repair_video_production_connections", {
    "project_path": "city-travel-short-film",
    "targets": [
        {
            "target_element_id": "element-747400000000000010",
            "source_element_ids": ["element-747400000000000006"]
        },
        {
            "target_element_id": "element-747400000000000015",
            "source_element_ids": ["element-747400000000000014"]
        }
    ]
})
print(result.content)
```

The source list is authoritative for each target. Use `source_element_ids: []` only when the user explicitly wants the target's managed incoming relations removed. User-created non-locked relations are preserved.
- Recalculate expected duration after adding, removing, or changing shot durations.
