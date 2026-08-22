# Asset reconciliation

Load this reference only when the user reports a mismatch between the Canvas and local `images`/`videos` folders, or explicitly asks to restore canvas layers from local media. Ordinary generation failures, a single missing file, or a vague "fix the canvas" request do not trigger it.

## Controlled flow

1. Read-only comparison: reconcile Canvas details against the local media scope the user named.
2. Report clearly: what is missing, present, conflicting, or undecidable.
3. Only after the user explicitly asks to repair, import the unambiguous unregistered assets with `add_canvas_elements` using `source=imported` and the real workspace-relative `asset_path`.
4. Do not delete, overwrite, auto-resolve name conflicts, or modify existing Content.
5. After import, query the new Elements to confirm actual state.

The repair must use real source files only. If the named `.tmp` or Workspace asset does not exist, is empty, or cannot be mapped to an exact workspace-relative path, stop and report that there is no real asset to repair. Never create sample images, download substitutes, generate replacement media, copy files into `imports/`, or use shell commands such as `mkdir`/`cp` to manufacture a successful test. A successful import is proven only by querying the exact returned `element_id` and checking its Content, status, and canonical project-local media path.

This is not a dry-run/confirm tool; keep the read-only comparison, user confirmation, and explicit import as separate stages.
