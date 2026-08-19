# Image generation reference

Use the Canvas Content tools for image generation. Follow the retry limit in the parent `canvas-manager` Skill; this reference never increases it or authorizes an automatic retry loop.

Use `add_canvas_elements` for a new image Element and `add_canvas_contents` for another image candidate on an existing Element. If a generated Content is `failed` and the user explicitly asks to retry it, use `retry_canvas_content_generation` with the original Element and Content IDs.
