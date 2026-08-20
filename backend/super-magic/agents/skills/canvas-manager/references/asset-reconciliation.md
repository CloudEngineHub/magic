# Asset reconciliation

Load this reference only when the user reports a mismatch between the Canvas and local `images`/`videos` folders, or explicitly asks to restore canvas layers from local media. Ordinary generation failures, a single missing file, or a vague "fix the canvas" request do not trigger it.

## Controlled flow

1. Read-only comparison: reconcile Canvas details against the local media scope the user named.
2. Report clearly: what is missing, present, conflicting, or undecidable.
3. Only after the user explicitly asks to repair, import the unambiguous unregistered assets with `add_canvas_elements` using `source=imported` and the real workspace-relative `asset_path`.
4. Do not delete, overwrite, auto-resolve name conflicts, or modify existing Content.
5. After import, query the new Elements to confirm actual state.

This is not a dry-run/confirm tool; keep the read-only comparison, user confirmation, and explicit import as separate stages.
