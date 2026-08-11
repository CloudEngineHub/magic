# Image, HTML, Text, And Existing Template Workflows

After calling `create_slide_template_project`, store source copies, screenshots, rendered references, downloaded files, and QA scratch output only under the returned `working_directory`. Copy only approved final assets into `images/`; `finalize_slide_template` removes the working directory after success.

## Image Or Screenshot Source

1. Use `visual_understanding` before writing files.
2. Extract the use case, audience, visual thesis, palette, typography, spacing, containers, shadows, borders, motifs, charts, image treatment, and density.
3. Treat screenshots as style evidence, not reusable assets by default.
4. Rebuild an original design system rather than tracing the screenshot pixel by pixel.
5. Keep user-owned brand assets only when their ownership and intended reuse are clear. Ask before retaining ambiguous logos, real people, QR codes, private dashboards, customer screenshots, or proprietary UI.
6. Use `source.kind: "derived"` and `source.method: "image-rebuild"`.

## Generated Canvas Contract

`create_slide_template_project` writes a fixed canvas root into every slide scaffold. Preserve this exact protocol while authoring:

```html
<main class="slide-container" data-width="<canvas width>" data-height="<canvas height>">
```

The two data attributes must match `template.json.source.canvas`. Replace scaffold content inside this root; do not remove or rename the class or dimension attributes.

## HTML Source

1. Read the HTML, CSS, scripts, and local assets.
2. Use `visual_understanding_webpage` through `run_sdk_snippet` with `sdk.tool.call(...)` on representative pages when rendering is available, following the Code Mode example in the main skill.
3. Extract reusable visual rules and layout families; do not copy source-specific business content or unnecessary runtime code.
4. Rebuild the result into independent fixed-size slide pages using the source canvas declared in `template.json`; preserve source ratios such as `1:1`, and use `1920x1080` only as the fallback.
5. Use `source.kind: "derived"` and `source.method: "html-import"`.

## Text Style Brief

1. Infer or confirm the scene, audience, tone, palette direction, typography, layout needs, image needs, and density.
2. Write `visual-spec.md` before any slide HTML.
3. Build a scene-specific page inventory instead of a generic repeated card deck.
4. Use `source.kind: "original"` and `source.method: "brief-generator"`.

## Existing Template Directory

Treat this as an update only when the user explicitly requests an update.

1. Read `template.json`, `visual-spec.md`, `theme.css`, all slide indexes, representative pages, and referenced assets.
2. Preserve the template ID, category, public file structure, and valid asset references unless the user requests a breaking change.
3. Do not create backup directories; rely on workspace history where available.
4. If the directory is not safely recoverable or the update intent is unclear, ask before editing.
5. Synchronize `template.json.slides` with the actual slide files after changes.

## Mixed Sources

Resolve conflicts in this order:

1. Explicit user requirements.
2. User-owned or licensed source material.
3. Visual evidence from provided files.
4. General design judgment.

Preserve the target audience and use case before surface decoration.
