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
| `items` | Yes | Each item: `item_ref` and `prompt` required, plus the same model/duration/ratio/resolution/reference fields as the real generation |

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

Use `reference_image_paths`, `reference_video_paths`, `reference_audio_paths`, `frame_start_path`, and `frame_end_path` per the request. These control generation input only; only an explicit business predecessor becomes a Canvas Connection.

## Prompt

Keep one clear scene and one main action unless the user asks for a sequence. Cover subject, action, scene, camera, and (when requested) sound, narration, or dialogue. Preserve any user-provided narration or dialogue verbatim. Use concrete, observable, positive language.

## Retry and version

- At most 2 retries per Content; never loop.
- Retry keeps the original Element ID and Content ID.
- A new direction uses `add_canvas_contents`, not a duplicate Element.
- Show completed candidates; select main only after confirmation.
- For a revision, append a candidate to the same Element and confirm it before selecting main.
