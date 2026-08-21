# Basic Canvas video generation

Use this reference for a basic Canvas video request when the user has not asked for professional video production or a staged workflow. Requests such as “generate a video”, “make a promotional video”, or “animate this image” stay in this mode unless the user explicitly asks for professional production.

## Workflow

1. Understand the subject, action, scene, camera, style, duration, aspect ratio, resolution, model, and requested audio. If a reference is a provider-managed asset URI such as `asset://virtual-human-asset-id`, treat it as an opaque generation input: do not call `visual_understanding`, do not try to resolve it as a local file, and do not import it into Canvas. Only inspect a reference when it is an actual workspace media path or an accessible image URL.
2. Present one concise generation target and complete prompt before generating. Ask only about unresolved choices that materially affect the result.
3. Generate one video Element directly through the basic Canvas video-generation path.
4. Use the same direct media pattern as basic image generation: the generated video is the result, and no storyboard, initialization image, first frame, `video-edit`, final composition, or professional-production Connection is created.
5. Use `row_incremental` layout unless the user provides exact coordinates.
6. Keep reference paths as generation inputs only. Do not convert them into business Connections.
7. Wait for an asynchronous generation task immediately, preserve its exact IDs on timeout, and query the completed Element before presenting the result.

Video billing remains in force. Point estimation is required by default and may be skipped only when the user explicitly says in the current request that estimation is unnecessary and accepts an unknown point cost. Do not infer this from urgency, "generate directly", "start now", or prior approval; do not bypass application-level validation.

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

For a generated video Content, the supported generation fields are `prompt`, `model_id`, `estimate_id`, `skip_point_estimate`, `name`, `input_mode`, `task`, `reference_image_paths`, `reference_video_paths`, `reference_audio_paths`, `frame_start_path`, `frame_end_path`, `size`, `duration_seconds`, `aspect_ratio`, `resolution`, `fps`, `seed`, and `watermark`.

- Provide `name` in the user's language using a concise 3-5 word description of the actual video. The saved file uses this model-provided name plus one short unique value.
- Use only model, duration, aspect ratio, resolution, and mode values declared in the current `<media_model_info>`.
- Omit optional parameters when the user did not request them and the current model rules do not make a legal choice clear.
- Bind every reference asset inside the prompt by array order: `[image1]`, `[video1]`, and `[audio1]`. These binding tokens are part of the final prompt and must already be present before point estimation.
- Do not put file paths in the prompt. Paths belong in their corresponding reference arrays.
- Use `frame_start_path` and optional `frame_end_path` for a start/end-frame transition; do not duplicate those files in `reference_image_paths`.
- Use `task="edit"` and `input_mode="video_edit"` only for an explicit video-to-video edit.
- Set `skip_point_estimate=true` only when the user explicitly asked in the current request to skip point estimation and accepted an unknown point cost. Never combine it with `estimate_id`; otherwise use the normal estimate and confirmation workflow.

## Code Mode example: estimate

The estimate is side-effect free. Build and freeze the exact final request first, including all reference binding tokens and prompt constraints, then show `estimate.content` to the user and end the turn. Do not submit generation until the user confirms the parameters and points in a later message. The only exception is an explicit current-request instruction to skip estimation with acceptance of unknown point cost; in that case call generation directly with `skip_point_estimate=true`. After confirmation, reuse the exact same `item_ref` and request fields without rewriting the prompt. If the prompt, reference list, or any billable field changes, call the estimate again and request a new confirmation; never let `POINT_ESTIMATE_MISMATCH` become a second, avoidable confirmation round.

For a retry of failed billable Content, keep the original generation request's `item_ref` unchanged. A retry is an operation on the existing Element and Content, not a new batch item. If a new estimate is required, use the new `estimate_id` with that same original `item_ref`; never rename it with a retry suffix.

```python
from sdk.tool import tool

estimate = tool.call("estimate_canvas_content_points", {
    "project_path": "Demo",
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
        "reference_image_paths": ["Demo/images/product.png"],
        "duration_seconds": 5,
        "aspect_ratio": "9:16",
        "resolution": "720p",
    }],
})
print(estimate.content)
```

## Code Mode example: generate after confirmation

Use the same `item_ref` and generation parameters as the estimate. Copy the exact `estimate_id` shown in `estimate.content`, including the prompt string byte-for-byte. You may omit the billable generation fields and provide only the confirmed `estimate_id` and `item_ref`; the server will restore the frozen request. Do not mix a partial request with changed billable fields. Basic Canvas video generation deliberately omits `connections` and uses `row_incremental` layout.

```python
from sdk.tool import tool

confirmed_estimate_id = "estimate-id-from-result-content"

result = tool.call("add_canvas_elements", {
    "project_path": "Demo",
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
            "reference_image_paths": ["Demo/images/product.png"],
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
    "project_path": "Demo",
    "tasks": [{
        "generation_task_id": "generation-task-id-from-result-content",
    }],
    "max_wait_seconds": 600,
})
print(wait_result.content)

details = tool.call("query_canvas_element_details", {
    "project_path": "Demo",
    "element_ids": ["element-id-from-result-content"],
})
print(details.content)
```

## Version rules

- Do not overwrite ordinary Content; append a new candidate with `add_canvas_contents` for a revision.
- Retry only failed Content with explicit user consent.
- At most 2 retries per Content; never loop.
- Show completed candidates and select main Content only after user confirmation.
