# Initial Canvas Video Generation

## Video Request Guidance

Use the single video tool `generate_canvas_videos` (exact spelling, plural `videos`) for canvas video requests. Do not substitute `generate_canvas_video`, `generate_videos_to_canvas`, or any other tool, and do not create a canvas or run code just to handle a video request. When a pre-generation estimate is useful, call `generate_canvas_videos` with `action="estimate_points"`; after a suitable confirmation, call the same tool with `action="generate"` for that request.

- Turn a vague video request into a clear, executable prompt. When important details or choices are missing, reuse the existing `ask_user` as appropriate.
- For copyright or IP, real-person, sexual, political, violent, or similar risk, explain the concern and offer at least two choices/options. The choices should, when relevant, include (1) keeping the user's original request and attempting it as written, and (2) a risk-reduced adjustment; add other reasonable directions when useful. Do not force the user to accept a rewrite. Reuse the existing `ask_user` or another suitable interaction when useful; use your judgment about when to ask and how to proceed.
- When the request calls for a pre-generation review, use `generate_canvas_videos` with `action="estimate_points"`, present the final prompt, main generation parameters, and estimated points, and seek the user's confirmation. If estimation fails, explain it and let the user choose whether to continue or revise.
- When the user has confirmed a direction, use `action="generate"` for that request when appropriate. If generation fails, briefly explain the reason and a useful modification, offer choices such as continuing to revise or ending, note that failure does not deduct points, and avoid automatic retries.

## Timeout

Video tool calls automatically use long timeouts. Do not reason about or pass timeout values manually.

## Required Parameters
- `project_path`: design project path
- `tasks`: task list, each task needs `name` and `prompt`; max 4 per call

## Model Context

When `<media_model_info>` contains a `<video ...>` entry:
- pass its `model` value as `model_id`
- `duration_seconds`, `resolution`, and `aspect_ratio` are optional
- when the user specifies duration, resolution, or aspect ratio, use declared values only
- when the user does not specify them, you may reasonably infer legal values from the user's intent and the current model rules; if uncertain, omit them and let the model defaults apply
- use `<mode>` / `<rule>` nodes to choose reference fields and avoid unsupported combinations
- when using a `<mode>`, pass its `name` as `input_mode` and its `task` as `task`; for example `name="video_edit"` means `input_mode="video_edit"`, not `inputMode` or `video_editing`
- canvas layout dimensions are derived internally; do not invent generation parameters only for layout

## Reference Tokens

When using reference assets, bind them inside `prompt` by list order:
- `reference_image_paths[0]` -> `[image1]`, `reference_image_paths[1]` -> `[image2]`
- `reference_video_paths[0]` -> `[video1]`, `reference_video_paths[1]` -> `[video2]`
- `reference_audio_paths[0]` -> `[audio1]`, `reference_audio_paths[1]` -> `[audio2]`

Use these tokens next to the subject, action, or source media they control. Do not put file paths in `prompt`; file paths still belong in the reference path arrays.

## Priority Parameters
- the generation goal itself
- user-requested resolution/aspect-ratio intent
- user-requested duration intent
- reference inputs such as reference images or start/end frames

## Non-Priority Parameters
- leave them empty by default when the user did not explicitly ask for them
- infer optional generation parameters only when the current model rules make a legal choice clear for the user's request

## Recommended Prompt Content
- subject
- action
- camera language
- lighting, style, pacing

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
