# Basic Canvas video generation

Use this reference for a basic Canvas video request when the user has not asked for professional video production or a staged workflow. Requests such as “generate a video”, “make a promotional video”, or “animate this image” stay in this mode unless the user explicitly asks for professional production.

## Workflow

1. Understand the subject, action, scene, camera, style, duration, aspect ratio, resolution, model, and requested audio.
2. Present one concise generation target and complete prompt before generating. Ask only about unresolved choices that materially affect the result.
3. Generate one video Element directly through the basic Canvas video-generation path.
4. Use the same direct media pattern as basic image generation: the generated video is the result, and no storyboard, initialization image, first frame, `video-edit`, final composition, or professional-production Connection is created.
5. Use `row_incremental` layout unless the user provides exact coordinates.
6. Keep reference paths as generation inputs only. Do not convert them into business Connections.
7. Wait for an asynchronous generation task immediately, preserve its exact IDs on timeout, and query the completed Element before presenting the result.

Video billing and any required point-estimation gate remain in force. Do not bypass application-level validation for a basic request.

If the user later asks for professional video production, a storyboard, multiple shots, first frames, staged approvals, Connections, BGM replacement, or final composition, stop the basic path and continue with `references/professional-video-production.md` using the existing results.

## Tool choice

- Point estimate: `estimate_canvas_content_points` with `production_rule="video_generation"`.
- New logical video: `add_canvas_elements`, `element_type=video`, Content `source=generated`, `content_type=video`.
- New candidate on an existing Video Element: `add_canvas_contents`.
- Wait for asynchronous generation: `wait_canvas_generation` with the exact returned `generation_task_id`.
- Verify the result: `query_canvas_element_details` with the exact returned `element_id`.
- Select a confirmed candidate: `select_canvas_main_content` only after explicit user confirmation.

Read only `result.content` from every Code Mode tool result. Reuse the exact IDs and paths shown there; do not guess them.

## Generation inputs

For a generated video Content, the supported generation fields are `prompt`, `model_id`, `estimate_id`, `name`, `input_mode`, `task`, `reference_image_paths`, `reference_video_paths`, `reference_audio_paths`, `frame_start_path`, `frame_end_path`, `size`, `duration_seconds`, `aspect_ratio`, `resolution`, `fps`, `seed`, and `watermark`.

- Use only model, duration, aspect ratio, resolution, and mode values declared in the current `<media_model_info>`.
- Omit optional parameters when the user did not request them and the current model rules do not make a legal choice clear.
- Bind every reference asset inside the prompt by array order: `[image1]`, `[video1]`, and `[audio1]`.
- Do not put file paths in the prompt. Paths belong in their corresponding reference arrays.
- Use `frame_start_path` and optional `frame_end_path` for a start/end-frame transition; do not duplicate those files in `reference_image_paths`.
- Use `task="edit"` and `input_mode="video_edit"` only for an explicit video-to-video edit.

## Code Mode example: estimate

The estimate is side-effect free. Show `estimate.content` to the user and end the turn. Do not submit generation until the user confirms the parameters and points in a later message.

```python
from sdk.tool import tool

estimate = tool.call("estimate_canvas_content_points", {
    "project_path": "Canvas/Product Launch",
    "production_rule": "video_generation",
    "items": [{
        "item_ref": "product-promo-video",
        "name": "产品宣传视频",
        "prompt": (
            "Show the confirmed product [image1] on a clean studio stage. "
            "The product slowly rotates while the camera makes a gentle push-in. "
            "Preserve the product shape, proportions, materials, colors, and logo. "
            "Premium commercial lighting, stable motion, no added text or watermark."
        ),
        "model_id": "model-from-media-model-info",
        "reference_image_paths": ["Canvas/Product Launch/images/product.png"],
        "duration_seconds": 5,
        "aspect_ratio": "9:16",
        "resolution": "720p",
    }],
})
print(estimate.content)
```

## Code Mode example: generate after confirmation

Use the same `item_ref` and generation parameters as the estimate. Copy the exact `estimate_id` shown in `estimate.content`. Basic Canvas video generation deliberately omits `connections` and uses `row_incremental` layout.

```python
from sdk.tool import tool

confirmed_estimate_id = "estimate-id-from-result-content"

result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "product-promo-video",
        "element_type": "video",
        "name": "产品宣传视频",
        "layout": {"strategy": "row_incremental"},
        "content": {
            "source": "generated",
            "content_type": "video",
            "name": "产品宣传视频",
            "prompt": (
                "Show the confirmed product [image1] on a clean studio stage. "
                "The product slowly rotates while the camera makes a gentle push-in. "
                "Preserve the product shape, proportions, materials, colors, and logo. "
                "Premium commercial lighting, stable motion, no added text or watermark."
            ),
            "model_id": "model-from-media-model-info",
            "estimate_id": confirmed_estimate_id,
            "reference_image_paths": ["Canvas/Product Launch/images/product.png"],
            "duration_seconds": 5,
            "aspect_ratio": "9:16",
            "resolution": "720p",
        },
    }],
})
print(result.content)
```

## Code Mode example: wait and verify

When generation returns a task ID, wait immediately. If waiting times out, call the same tool again with the same `generation_task_id`; never submit a duplicate generation.

```python
from sdk.tool import tool

wait_result = tool.call("wait_canvas_generation", {
    "project_path": "Canvas/Product Launch",
    "tasks": [{
        "generation_task_id": "generation-task-id-from-result-content",
    }],
    "max_wait_seconds": 600,
})
print(wait_result.content)

details = tool.call("query_canvas_element_details", {
    "project_path": "Canvas/Product Launch",
    "element_ids": ["element-id-from-result-content"],
})
print(details.content)
```

## Version rules

- Do not overwrite ordinary Content; append a new candidate with `add_canvas_contents` for a revision.
- Retry only failed Content with explicit user consent.
- At most 2 retries per Content; never loop.
- Show completed candidates and select main Content only after user confirmation.
