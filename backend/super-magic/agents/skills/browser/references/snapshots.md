# Snapshots and Refs

Read [SKILL.md](../SKILL.md) first. This reference explains how structured page observation and visual labels share one element identity system.

## Snapshot Scopes

- `interactive`: interactive nodes plus the minimum ancestor context needed to understand dialogs, forms, navigation, lists, tables, and page regions. Use this by default before acting.
- `viewport`: the visible page structure, including useful non-interactive context.
- `subtree`: one ref and its descendants. Use it for a large dialog, table, form, or repeated region after the parent is known.
- `full`: the full page skeleton. Use only when the task genuinely requires page-wide structure.
- `changes`: changes since the previous compatible snapshot. Use after an action to verify observable effects.

A snapshot may be truncated. If the target is outside the returned region, narrow the scope, scroll, or request a relevant subtree. Do not respond by printing raw browser protocol data.

## Reading the Tree

The model-readable tree uses roles, names, states, and refs:

```text
[dialog] Sign in
  [textbox ref=e12] Email
  [textbox ref=e13] Password
  [button ref=e14] Sign in

[main]
  [heading] Product details
  [button ref=e21] Add to cart
```

Use the hierarchy to distinguish repeated labels. A button named `Close` inside an advertisement dialog is not the same target as a button named `Close` inside the user's current form.

Nodes may include states such as disabled, checked, selected, expanded, pressed, required, readonly, or focused. They may also include actions confirmed by the runtime, such as click, fill, select, check, scroll, hover, or upload.

## Ref Lifetime

A ref is valid only for the session, page, frame, document generation, and snapshot state in which it was created.

Take a fresh snapshot when:

- the main frame navigated;
- the document was replaced;
- the page reloaded or rebuilt substantially;
- an action reports a stale, missing, or ambiguous ref;
- a dialog, frame, or large page region changed and the previous target can no longer be resolved uniquely.

Do not carry refs between pages, tabs, sessions, or later navigations. Do not save refs in long-lived files or scheduled task definitions.

## Action Verification

An action result can report navigation, new pages, downloads, dialogs, and a snapshot diff. Use those facts before claiming success.

```python
action = tool.call("browser_click", {
    "page_id": page_id,
    "ref": target_ref,
})
if not action.ok:
    print(action.content)
else:
    changes = tool.call("browser_snapshot", {
        "page_id": page_id,
        "scope": "changes",
    })
    print(changes.content)
```

If no observable change is available, report that the action was dispatched and inspect the page again using the method appropriate to the task.

## Labeled Screenshots

`browser_screenshot(labels=True)` first obtains an interactive viewport snapshot, then renders labels for selected snapshot refs, captures the image, and removes the overlay.

The result includes a `label_to_ref` mapping. Convert a visual choice back to the mapped ref and use a normal interaction tool:

```python
shot = tool.call("browser_screenshot", {
    "page_id": page_id,
    "labels": True,
})
if not shot.ok:
    raise RuntimeError(shot.content)

target_ref = shot.data["label_to_ref"]["A2"]
clicked = tool.call("browser_click", {
    "page_id": page_id,
    "ref": target_ref,
})
```

Do not infer a ref from the label text. Do not reuse a label mapping after scrolling, resizing, navigation, or another snapshot that changes the page state.

## Stale Ref Recovery

1. Stop the failed action sequence.
2. Take a fresh `interactive` snapshot of the current page.
3. Re-evaluate the target using its role, accessible name, hierarchy, and state.
4. If multiple candidates remain, inspect a subtree or use a labeled screenshot.
5. Ask the user when the correct target cannot be determined without guessing.

Never recover by clicking the nearest text match or by converting the old ref into a selector.
