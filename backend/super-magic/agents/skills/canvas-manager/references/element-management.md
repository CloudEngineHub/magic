# Canvas Element management

Load for inspecting saved generation records, unframing or deleting exact Canvas Elements and existing image versions. Query details first. Use business tools in Code mode and print `result.content`; never edit Canvas JSON or use file/shell deletion to bypass these rules.

## Generation records

Call `query_canvas_element_details` with exact Element IDs. Read each version's `content_id`, current/main markers, file, prompt, `model_id`, optional recorded model name, ordered `[imageN]` reference paths, source-image crop, size, resolution and saved generation settings. These are persisted records, including saved requests while generating; they do not expose unsaved browser drafts. Reuse reference bindings in their returned order. Keep project-relative references unchanged for Canvas tools; prefix the exact project path only for Workspace-anchored tools.

`generation_record=not_recorded` means no saved request was found, as with an imported image; `unavailable` means details could not be fully read. Neither authorizes guessing the model or prompt. A missing setting is unknown, not the current model's default. Versions have independent records; identify the intended Content before reusing a prompt. Reading a record does not submit generation, change files or select a different version. The ordinary revision rule still creates a new independent Element unless the user explicitly requests versions in the same Element.

## Unframe

`unframe_canvas_elements`: required `project_path` and exact Frame `element_ids`. Removes only the selected Frames, releases children to their parent while preserving positions, transformations, media and relative order. Connections involving the removed Frame disappear; child connections remain. Unknown geometry, undecodable children/connections and locked Elements are rejected. Do not confuse unframing with recursively deleting a Frame. Create Frames with the existing `frame_canvas_elements` tool.

```python
from sdk.tool import tool
result = tool.call("unframe_canvas_elements", {
    "project_path": "Demo", "element_ids": ["frame-A"],
})
print(result.content)
```

## Delete

`delete_canvas_elements`: required `project_path`, `targets=[{element_id,...}]`; `mode=remove|remove_with_files`, `stage=prepare|execute`.

- `remove`: remove the Element and its descendants/connections, retaining actual files. For an existing multi-version image, `scope=current` and the exact active `content_id` remove only that version; `scope=all` removes the whole Element.
- `remove_with_files`: supported only for actual image Elements and completed Workspace image files in this project. The existing Workspace deletion tool and mounted filesystem handle product recycle-bin semantics. This is not permanent deletion or clearing a recycle bin.
- A multi-version target requires explicit `scope=current|all`; current-version deletion requires its exact active Content ID. Do not default to all. Single-version Elements require no extra version choice.
- Current-version deletion retains a file still used by another Content. All-version file deletion is rejected if unselected Contents still use the file. The prepared question explains retained shared files; do not delete the reference owners implicitly.
- A Frame's ordinary removal recursively affects its children; preparation lists every descendant and affected connection. Selecting both a parent and its descendant is normalized. Locked ancestors/descendants are not automatically unlocked.
- A generating placeholder can be removed with `mode=remove`. It has no completed file to delete. Removal does not cancel provider generation or refund fees; late results must not recreate the removed target.

### Required human confirmation

1. Call `stage=prepare` with the exact targets and mode. Read the returned scope, actual files, shared-file policy and `prepared_tool_call_id`.
2. Call `ask_user` directly outside Code mode with only `prepared_tool_call_id`. The runtime supplies the exact prepared question; do not author a different impact list. Wait for the human.
3. On explicit confirmation, call `stage=execute` with the same target list/mode, prepared ID and the actual `ask_user` call ID in `confirmation_tool_call_id`.

```python
from sdk.tool import tool
result = tool.call("delete_canvas_elements", {
    "project_path": "Demo", "stage": "prepare", "mode": "remove",
    "targets": [{"element_id": "element-A"}],
})
print(result.content)
```

The runtime rejects missing, declined, skipped, timed-out, stale or reused confirmations. Moving an Element alone does not change the confirmed deletion scope; changes to files, versions, descendants or references require preparing and confirming again. Non-interactive channels and subagents cannot bypass the gate.

Read actual per-item outcomes. Only confirmed successful file deletions permit removal of their Canvas targets. Failures retain the corresponding targets. If a file was deleted but Canvas writing failed, report the partial result and re-query before repairing Canvas state; do not repeat deletion of a recreated same-name file. Recycled file recovery does not restore Canvas Elements, positions or connections automatically. The tools use existing persistence; they do not promise an atomic transaction with files or conflict-free simultaneous browser edits.
