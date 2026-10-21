# In-slide builds

Use only when the user requests click-controlled reveals in the online presentation player.
Keep the slide static: do not add animation CSS, scripts, timers, or navigation listeners.
The player executes these declarations during presentation; reading, thumbnails, standalone
HTML and exports show the full page. Do not promise native PowerPoint animations.

Add `data-ppt-step` (and optionally `data-ppt-effect`) to an existing source HTML element or
content container:

```html
<div data-ppt-step="1">First point</div>
<div data-ppt-step="2" data-ppt-effect="appear">Second point</div>
```

- `data-ppt-step` must be an integer from 1 to 1000.
- `data-ppt-effect` is `appear` or `fade` (250 ms, reduced motion uses appear); omit it for `fade`.
- Equal step numbers appear together. Numbers sort ascending; gaps do not create empty steps.
- Elements without the attribute remain visible. Remove both attributes to remove the build.
- Do not configure both a container and its descendants. A container reveals all its contents.
- Do not configure html/body, document metadata, scripts, styles, SVG internals or generated DOM.
- Preserve attributes on surviving elements during edits. Whole-page regeneration may replace
  those elements: explicitly report any build settings that cannot be preserved.
- Forward reveals the next group before changing page. Backward hides the most recent group;
  at step zero it returns to the previous visible page with that page fully revealed.
- Direct jumps start the target at step zero. Step progress is not saved to the file.

Use the existing slide creation and localized editing workflows. Do not create sidecar files,
change page order, split builds into extra slides, or modify page transition metadata.
