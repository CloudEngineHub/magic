---
name: video-production
description: Use when the user wants to create, continue, revise, or complete a video-production task from uploaded assets, existing Canvas materials, storyboards, generated images, shot videos, audio, or a final video. Provides an adaptive, confirmation-driven workflow for asset understanding, creative direction, scripts, visual anchors, storyboards, first frames, shot videos, optional audio, task recovery, and final MP4 delivery.
---

# Video Production

## Core Usage

- Use the production flow below as the default path, adapting it to the user's request, available assets, existing Canvas results, and confirmed decisions.
- Call video-production Canvas tools through Code Mode with `sdk.tool.call(...)`.
- Read tool results only from `result.content` and carry the required IDs, paths, counts, and statuses into later calls.
- When the user is using Chinese, call a storyboard a “视频分镜” or “分镜” in all natural-language replies; do not expose the English term “Storyboard”.

## User Language

- Use the user's language for human-readable values, analysis, creative content, plans, prompts, asset names, and confirmations, even though the examples below are in English.
- Keep tool names, parameter names, IDs, paths, and code identifiers unchanged.

## Generated Media Versions

Apply the same versioning rules to generated images and generated videos:

- Creating a new logical media result: omit both `element_id` and `content_id`. The tool creates a new Element and its first Content.
- Revising or replacing the same logical media result at the user's request: reuse the returned `element_id`, omit `content_id`, and pass `set_as_main=True`. The tool appends a new Content to the existing Element and makes it the main Content.
- Creating an alternative candidate for comparison without replacing the current result: reuse `element_id`, omit `content_id`, and leave `set_as_main` unset. Promote the selected Content only after the user chooses it.
- Retrying or updating one exact existing version: pass its existing `content_id`; also pass `element_id` when available so ownership is validated. Do not use a new Content ID.
- Never use a repeated media name as identity and never omit both IDs when revising an existing result. Carry every returned Element ID, Content ID, and media path into the task plan and later calls.

## Conversation Presentation

- Before asking a question, infer established facts and reasonable defaults from the user's request, supplied assets, current plan, existing Canvas results, and available model capabilities.
- Do not repeat questions the user has already answered. In one confirmation round, resolve no more than one to three unresolved decisions that materially affect the creative result. Combine related decisions into one concise `ask_user` question when the choices remain clear; otherwise confirm them sequentially.
- After asset analysis, give a concise summary of the useful assets, their likely production roles, the number of imported Canvas asset Elements, and any high-impact uncertainty that still needs confirmation. Do not reproduce detailed tool output or imitate tool-status cards.
- When the user answers a key direction question, acknowledge the selected direction, state any adopted defaults, and preview the next three to six task-specific stages. Make clear that inferred defaults can still be revised.
- Present long-form directions, scripts, storyboards, and prompt collections as readable Markdown in the assistant message. Then call `ask_user` with exactly one concise confirmation question without repeating the displayed content.
- Adapt headings and stages to the task. A person, product, costume, selling point, initialization image, narration, or fixed shot count is required only when the current production needs it.

## Start or Resume a Task

Store resumable plans under:

```text
.magic/video-production-plans/
```

This corresponds to `.workspace/.magic/video-production-plans/` in the runtime workspace.

At the start of a video task:

1. Search plan filenames and contents for the task topic, mentioned Element IDs, or media filenames.
2. Read and continue the relevant plan. Ask the user to choose when several plans match.
3. Create a task-specific Markdown plan when no plan matches.
4. Collect exact Element IDs from the user, the plan, and previous tool results.
5. Query known Elements in batches of 1 to 10 IDs.
6. Resume from current Canvas results and the earliest incomplete confirmation gate, treating confirmed decisions as completed.

Plans use ordinary Markdown with task-fitting headings and human-readable progress. For example:

```markdown
# City Travel Short Film

## Current Goal

Create a 30-second, 16:9 city travel short film.

## Confirmed Direction

- Lively documentary style
- Narration choice: none

## Relevant Assets

- Element: image_01
- File: city-reference.png

## Current Progress

- Story outline confirmed
- Opening first frame awaiting confirmation

## Next Step

Confirm the opening first frame before generating the remaining frames.
```

Update the same plan after meaningful progress, confirmation, failure, revision, or a changed next step.

## Default Production Workflow

Use the following 17 steps as the default workflow. Run only the steps needed for the user's current goal and state.

### 1. Receive Source Assets

Collect the images, videos, audio, text, and existing Canvas Elements supplied by the user. Typical images include scenes, people, products, costumes, locations, and visual references.

Create or reuse a task-specific Canvas project early in the task. Use a direct workspace-relative project path such as `city-travel-short-film`, then import supplied media with `import_canvas_assets` so the returned Element IDs, Content IDs, and media paths become the stable inputs for later stages.

When the user has not supplied assets and useful production depends on them, ask whether the user wants to upload references or proceed from a text-only direction.

### 2. Understand the Assets

Use `visual_understanding` to identify relevant subjects, products, scenes, text, visual style, colors, composition, distinguishing features, and factual constraints.

Summarize what is usable for production, the likely role of each relevant asset, and how many asset Elements are currently available in the Canvas. Separate direct observations from uncertain inferences, and identify only high-impact information that still needs confirmation.

### 3. Confirm the Production Direction

Recommend a production direction based on the user's goal and materials. Infer reasonable defaults before asking, and use `ask_user` only for unresolved decisions that materially affect the result.

Resolve no more than one to three focused decisions in the same confirmation round. Depending on the task, these may cover story approach, subject emphasis, visual style, target audience, duration, aspect ratio, or narration. Do not ask about a person, product, or other scenario-specific concept unless it is relevant.

After the user responds, briefly restate the confirmed direction and any adopted production defaults. Resolve defaults in this order: explicit user requirements, confirmed plan or Canvas settings, delivery scenario and source-material characteristics, then supported model defaults. Preview only the next three to six stages needed for the current task.

### 4. Draft the Story Direction as Text

Prepare a concise story or content direction. Choose only the sections relevant to the task, such as:

- story background
- core objective
- core subject
- character, product, costume, object, or location settings
- main story line
- visual tone
- opening, development, and ending
- scenario-specific priorities such as product benefits or factual messages

This is a discussion stage only. Present the complete direction with a concise title and scannable Markdown headings. Do not draft the shot list, call `upsert_storyboard`, or generate production media at this stage.

### 5. Display and Confirm the Story Direction

After displaying the Markdown direction, use `ask_user` to ask one concise confirmation question, such as whether the user confirms the story direction. Do not repeat the direction inside the question.

Continue after the user confirms the direction or provides revisions.

### 6. Generate Initialization Images

Generate only the visual anchors required by the confirmed story direction, such as a character look, product hero, location, prop, costume, creature, vehicle, environment, or visual-style reference. Create a character look only when a person is required or human continuity matters. Make the required subject and its stable visual features clearly visible, and regenerate an anchor when it does not represent that subject.

Use `generate_video_production_images` with the relevant source images and the confirmed creative direction.

Treat source images as optional generation evidence, not mandatory inputs for every later stage. After an initialization image is confirmed, prefer that confirmed image for visual continuity and reuse the original uploads only when they still add necessary product, scene, identity, or style information.

After each successful initialization-image generation, record its returned Element ID, Content ID, and media path in the task plan. Apply the common generated-media versioning rules when the user requests a revision or an alternative.

### 7. Confirm Initialization Images

Present the generated initialization images and ask whether they are accurate and satisfactory. Generate only the affected anchors when revisions are requested.

If the user confirms a candidate Content that is not already the main Content, promote that exact Content before using the initialization image in later stages.

### 8. Draft the Base Storyboard as Text

Translate the confirmed story direction and visual anchors into a base storyboard. Start with approximately four shots when the user has not specified a count, use fewer shots for simple tasks, and allow the user to add, remove, reorder, or revise shots. Each shot description should clearly express:

- shot name
- scene
- framing or camera approach
- action
- focus
- duration

Present the complete base storyboard as Markdown in the assistant message. At this stage, keep it as a text discussion and do not call `upsert_storyboard`. Keep unconfirmed generation prompts out of the storyboard text.

### 9. Display and Confirm the Base Storyboard

After displaying the Markdown storyboard, use `ask_user` to collect a concise confirmation or revision.

Wait for the user's confirmation or revisions before writing the Storyboard Element.

### 10. Save the Confirmed Storyboard

After the base storyboard is confirmed, call `upsert_storyboard` to create or update the Storyboard Element. Use the confirmed shot descriptions, without unconfirmed generation prompts. Pass the confirmed initialization Image Element IDs as `visual_anchor_element_ids`; the tool keeps their Canvas relationship internal. Select the current user image model by default, then choose an aspect ratio and resolution that fit the confirmed delivery requirements.

Carry the returned Storyboard Element ID and Content ID into later storyboard updates.

### 11. Confirm and Generate the Opening First Frame

Draft the opening shot's first-frame prompt from the confirmed story, storyboard, source materials, and initialization images.

Use `ask_user` to confirm the prompt. After confirmation:

1. Update the opening shot's `description` with the confirmed first-frame prompt.
2. Generate the opening first-frame image with its `shot_id` using the Storyboard's current image model, aspect ratio, and resolution. The tool binds the generated Image Element to that shot internally.
3. Ask the user to confirm the generated first frame.

Use the confirmed opening first frame as the initial visual anchor for later shots.

### 12. Confirm the Remaining First-Frame Prompts

After the opening first frame is confirmed, draft prompts for the remaining shots using the confirmed story, initialization images, storyboard, and opening frame.

Present the prompts together when practical and use `ask_user` to collect revisions or confirmation.

### 13. Generate and Confirm the Remaining First Frames

Update the storyboard descriptions with the confirmed prompts, then generate the remaining first-frame images.

Generate one independent image task for every confirmed shot that needs a first frame. Do not reuse an initialization image as `output_image_element_id`; initialization images are references for continuity, not shot outputs. After generation, read `result.content`, verify that the successful count and returned shot bindings cover every requested shot, and query the current Canvas when the count is unclear. If any shot is missing or the tool reports failure, stop the workflow, explain the exact missing shot, and do not claim that all first frames are ready. Ask whether the affected shot should be retried or revised. The generation tool binds each successful Image Element to its `shot_id`.

Preserve successful frames and regenerate only the affected shots.

### 14. Generate the First Trial Video

Generate only the first shot video from its confirmed prompt, first frame, and relevant initialization images.

Ask the user to confirm the motion, subject consistency, camera behavior, pacing, and overall visual direction before generating the remaining videos.

### 15. Generate the Remaining Shot Videos

After the first trial video is confirmed, generate the remaining shot videos in batches supported by the tool.

Present the results and ask whether the user wants revisions or wants to proceed to a complete video.

### 16. Add Optional Audio

When the user provides an audio file, use `import_canvas_assets` and carry the returned Audio Element ID into the final edit.

Confirm whether the user wants the available audio included. The initial composition capability accepts zero or one final audio track.

### 17. Create and Deliver the Final Video

After the user chooses to create the complete video:

1. Use `configure_video_edit` to set the ordered shot videos, optional audio, and output specification.
2. Use `compose_canvas_video` to create the final MP4.
3. Present the returned MP4 path, duration, dimensions, and audio status.
4. Continue from the existing results when the user requests a revision, another aspect ratio, a platform-specific version, or a different creative emphasis.

## General Capabilities

### `visual_understanding`

Use it before creative planning when uploaded or generated images need visual analysis, or after generation when a critical result needs verification. Prefer analyzing all closely related images together so products, people, locations, style, and consistency can be compared in one pass. Prioritize direct visual observations and separate uncertain inferences.

### `ask_user`

Use it for creative direction choices, story and storyboard approval, prompt approval, generated-result confirmation, the first trial video, and the decision to create the final video. Prefer `confirm` for a clear yes-or-revise gate, `select` for mutually exclusive directions, and `multi_select` only for independent choices. Show long-form content as Markdown in the assistant message first, then ask one concise question without repeating the content or adding unnecessary Markdown.

## Canvas Setup and Lookup

### `create_canvas`

Use it when the task does not already have a suitable Canvas project. Prefer reusing the current task project, and keep its exact workspace-relative path for later video-production tools.

### `import_canvas_assets`

Use it after selecting the Canvas project when user-supplied images, videos, or audio need stable Canvas identities and persistent media paths. Prefer importing related assets together before generating dependent content, and retain the returned Element IDs, Content IDs, and media paths.

Each asset must use `path` for its workspace-relative file path and `name` for its user-facing Canvas name. Pass uploaded workspace paths directly to this tool so it can persist the media in the Canvas project.

```python
from sdk.tool import tool

result = tool.call("import_canvas_assets", {
    "project_path": "city-travel-short-film",
    "assets": [
        {
            "name": "Waterproof Jacket Reference",
            "path": ".tmp/traveler-jacket.webp"
        },
        {
            "name": "Rainforest Trail Reference",
            "path": ".tmp/rainforest-trail.webp"
        }
    ]
})
print(result.content)
```

### `query_canvas_elements`

Use it when exact Element IDs are already known and later work needs their current state. Prefer querying related IDs together, up to the supported batch limit, and use missing IDs for recovery or user clarification rather than speculative broad searches.

```python
from sdk.tool import tool

result = tool.call("query_canvas_elements", {
    "project_path": "city-travel-short-film",
    "element_ids": [
        "storyboard_01",
        "image_01",
        "shot_video_01"
    ]
})
print(result.content)
```

### `promote_canvas_content`

Use it only after the user explicitly confirms a generated candidate Content. Prefer promoting the exact confirmed Content and carry its Element ID and Content ID into later production stages.

Set `confirmed_by_user` to `True` only after receiving the user's explicit confirmation. Preserve a concise confirmation summary in the user's language in `confirmation_text`.

```python
from sdk.tool import tool

result = tool.call("promote_canvas_content", {
    "project_path": "city-travel-short-film",
    "element_id": "image_01",
    "content_id": "image_01_content_02",
    "confirmed_by_user": True,
    "confirmation_text": "The user confirmed this first frame."
})
print(result.content)
```

## Video Production Tools

### `upsert_storyboard`

Store the confirmed shot structure and prompts in `description`. Use `visual_anchor_element_ids` for confirmed initialization images that the storyboard should follow; omit it on later updates to preserve the current anchors. Use `generation_config` for the image model, aspect ratio, and resolution shared by storyboard first-frame generation, defaulting to the current user image model and supported output values.

Updates merge the supplied shots into the existing Storyboard by shot ID, so a prompt-only update does not remove omitted shots or their confirmed outputs. Set `replace_all_shots` to `True` only when the user has confirmed a complete replacement, removal, or reordering of the shot list.

Create the confirmed base storyboard without unconfirmed prompts:

```python
from sdk.tool import tool

result = tool.call("upsert_storyboard", {
    "project_path": "city-travel-short-film",
    "name": "City Travel Storyboard",
    "visual_anchor_element_ids": [
        "traveler_character_01",
        "city_style_reference_01"
    ],
    "shots": [
        {
            "id": "S01",
            "duration_seconds": 4.0,
            "description": "Shot name: Sunrise arrival\nScene: City overlook at sunrise\nCamera: Wide shot with a slow forward move\nAction: The traveler looks toward the skyline\nFocus: Establish the location and energetic travel tone"
        },
        {
            "id": "S02",
            "duration_seconds": 4.0,
            "description": "Shot name: Market walk\nScene: Lively market street\nCamera: Medium tracking shot\nAction: The traveler walks through the crowd\nFocus: Local atmosphere and natural movement"
        }
    ],
    "generation_config": {
        "image_model_id": "gpt-image-2",
        "aspect_ratio": "16:9",
        "resolution": "1K"
    }
})
print(result.content)
```

When an existing confirmed Image Element needs to be assigned to a shot without generating it through the storyboard image tool, update the same storyboard Content explicitly. Do not use an Element already listed in `visual_anchor_element_ids` as `output_image_element_id`; generate a separate first-frame Image Element for that shot instead:

```python
result = tool.call("upsert_storyboard", {
    "project_path": "city-travel-short-film",
    "name": "City Travel Storyboard",
    "element_id": "storyboard_01",
    "content_id": "storyboard_01_content_01",
    "shots": [
        {
            "id": "S01",
            "duration_seconds": 4.0,
            "description": "Shot name: Sunrise arrival\nScene: City overlook at sunrise\nCamera: Wide shot with a slow forward move\nAction: The traveler looks toward the skyline\nFocus: Establish the location and energetic travel tone\nFirst-frame prompt: Wide sunrise view of the traveler overlooking the city, warm natural light, lively documentary style, 16:9 composition",
            "output_image_element_id": "image_01"
        },
        {
            "id": "S02",
            "duration_seconds": 4.0,
            "description": "Shot name: Market walk\nScene: Lively market street\nCamera: Medium tracking shot\nAction: The traveler walks through the crowd\nFocus: Local atmosphere and natural movement"
        }
    ]
})
print(result.content)
```

### `generate_video_production_images`

Each task generates one initialization image or first frame and requires a specific name and complete prompt. For storyboard frames, pass `storyboard_element_id` and the corresponding `shot_id` so the latest Storyboard image settings are applied and the result is bound to the correct shot internally.

Translate the confirmed anchor requirements into explicit subject, identity, appearance, interaction, composition, and exclusion details in the prompt.

Reference images may contain watermarks, captions, interface marks, compression artifacts, accidental crops, unwanted backgrounds, or other defects. Unless the user explicitly wants them, state that these artifacts must not be copied into the generated result. Preserve only the intended subject, identity, product details, scene cues, and visual style.

Use the `media_path` returned by `import_canvas_assets` or by an earlier generation tool in `reference_images`. Keep the returned path unchanged so later tools can resolve the same Canvas asset.

For an initialization anchor before a Storyboard exists, omit `storyboard_element_id` and put the concrete output size on the task. The following is only a character-anchor example; use a product, location, prop, or style prompt when that is what the confirmed story requires:

```python
from sdk.tool import tool

result = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "tasks": [
        {
            "name": "Traveler Character Look",
            "size": "1440x2560",
            "prompt": "A clearly visible 25-year-old female hiker wearing the referenced orange waterproof jacket on a rainy forest trail. Show her head, face, torso, arms, and natural standing pose; keep the same hair, facial features, body proportions, and clothing details for later shots. Product and character must both be visible. Preserve the intended jacket and forest cues, but do not copy watermarks, captions, interface marks, compression artifacts, accidental crops, or unwanted background defects from the references. Do not create a product-only image, flat-lay, mannequin, empty scene, or cropped-out person.",
            "reference_images": [
                "./images/jacket-reference.png",
                "./images/forest-reference.png"
            ]
        }
    ]
})
print(result.content)
```

When the user requests a revision to the same generated image, reuse the Element ID returned by the first generation and replace its main Content:

```python
from sdk.tool import tool

result = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "tasks": [
        {
            "name": "Traveler Character Look",
            "element_id": "image_element_01",
            "set_as_main": True,
            "size": "1440x2560",
            "prompt": "Revise the same traveler anchor as a cheerful young Asian woman with a clearly visible face and natural smile. Preserve the referenced orange waterproof jacket, rainy forest location, full-body composition, clothing details, and realistic outdoor style. Do not reproduce watermarks, captions, interface marks, or other defects from any reference image.",
            "reference_images": [
                "./images/jacket-reference.png",
                "./images/forest-reference.png"
            ]
        }
    ]
})
print(result.content)
```

For a Storyboard first frame:

```python
from sdk.tool import tool

result = tool.call("generate_video_production_images", {
    "project_path": "city-travel-short-film",
    "storyboard_element_id": "storyboard_01",
    "tasks": [
        {
            "name": "Opening Skyline First Frame",
            "shot_id": "S01",
            "prompt": "Wide sunrise view of a traveler overlooking a modern city skyline, warm natural light, lively documentary style, realistic clothing and environment, 16:9 composition. Preserve the intended subject and style references without copying watermarks, text, interface marks, or accidental artifacts.",
            "reference_images": [
                "./images/traveler-reference.png",
                "./images/city-reference.png"
            ]
        }
    ]
})
print(result.content)
```

Apply the common generated-media versioning rules to initialization images, storyboard first frames, and any other generated images. The tool rejects missing Content IDs and validates ownership when both IDs are supplied.

### `generate_video_production_videos`

Each task defines one shot-video generation request. Use a single task for the trial video and batch only the remaining confirmed shots.

Use the `media_path` returned by `import_canvas_assets` or by an earlier generation tool in the matching reference or frame fields. Keep the returned paths unchanged and bind them to prompt tokens in array order.

```python
from sdk.tool import tool

result = tool.call("generate_video_production_videos", {
    "project_path": "city-travel-short-film",
    "model_id": "video-model-id",
    "tasks": [
        {
            "name": "City Skyline Opening Shot",
            "prompt": "Using the confirmed first frame [image1], move the camera slowly toward the city skyline while the traveler remains natural and steady, warm sunrise light, lively documentary style.",
            "aspect_ratio": "16:9",
            "input_mode": "first_frame",
            "task": "generate",
            "reference_image_paths": [
                "images/opening-skyline-first-frame.png"
            ],
            "reference_video_paths": [],
            "reference_audio_paths": [],
            "frame_start_path": "images/opening-skyline-first-frame.png",
            "frame_end_path": "",
            "duration_seconds": 4,
            "resolution": "1080p",
            "fps": 24,
            "seed": 42,
            "watermark": False,
            "extensions": {}
        }
    ]
})
print(result.content)
```

When the user requests a revision to the same generated video, reuse the returned Element ID and replace its main Content:

```python
from sdk.tool import tool

result = tool.call("generate_video_production_videos", {
    "project_path": "city-travel-short-film",
    "model_id": "video-model-id",
    "tasks": [
        {
            "name": "City Skyline Opening Shot",
            "element_id": "video_element_01",
            "set_as_main": True,
            "prompt": "Using the confirmed first frame [image1], revise the same shot with a slower camera move and steadier subject motion while preserving the traveler, skyline, warm sunrise light, and documentary style.",
            "aspect_ratio": "16:9",
            "input_mode": "first_frame",
            "task": "generate",
            "reference_image_paths": [
                "images/opening-skyline-first-frame.png"
            ],
            "reference_video_paths": [],
            "reference_audio_paths": [],
            "frame_start_path": "images/opening-skyline-first-frame.png",
            "frame_end_path": "",
            "duration_seconds": 4,
            "resolution": "1080p",
            "fps": 24,
            "seed": 43,
            "watermark": False,
            "extensions": {}
        }
    ]
})
print(result.content)
```

Select `model_id`, `input_mode`, `task`, duration, resolution, FPS, and extension values from the current media model information. Use `[image1]`, `[video1]`, and `[audio1]` tokens in prompt order when reference paths are provided.

Apply the common generated-media versioning rules to trial videos, remaining shot videos, and later revisions.

### `configure_video_edit`

The video array defines playback order; the audio array is empty or contains one Audio Element ID.

```python
from sdk.tool import tool

result = tool.call("configure_video_edit", {
    "project_path": "city-travel-short-film",
    "name": "City Travel Final Edit",
    "video_sequence": [
        "shot_video_01",
        "shot_video_02",
        "shot_video_03",
        "shot_video_04"
    ],
    "audio_sequence": ["audio_narration_01"],
    "output": {
        "aspect_ratio": "16:9",
        "resolution": "1080P",
        "format": "mp4"
    }
})
print(result.content)
```

Reuse `element_id` and `content_id` when updating an existing edit.

### `compose_canvas_video`

Provide the confirmed Video Edit Element ID and final result name.

```python
from sdk.tool import tool

result = tool.call("compose_canvas_video", {
    "project_path": "city-travel-short-film",
    "video_edit_element_id": "video_edit_01",
    "result_name": "City Travel Final Video"
})
print(result.content)
```

## Revision and Recovery

- Preserve confirmed results and successful media.
- Generate only the shots or assets affected by the requested revision.
- Update storyboard descriptions and output Image Element IDs after prompt or first-frame changes.
- Rebuild the next `video_sequence` from the currently confirmed shot Video Element IDs.
- Recalculate expected duration after shot changes.
