# Slide transitions

Transitions belong to the deck's `magic.project.js`. The outer online player runs them;
slide HTML stays static. They do not control automatic advance, element animation, audio,
PDF/images, standalone `index.html`, or native PowerPoint transitions.

Read the current configuration first. For “page 3”, resolve `slides[2]` to a file path.
Pass the entire slides array from that read as `expected_slides`. Do not recalculate the
page number against a newer array: a conflict requires reading and resolving intent again.

`update_slide_transitions` is Code Mode only. Execute the Python examples through
`run_sdk_snippet`, using `sdk.tool.call`; do not call it as a directly mounted tool.
Never overwrite the whole manifest with a generic file tool.
The tool reads synchronized file identity, content and metadata revision, submits one protected
save, then checks the mounted result. A pending sync, rejected authorization, conflict or unknown
outcome is not success. Do not automatically retry an old request. Cancellation may occur after
the service committed; reread the project before deciding whether another update is needed.

## Tool parameters

| Parameter | Meaning |
| --- | --- |
| `project_path` | Existing project directory relative to the workspace; no absolute path or parent traversal. |
| `operation` | `set_default`, `set_slides`, or `clear_overrides`, as described below. |
| `expected_slides` | Required exact ordered `slides` array from the current configuration read, including hidden slides. A changed array rejects the update. |
| `slide_paths` | Unique existing paths required for `set_slides` and `clear_overrides`; omit for `set_default`. |
| `transition` | Complete setting required for either set operation; omit for `clear_overrides`. |
| `clear_overrides` | Boolean, default `false`. Only `set_default` accepts `true`, removing all page overrides. |

Slide paths must be canonical project-relative `.html` paths: no absolute paths,
parent traversal, query/fragment, backslashes, or duplicate entries. Parameters are
strict; do not add unsupported fields or send explicit null for irrelevant effect fields.

## Settings and scope

Each setting describes entry into the target slide. A slide override is a complete setting;
otherwise the deck default applies, then `none`. Missing settings mean no transition.

| Effect | Required fields | Suggested duration |
| --- | --- | --- |
| `none` | `effect` only | No duration |
| `fade`, `zoom` | `effect`, `duration_ms`, `easing` | 400 ms |
| `push`, `cover`, `wipe` | Above plus `direction` | 450 ms |

`duration_ms` is an integer from 100 to 2000 in steps of 50. `easing` is `linear` or
`ease-in-out` (recommended). Direction is the content movement direction: `left`, `right`,
`up` or `down`. Zoom is fixed at 0.96 to 1. Do not pass scripts, CSS, arbitrary easing, or
parameters irrelevant to the effect.

- `set_default`: provide `transition`; existing page overrides stay intact.
- `set_default` with `clear_overrides: true`: apply to all pages by removing existing overrides.
- `set_slides`: provide `slide_paths` and a complete `transition` for only those existing pages.
- `clear_overrides`: provide `slide_paths`, omit `transition`; those pages inherit the default.
- To remove all animation, set the default to `{"effect":"none"}` and clear all overrides.
  Clearing overrides alone does not remove an animated default.

No animation request means no new transition configuration. For an explicit request, prefer
one consistent effect and occasional deliberate chapter overrides. Content-only edits,
regeneration and template replacement preserve every existing transition setting.

## Example

After reading a deck with exactly `["cover.html", "body.html", "summary.html"]`,
“make page three push faster” can be applied through Code Mode:

```python
from sdk.tool import tool
result = tool.call("update_slide_transitions", {
    "project_path": "quarterly-review",
    "operation": "set_slides",
    "expected_slides": ["cover.html", "body.html", "summary.html"],
    "slide_paths": ["summary.html"],
    "transition": {
        "effect": "push", "duration_ms": 300,
        "easing": "ease-in-out", "direction": "left"
    }
})
print(result.content)
```

For a new deck, finish creating the project and its slides before configuring requested
transitions. Report the affected pages, effect and duration after a confirmed save.
Saving does not prove playback was previewed; claim preview only if it was actually observed.

## Results and failures

Read and print `result.content` for the save status, affected scope and any next step.
`result.ok` is true only after the protected save and mounted readback are confirmed.
For precise follow-up calls, successful `result.data` contains `project_path`, `file_id`,
`revision` (metadata version), and `slide_paths` (resolved target paths; the entire
`expected_slides` array for `set_default`). Do not print all
structured data merely to repeat the readable result.

Invalid parameters or unknown targets require correcting the request. A changed slide
array or revision conflict requires a fresh configuration read and renewed page resolution.
Permission failures require authorized edit access. Pending synchronization or an unknown
save outcome requires rereading and checking the mounted project before another attempt;
never bypass a rejected save with a generic file writer. Do not report success for a failed,
cancelled or unconfirmed call. Cancellation can leave an already committed save intact.
