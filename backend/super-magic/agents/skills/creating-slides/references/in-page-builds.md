# In-slide builds

Use when the user requests click-controlled reveals in the online presentation player, or
proactively under the "Proactive use" rules below.
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

## Proactive use

You may add builds without a request while creating slides, but be conservative: a page with
no builds is always acceptable.

- Add them only to pages with sequential or parallel content that is naturally presented one
  point at a time: three or more list items, process or timeline stages, comparison columns,
  key takeaways. Skip covers, section dividers, ending pages, single-block pages, dense
  tables or charts, and image-only pages.
- Original animation wins. Do not add a build to an element that has its own animation or
  transition (CSS `animation`, `transition`-driven entrance, keyframe or animate-style
  classes, SMIL), or whose ancestor or descendant does. If a page already relies on element
  animations to reveal its content, leave that page without builds.
- Keep the page title and its context visible; reveal only the supporting points.
  Use 2 to 6 steps per page, numbered consecutively from 1, and group items that belong
  together under the same step. Never configure both a container and its descendants.
- Attributes must be exactly `data-ppt-step` (integer 1 to 1000) and optionally
  `data-ppt-effect` (`appear` or `fade`) on elements that exist in the source HTML. Do not
  invent other attributes, values, versions, classes or wrapper elements, and do not edit the
  slide just to host a build. After writing, re-read the file and confirm every value is valid.
- Never change builds the user already configured. When editing or regenerating a page,
  preserve existing attributes.
- Tell the user briefly which pages received steps and that they can adjust or remove them
  in the page's in-slide animation panel, or ask you to change them.
