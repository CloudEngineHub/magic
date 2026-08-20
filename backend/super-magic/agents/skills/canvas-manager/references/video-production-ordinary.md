# Video production — ordinary

Load this reference for ordinary video generation — a single video produced directly, without a storyboard, first frames, or a Video Edit. For staged multi-shot production, use `references/video-production.md`.

## Mode selection

- **Ordinary (this reference):** the user explicitly asks for a simple, direct, one-shot video.
- **Detailed (`video-production.md`):** everything else — multi-shot, storyboards, staged approvals, BGM replacement, or a separate final composition.

When the user does not name a mode, use the detailed workflow by default.

## Workflow

1. Understand all user-provided assets and identify the intended subjects, products, scenes, style, motion, duration, aspect ratio, resolution, and output model.
2. Present one complete creative target in readable Markdown before generating anything: the final video objective, subject and product treatment, scene, visual style, motion and pacing, audio expectation, output specifications, reference-material usage, artifact exclusions, and the complete final video prompt.
3. If duration, aspect ratio, resolution, or model is missing, propose suitable values and confirm them in the same round.
4. Ask one concise confirmation question after the complete target; do not repeat the full plan or prompt inside the question. Treat any requested change as a revision and confirm again.
5. Call `estimate_canvas_content_points`, show the full parameters and per-item points, and wait for explicit confirmation.
6. After confirmation, submit one task with the same `item_ref` and parameters, carrying the returned `estimate_id`. One task produces the final video — do not split it across tasks.
7. On a task ID, call `wait_canvas_generation` immediately.
8. Select the main Content only after the user confirms the candidate.

Do not create a storyboard, initialization images, first frames, a `video-edit`, or compose for the ordinary workflow — the generated video Element is the final result.

If the user later asks for a multi-shot storyboard, staged approvals, BGM replacement, or a separate final composition, continue in detailed mode using the existing results instead of silently mixing workflows.

## estimate_canvas_content_points

Run a side-effect-free point estimate before billed video generation.

| Parameter | Required | Description |
|---|---|---|
| `project_path` | Yes | Project path |
| `production_rule` | No | Default `video_generation` |
| `items` | Yes | Each item: `item_ref` and `prompt` required, plus the same model/duration/ratio/resolution/reference fields as the real generation (including `task`/`input_mode` when used) |

```python
tool.call("estimate_canvas_content_points", {
    "project_path": "Canvas/Product Launch",
    "production_rule": "video_generation",
    "items": [{"item_ref": "shot-s01",
               "prompt": "use the confirmed first frame, keep the product stable, slow push-in, no text watermark",
               "model_id": "confirmed-video-model",
               "duration_seconds": 4, "aspect_ratio": "16:9", "resolution": "1080p",
               "reference_image_paths": ["Canvas/Product Launch/images/s01-first-frame.png"]}],
})
```

Show the full parameters and per-item points, then end the turn and wait for confirmation. After confirmation, submit the real generation with the same `item_ref` and parameters, carrying the returned `estimate_id`. If parameters change or the estimate is unavailable, re-estimate before generating.

## Reference inputs

For a video Content (`source=generated`, `content_type=video`), the generation fields are `prompt`, `model_id`, `estimate_id`, `name`, `input_mode`, `task`, `reference_image_paths`, `reference_video_paths`, `reference_audio_paths`, `frame_start_path`, `frame_end_path`, `size`, `duration_seconds`, `aspect_ratio`, `resolution`, `fps`, `seed`, and `watermark`.

These control generation input only; only an explicit business predecessor becomes a Canvas Connection.

### Reference token binding

Bind reference assets inside `prompt` by array order:

- `reference_image_paths[0]` → `[image1]`, `reference_image_paths[1]` → `[image2]`
- `reference_video_paths[0]` → `[video1]`, `reference_video_paths[1]` → `[video2]`
- `reference_audio_paths[0]` → `[audio1]`, `reference_audio_paths[1]` → `[audio2]`

Place each token next to the subject, action, or source media it controls. Do not put file paths in `prompt`; paths belong in the reference arrays.

### Mode and task

`task` selects the video task type: `generate` (default) or `edit`. `input_mode` selects the model input mode (`standard`, `image_reference`, `omni_reference`, `keyframe_guided`, `video_edit`, or another exact `<mode name="...">` from `<media_model_info>`).

When you omit both, the tool infers the mode from the reference arrays you populate:

| Situation | Populate | Bind in prompt |
|---|---|---|
| Prompt-only generation | no reference arrays | — |
| One or more image references | `reference_image_paths` | `[image1]`, `[image2]` in order |
| Mixed image / video / audio references | the corresponding arrays | `[image1]`, `[video1]`, `[audio1]` in order |
| Start/end frame transition | `frame_start_path` and optional `frame_end_path`; do not duplicate them as reference images | describe the transition in the prompt |

Only set `task`/`input_mode` explicitly when you must override the inference (for example `task="edit"` for video editing) or when the current model rules require a specific value. If a mode is not listed in the current `<media_model_info>`, do not use it.

### Video-to-video (single-video edit)

To transform or edit an existing video (for example, restyle it into a watercolor animation), set `task="edit"` (optionally `input_mode="video_edit"`), put its workspace-relative path in `reference_video_paths`, cite `[video1]` in the prompt, and describe the transformation while preserving the original motion.

Video Content is billable. Estimate the exact request first, show the returned points, and wait for user confirmation. Pass the returned `estimate_id` unchanged to the real `add_canvas_elements` call.

```python
estimate = tool.call("estimate_canvas_content_points", {
    "project_path": "Canvas/Product Launch",
    "production_rule": "video_generation",
    "items": [{
        "item_ref": "watercolor-edit",
        "prompt": "Turn the reference video [video1] into a watercolor animation while keeping the original motion and timing.",
        "task": "edit",
        "input_mode": "video_edit",
        "reference_video_paths": ["Canvas/Product Launch/videos/source.mp4"],
    }],
})
print(estimate.content)
# After the user confirms the estimate, copy the exact estimate_id shown in estimate.content.
confirmed_estimate_id = "estimate-id-from-result-content"

result = tool.call("add_canvas_elements", {
    "project_path": "Canvas/Product Launch",
    "items": [{
        "item_ref": "watercolor-edit",
        "element_type": "video",
        "name": "watercolor restyle",
        "content": {
            "source": "generated",
            "content_type": "video",
            "prompt": "Turn the reference video [video1] into a watercolor animation while keeping the original motion and timing.",
            "task": "edit",
            "input_mode": "video_edit",
            "estimate_id": confirmed_estimate_id,
            "reference_video_paths": ["Canvas/Product Launch/videos/source.mp4"],
        },
    }],
})
print(result.content)
```

### Provider-managed assets

Only Seedance-series video models support provider-managed asset URIs such as `asset://virtual-human-asset-id`. A provider asset URI is a generation reference only: keep it in the appropriate reference array (for example `reference_image_paths`), bind it in the prompt (for example `[image1]`), and do not read it as a workspace file, import it into the Canvas, or add a synthetic Element for it. For other video models, use a workspace-relative media path.

## Prompt

Keep one clear scene and one main action unless the user asks for a sequence. Cover subject, action, scene, camera, and (when requested) sound, narration, or dialogue. Preserve any user-provided narration or dialogue verbatim. Use concrete, observable, positive language.

## Retry and version

- At most 2 retries per Content; never loop.
- Retry keeps the original Element ID and Content ID.
- A new direction uses `add_canvas_contents`, not a duplicate Element.
- Show completed candidates; select main only after confirmation.
- For a revision, append a candidate to the same Element and confirm it before selecting main.
