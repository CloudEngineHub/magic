# Video generation reference

Use the Canvas Content tools for video generation. Video generation may be asynchronous; after receiving a task ID, call `wait_canvas_generation` and reuse the same task ID after a timeout.

Follow the retry limit in the parent `canvas-manager` Skill. This reference never increases the limit and never authorizes an automatic retry loop.
