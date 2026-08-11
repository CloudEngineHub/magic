---
name: video-production
description: Use when the user wants to create, continue, revise, or complete a video-production task from uploaded assets, existing Canvas materials, storyboards, generated images, shot videos, audio, or a final video. Provides an adaptive, confirmation-driven workflow for asset understanding, creative direction, scripts, visual anchors, storyboards, first frames, shot videos, optional audio, task recovery, and final MP4 delivery.
---

# Video Production

## Core Usage

- Treat the production flow below as the default path for a complete new video task.
- Adapt the path to the user's current request, available assets, existing Canvas results, and confirmed decisions.
- Continue from the earliest incomplete stage when resuming a task.
- Treat information and decisions already supplied by the user as completed inputs.
- Use `ask_user` for creative choices and result confirmations that materially affect later production.
- Call video-production Canvas tools through Code Mode with `sdk.tool.call(...)`.
- Read tool results only from `result.content`. Extract the IDs, paths, counts, and statuses needed for later calls from that model-facing content.
- Carry returned Element IDs, Content IDs, and media paths into later tool calls.
- Use file operations to search, read, create, and update video-production plans.

## User Language

- Write human-readable parameter values, analysis requests, creative content, plans, prompts, asset names, and confirmation summaries in the user's language.
- Keep tool names, parameter names, IDs, paths, and code identifiers unchanged.
- The English values in this Skill are examples. Replace them with values in the user's language during real tasks.

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
6. Resume from current Canvas results and the earliest incomplete confirmation gate.

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

Use the following 16 steps as the default workflow. Run only the steps needed for the user's current goal and state.

### 1. Receive Source Assets

Collect the images, videos, audio, text, and existing Canvas Elements supplied by the user. Typical images include scenes, people, products, costumes, locations, and visual references.

When the user has not supplied assets and useful production depends on them, ask whether the user wants to upload references or proceed from a text-only direction.

### 2. Understand the Assets

Use `visual_understanding` to identify relevant subjects, products, scenes, text, visual style, colors, composition, distinguishing features, and factual constraints.

Summarize what is usable for production and identify information that needs confirmation.

### 3. Confirm the Production Direction

Recommend one or more production directions based on the user's goal and materials. Use `ask_user` to let the user confirm or revise the direction before detailed planning.

Include only choices that materially affect the result, such as story approach, product emphasis, visual style, target audience, duration, aspect ratio, or narration.

### 4. Draft the Story, Script, and Initial Shots

Prepare a concise production outline that may include:

- story background
- core objective
- character, product, costume, or location settings
- main story line
- visual tone
- opening, development, and ending
- scenario-specific priorities such as product benefits or factual messages
- an initial shot outline

Start with approximately four shots when the user has not specified a count. Use fewer shots for simple tasks and allow the user to add, remove, reorder, or revise shots.

### 5. Confirm the Story and Initial Shots

Present the production outline and initial shots through `ask_user`. Continue after the user confirms the direction or provides revisions.

Record the confirmed decisions and next step in the task plan.

### 6. Generate Initialization Images

Generate one or more visual anchors when they improve consistency. Choose specific asset names based on the scenario, such as a character look, product hero image, location reference, costume reference, key prop, or visual-style anchor.

Use `generate_video_production_images` with the relevant source images and the confirmed creative direction.

### 7. Confirm Initialization Images

Present the generated initialization images and ask whether they are accurate and satisfactory. Generate only the affected anchors when revisions are requested.

Promote a selected Content after the user explicitly confirms it.

### 8. Draft the Base Storyboard

Expand the confirmed initial shots into a base storyboard. Each shot description should clearly express:

- shot name
- scene
- framing or camera approach
- action
- focus
- duration

Use `description` to store this structured text. At this stage, keep unconfirmed generation prompts out of the description.

### 9. Confirm and Save the Base Storyboard

Present the base storyboard through `ask_user`. After confirmation, call `upsert_storyboard` to create or update the Storyboard Element. Select the current user image model by default, then choose an aspect ratio and resolution that fit the confirmed delivery requirements.

Carry the returned Storyboard Element ID and Content ID into later storyboard updates.

### 10. Confirm and Generate the Opening First Frame

Draft the opening shot's first-frame prompt from the confirmed story, storyboard, source materials, and initialization images.

Use `ask_user` to confirm the prompt. After confirmation:

1. Update the opening shot's `description` with the confirmed first-frame prompt.
2. Generate the opening first-frame image using the Storyboard's current image model, aspect ratio, and resolution.
3. Update the storyboard with the returned first-frame Image Element ID.
4. Ask the user to confirm the generated first frame.

Use the confirmed opening first frame as the initial visual anchor for later shots.

### 11. Confirm the Remaining First-Frame Prompts

After the opening first frame is confirmed, draft prompts for the remaining shots using the confirmed story, initialization images, storyboard, and opening frame.

Present the prompts together when practical and use `ask_user` to collect revisions or confirmation.

### 12. Generate and Confirm the Remaining First Frames

Update the storyboard descriptions with the confirmed prompts, then generate the remaining first-frame images.

After generation, update the storyboard with the returned Image Element IDs and ask whether any shot needs adjustment.

Preserve successful frames and regenerate only the affected shots.

### 13. Generate the First Trial Video

Generate only the first shot video from its confirmed prompt, first frame, and relevant initialization images.

Ask the user to confirm the motion, subject consistency, camera behavior, pacing, and overall visual direction before generating the remaining videos.

### 14. Generate the Remaining Shot Videos

After the first trial video is confirmed, generate the remaining shot videos in batches supported by the tool.

Present the results and ask whether the user wants revisions or wants to proceed to a complete video.

### 15. Add Optional Audio

When the user provides a project audio file, use `upsert_canvas_audio` to register it. Audio may be prepared earlier, but it becomes part of the output only when included in the final edit.

Confirm whether the user wants the available audio included. The initial composition capability accepts zero or one final audio track.

### 16. Create and Deliver the Final Video

After the user chooses to create the complete video:

1. Use `configure_video_edit` to set the ordered shot videos, optional audio, and output specification.
2. Use `compose_canvas_video` to create the final MP4.
3. Present the returned MP4 path, duration, dimensions, and audio status.
4. Continue from the existing results when the user requests a revision, another aspect ratio, a platform-specific version, or a different creative emphasis.

## Tool Guide

### `visual_understanding`

Use this direct tool to analyze uploaded or project images before creative planning. Provide all relevant image paths and a detailed analysis request with enough task context.

Example payload:

```json
{
  "images": [
    "./uploads/jacket-front.png",
    "./uploads/hiking-scene.png"
  ],
  "query": "Describe the product appearance, visible materials, outdoor scene, colors, text, distinguishing features, and visual details that can support a 15-second hiking product video. Separate direct observations from uncertain inferences."
}
```

Use the returned observations to prepare the production direction and prompts.

### `ask_user`

Use this direct tool for direction choices, storyboard approval, prompt approval, generated-result confirmation, and the decision to create the final video. Prefer `confirm`, `select`, or `multi_select` when useful choices can be presented.

Example payload:

```json
{
  "questions": "<question type=\"select\">Which production direction should we use?<option>Outdoor journey - focus on terrain, weather, and product performance</option><option>Product showcase - focus on materials, details, and key benefits</option><option>Character story - focus on a traveler completing a clear outdoor objective</option></question>"
}
```

Treat an explicit answer as the completed confirmation gate and continue from the selected direction.

### File Operations

Use file operations to search, read, create, and update the task plan under `.magic/video-production-plans/`. The plan records confirmed decisions, relevant assets, current progress, failures, and the next step. Canvas results and the tool's `result.content` remain the current production state.

### `create_canvas`

Use this Code Mode tool when the task needs a new Canvas project. Reuse an existing suitable project when one is already available.

```python
from sdk.tool import tool

result = tool.call("create_canvas", {
    "project_path": "projects/city-travel-short-film",
})
print(result.content)
```

Use the exact workspace-relative project path in every later Canvas tool call.

### `query_canvas_elements`

Use this Code Mode tool to read current information for known Element IDs. Supply between 1 and 10 exact IDs per call.

```python
from sdk.tool import tool

result = tool.call("query_canvas_elements", {
    "project_path": "projects/city-travel-short-film",
    "element_ids": ["image_01", "storyboard_01", "shot_video_01"],
})
print(result.content)
```

Read matched Elements and missing Element IDs from `result.content`. Use missing IDs for recovery or user clarification.

### `upsert_storyboard`

Use this Code Mode tool after the user confirms the base storyboard. Store shot structure and confirmed prompts in `description` until dedicated prompt fields are available. Its `generation_config` records the image model, aspect ratio, and resolution shared by storyboard first-frame generation. Use the current user image model by default and choose supported ratio and resolution values from the current image model information.

Create the confirmed base storyboard without unconfirmed prompts:

```python
from sdk.tool import tool

result = tool.call("upsert_storyboard", {
    "project_path": "projects/city-travel-short-film",
    "name": "City Travel Storyboard",
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

After the first-frame prompt and generated image are confirmed, update the same storyboard Content:

```python
result = tool.call("upsert_storyboard", {
    "project_path": "projects/city-travel-short-film",
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

Use the returned Storyboard Element ID, Content ID, and shot count for later updates.

### `generate_video_production_images`

Use this Code Mode tool to generate initialization images, the opening first frame, or the remaining first frames. Each task produces one image; provide specific names and complete prompts. For storyboard frames, pass `storyboard_element_id` and let the tool read the Storyboard's latest image model, aspect ratio, and resolution. This ensures that later generation follows changes the user made in the Canvas.

Pass uploaded files, project files, or media paths returned by earlier tools directly in `reference_images`. Use a project-relative path such as `assets/product.webp` for a file inside the current project, or a workspace-relative path such as `.tmp/uploaded-product.webp` for an uploaded file outside the project. Do not call another Canvas tool only to prepare a reference file.

```python
from sdk.tool import tool

result = tool.call("generate_video_production_images", {
    "project_path": "projects/city-travel-short-film",
    "storyboard_element_id": "storyboard_01",
    "tasks": [
        {
            "name": "Opening Skyline First Frame",
            "prompt": "Wide sunrise view of a traveler overlooking a modern city skyline, warm natural light, lively documentary style, realistic clothing and environment, 16:9 composition.",
            "reference_images": [
                "assets/traveler-look.png",
                ".tmp/city-reference.png"
            ]
        }
    ]
})
print(result.content)
```

Use the returned success and failure counts, Element IDs, Content IDs, media paths, and applied generation configuration. Reuse `element_id` and optionally `content_id` when retrying or continuing an existing result.

For initialization images created before a Storyboard exists, omit `storyboard_element_id` and provide the exact supported `WxH` size from the current image model, such as `1440x2560`. Do not use combined display labels such as `9:16[2K]` as `size`.

Normally omit `set_as_main`. Pass `set_as_main=True` only when the user has explicitly confirmed that the generated Content should become the main Content.

### `promote_canvas_content`

Use this Code Mode tool after the user explicitly confirms a generated candidate Content.

```python
from sdk.tool import tool

result = tool.call("promote_canvas_content", {
    "project_path": "projects/city-travel-short-film",
    "element_id": "image_01",
    "content_id": "image_01_content_02",
    "confirmed_by_user": True,
    "confirmation_text": "The opening first frame is confirmed."
})
print(result.content)
```

Use the returned Element ID and Content ID as the confirmed selection for later production.

### `generate_video_production_videos`

Use this Code Mode tool to generate the first trial video or the remaining shot videos. Call it with one task for the first trial, then use later calls for confirmed remaining shots.

Pass project files, uploaded files, and media paths returned by earlier tools directly in the matching reference or frame fields. Use project-relative paths such as `images/opening-first-frame.png`, or workspace-relative paths such as `.tmp/uploaded-motion-reference.mp4`. Do not call another Canvas tool only to prepare a reference file.

```python
from sdk.tool import tool

result = tool.call("generate_video_production_videos", {
    "project_path": "projects/city-travel-short-film",
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

Select `model_id`, `input_mode`, `task`, duration, resolution, FPS, and extension values from the current media model information. Use `[image1]`, `[video1]`, and `[audio1]` tokens in prompt order when reference paths are provided.

Use the returned submission counts, Element IDs, Content IDs, media paths, and processing statuses. Normally omit `set_as_main`; pass it as `True` only for a result already confirmed by the user.

### `upsert_canvas_audio`

Use this Code Mode tool when the user provides an audio file that already exists in the project.

```python
from sdk.tool import tool

result = tool.call("upsert_canvas_audio", {
    "project_path": "projects/city-travel-short-film",
    "name": "Travel Narration",
    "src": "./audio/narration.mp3"
})
print(result.content)
```

Use the returned Audio Element ID and Content ID when configuring the final edit.

### `configure_video_edit`

Use this Code Mode tool after the shot videos and optional audio are ready. The video array defines playback order; the audio array is empty or contains one Audio Element ID.

```python
from sdk.tool import tool

result = tool.call("configure_video_edit", {
    "project_path": "projects/city-travel-short-film",
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

Use the returned Video Edit Element ID and Content ID for final composition. Reuse `element_id` and `content_id` when updating an existing edit.

### `compose_canvas_video`

Use this Code Mode tool after the user chooses to generate the complete video and the Video Edit is ready.

```python
from sdk.tool import tool

result = tool.call("compose_canvas_video", {
    "project_path": "projects/city-travel-short-film",
    "video_edit_element_id": "video_edit_01",
    "result_name": "City Travel Final Video"
})
print(result.content)
```

Use the returned final Video Element ID, Content ID, MP4 path, dimensions, duration, and audio status when reporting delivery or continuing revisions.

## Confirmation and Adaptation

- Use the default workflow for a complete new task and select only relevant stages for focused requests.
- Skip asset analysis when the user supplies a confirmed analysis or no visual assets are involved.
- Skip repeated questions when the user has already provided or confirmed the answer.
- Resume from existing Storyboard, Image, Video, Audio, or Video Edit Elements when their IDs are known.
- Use `ask_user` before committing a creative direction, approved prompt, selected generated result, first trial video, or final composition decision.
- Combine related choices into one clear question when that reduces interruption without hiding separate decisions.
- Record every completed gate and next step in the existing task plan.

## Revision and Recovery

- Preserve confirmed results and successful media.
- Generate only the shots or assets affected by the requested revision.
- Reuse returned Element IDs for retries and pass `content_id` when continuing a specific Content.
- Update storyboard descriptions and output Image Element IDs after prompt or first-frame changes.
- Rebuild the next `video_sequence` from the currently confirmed shot Video Element IDs.
- Recalculate expected duration after shot changes.
- Record failures, retry decisions, confirmed changes, and the next action in the existing plan.
