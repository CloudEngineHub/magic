# Initial Canvas Video Generation

## Video Request Guidance

Use only `generate_canvas_videos` for canvas video requests; do not substitute another video tool, create a canvas, or run code just for video generation.

- Clarify vague requests into executable prompts; ask the user when important choices are missing.
- **Confirmation is a hard gate for the first video generation attempt:** regardless of whether you first prepare a canvas, images, or other reference materials, once the video prompt is ready call `action="estimate_points"` and then show the final prompt, main parameters, and estimated points. End the current turn and wait for a new user message; never call `action="generate"` in that same turn. Call `action="generate"` only after a later user confirmation. The only exception is a first-turn request that explicitly says to generate immediately, generate directly, or skip confirmation.
- For IP, real-person, sexual, political, violent, or similar risks, explain the concern and offer at least two choices, including the original request and a risk-reduced alternative where relevant. Let the user decide.
- If estimation or generation fails, briefly explain the reason and suggested change, offer continuing or revising, do not retry automatically, and note that failure does not deduct points.

## Timeout

Video tool calls automatically use long timeouts. Do not reason about or pass timeout values manually.

## Model Context

When `<media_model_info>` contains a `<video ...>` entry:
- pass its `model` value as `model_id`
- `duration_seconds`, `resolution`, and `aspect_ratio` are optional
- when the user specifies duration, resolution, or aspect ratio, use declared values only
- when the user does not specify them, you may reasonably infer legal values from the user's intent and the current model rules; if uncertain, omit them and let the model defaults apply
- use `<mode>` / `<rule>` nodes to choose reference fields and avoid unsupported combinations
- when using a `<mode>`, pass its `name` as `input_mode` and its `task` as `task`; for example `name="video_edit"` means `input_mode="video_edit"`, not `inputMode` or `video_editing`
- canvas layout dimensions are derived internally; do not invent generation parameters only for layout

## Priority Parameters
- the generation goal itself
- user-requested resolution/aspect-ratio intent
- user-requested duration intent
- reference inputs such as reference images or start/end frames

## Non-Priority Parameters
- leave them empty by default when the user did not explicitly ask for them
- infer optional generation parameters only when the current model rules make a legal choice clear for the user's request

## Reference Tokens

When using reference assets, bind them inside `prompt` by list order:
- `reference_image_paths[0]` -> `[image1]`, `reference_image_paths[1]` -> `[image2]`
- `reference_video_paths[0]` -> `[video1]`, `reference_video_paths[1]` -> `[video2]`
- `reference_audio_paths[0]` -> `[audio1]`, `reference_audio_paths[1]` -> `[audio2]`

Use these tokens next to the subject, action, or source media they control. Do not put file paths in `prompt`; file paths still belong in the reference path arrays.

## Recommended Prompt Content
Treat the prompt as a concise creative brief, not a list of keywords. Use this order and include only details supported by the user's request:

```text
[video goal or type] + [subject and key traits] + [main action or change]
+ [scene/environment] + [composition/viewpoint] + [camera movement]
+ [lighting/style/mood] + [time/pace] + [sound/dialogue/constraints, optional]
```

The core should normally include **subject, action, scene, and camera**. Keep one clear scene and one main action unless the user explicitly asks for a sequence. Use concrete, observable, positive language; do not invent details or pad the prompt with keywords.

### Prompt Structure

- **Content:** video goal/type, subject and key traits, scene and environment.
- **Style:** composition, viewpoint, shot size, lighting, color, visual style, and mood.
- **Dynamics:** subject action, environmental motion, camera movement, timing, and pace.
- **Optional controls:** duration, aspect ratio, sound, dialogue, and continuity constraints.
- **Text-to-video:** describe the complete intended shot, including what is visible and how it moves.
- **Image-to-video:** use the reference for appearance, composition, and style; describe only the desired subject motion, environmental motion, camera movement, and changes over time. Preserve the reference subject and visual identity unless the user requests otherwise.
- **Reference materials:** place each reference token next to the subject, action, or visual element it controls; do not repeat details already clear in the reference.

### General Examples

- Product ad: `A matte white skincare bottle on a marble table, water droplets sliding down the bottle as the cap slowly opens, close-up push-in, soft side light, clean premium commercial style.`
- Human action: `A person in a yellow raincoat walks through a neon-lit city street at night, medium rear tracking shot, reflections on the wet pavement, realistic cinematic mood.`
- Animal/nature: `An orange cat calmly swims across a clear pond, low-angle medium shot following its movement, gentle ripples on the water, warm afternoon natural light, realistic documentary style.`

## Required Parameters
- `project_path`: design project path
- `tasks`: task list, each task needs `name` and `prompt`; max 4 per call

## Parameter Examples

The examples below illustrate estimation calls. You may show the result and seek confirmation before repeating a suitable call with `action="generate"`, according to the conversation.

### Standard Mode Example
```python
from sdk.tool import tool

result = tool.call('generate_canvas_videos', {
    "project_path": "my-design",
    "model_id": "model-from-media-model-info",
    "action": "estimate_points",
    "tasks": [{
        "name": "launch_video",
        "prompt": "A phone slowly rotates on a minimal stage, push-in camera, soft rim light, commercial ad look",
        "aspect_ratio": "16:9",
        "resolution": "720p",
        "duration_seconds": 5
    }]
})
print(result)
```

## Video Edit Mode Example
```python
from sdk.tool import tool

result = tool.call('generate_canvas_videos', {
    "project_path": "my-design",
    "model_id": "model-from-media-model-info",
    "action": "estimate_points",
    "tasks": [{
        "name": "edited_video",
        "prompt": "Turn the reference video [video1] into a watercolor animation while keeping the original motion",
        "aspect_ratio": "16:9",
        "resolution": "720p",
        "input_mode": "video_edit",
        "task": "edit",
        "reference_video_paths": ["videos/source.mp4"],
        "duration_seconds": 5
    }]
})
print(result)
```

## Add Priority Parameters Only When Needed
```python
from sdk.tool import tool

result = tool.call('generate_canvas_videos', {
    "project_path": "my-design",
    "model_id": "model-from-media-model-info",
    "action": "estimate_points",
    "tasks": [{
        "name": "launch_video",
        "prompt": "A phone [image1] slowly rotates on a minimal stage, push-in camera, soft rim light, commercial ad look",
        "aspect_ratio": "16:9",
        "resolution": "1080p",
        "duration_seconds": 5,
        "reference_image_paths": ["images/reference.png"]
    }]
})
print(result)
```
