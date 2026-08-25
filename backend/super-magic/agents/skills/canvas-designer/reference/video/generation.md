# Initial Canvas Video Generation

Use `generate_canvas_videos` to handle both placeholder creation and job creation.

## Confirm Before Generating

- If the user is only asking about capability ("can you?", "is it possible?"), confirm and ask for content details first; do not start generating
- If the user says "I want to generate a video" without describing the content, ask for details before calling any tool
- Only call generation tools when the user has expressed clear content intent and willingness to proceed

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

## Provider-managed reference assets

The current backend allows provider-managed assets for the Volcengine Ark provider (currently used by the Seedance video models). When the selected model supports it, a reference array may contain a controlled URI such as `asset://virtual-human-asset-id` for a virtual human portrait or another provider-managed asset.

- Keep the URI in the appropriate reference array, such as `reference_image_paths`.
- Bind it by array order in the prompt, for example `[image1]`.
- Do not call `visual_understanding` for the URI, read it as a workspace file, copy it into the project, or create a Canvas Element only for the URI.
- Use a workspace-relative media path for video models that do not support provider-managed assets.

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

## Example
```python
from sdk.tool import tool

result = tool.call('generate_canvas_videos', {
    "project_path": "my-design",
    "model_id": "model-from-media-model-info",
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

## Virtual human asset example

```python
from sdk.tool import tool

result = tool.call('generate_canvas_videos', {
    "project_path": "virtual-human-product-video",
    "model_id": "model-from-media-model-info",
    "tasks": [{
        "name": "Virtual human product introduction",
        "prompt": "The virtual human in [image1] faces the camera and introduces the product with natural hand gestures, stable framing, clear facial expression, and no added text.",
        "reference_image_paths": ["asset://virtual-human-asset-id"],
        "aspect_ratio": "16:9",
        "resolution": "720p",
        "duration_seconds": 5
    }]
})
print(result.content)
```

## Video Edit Mode Example
```python
from sdk.tool import tool

result = tool.call('generate_canvas_videos', {
    "project_path": "my-design",
    "model_id": "model-from-media-model-info",
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
