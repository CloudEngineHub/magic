# Slide creation tool contracts

`create_slide_project` and `create_slide` are Code Mode only. Run Python through
`run_sdk_snippet`, import `tool` from `sdk.tool`, and call `tool.call(...)`.
Print and read each `result.content`; use `result.ok` for dependent steps.
Both tools report their result through content, not a structured `result.data` contract.

## create_slide_project

Use after the skill's project confirmation and template selection steps. Name the
directory and pages in the user's preferred language, using concise topic names
without sequence-number prefixes or filesystem-unsupported characters.

| Parameter | Required | Meaning |
| --- | --- | --- |
| `project_path` | Yes | Project directory relative to the workspace. |
| `slide_count` | No | Requested count, default `0`; it does not generate page HTML. |
| `slides_array` | No | Ordered project-relative HTML paths, default `[]`. Empty projects can receive pages later. |
| `slide_images_content` | No | Complete Markdown image library; default `""` skips its file and downloads. |
| `todo_list` | No | Complete Markdown production plan; default `""` skips its file. |

The tool creates `index.html`, `magic.project.js`, `slide-bridge.js`, and `images/`.
It optionally writes `slide-images.md` and downloads images, and writes `slide-todo.md`.
It does not create the HTML pages listed in `slides_array`; create those separately.
An existing directory is reused and generated files can be overwritten. Do not use
project creation to edit or reinitialize an existing deck: that can replace its page
list and transition metadata. Use page creation or the relevant editing workflow.

For `slide_images_content`, follow the main skill's Tool Parameter Format Specifications:
use `![filename.png](URL)`, including a filename extension. Alt text becomes the downloaded
filename. Record image size/aspect ratio, visual analysis, intended usage, and search keywords.
For `todo_list`, include an overall design scheme and per-page content and design plans.
When a template is selected, derive its colors and decoration from `theme.css` and check
text contrast against the actual background instead of inventing an independent palette.

```python
from sdk.tool import tool

result = tool.call("create_slide_project", {
    "project_path": "quarterly-review",
    "slides_array": []
})
print(result.content)
if not result.ok:
    raise SystemExit("Project initialization failed; inspect its result before creating pages.")
```

A successful initialization does not prove all image downloads succeeded or that pages
exist. Read any download warnings, verify needed assets, and create pages before reporting
a complete presentation. After failure, inspect the directory before retrying; do not
assume every partial file was removed.

## create_slide

Writes complete HTML, persists inert speaker notes, runs custom browser layout analysis,
and registers a new page in `magic.project.js`. Existing page files are overwritten.
Create page HTML directly in the project directory: automatic registration looks for
`magic.project.js` beside the page and registers its filename.

| Parameter | Required | Meaning |
| --- | --- | --- |
| `file_path` | Yes | Output HTML path relative to the workspace, including the project directory. |
| `content` | Yes | Complete authored HTML, including `slide-bridge.js` and the skill's static canvas requirements. |
| `speaker_notes` | No | Omit to preserve notes on an existing page, or create an empty notes block on a new page. `""` clears notes; text replaces them. |
| `max_width` / `max_height` | Yes | Positive canvas dimensions in pixels; normally `1920` and `1080`. |
| `analysis_js` | Yes | JavaScript function body, not a function declaration. It can use `maxWidth` and `maxHeight` and must return its findings. |
| `insert_after_slide` | Yes | Project-relative anchor page path; `""` inserts a new page first. Missing anchors append with a warning. Ignored for existing pages, which retain their order. |

The tool handles the invisible `data-magic-slide-notes` block. Do not place speaker notes
in visible slide content. Each new path is added to the deck; updating an existing page
keeps its original position and preserves existing transition settings.

For `analysis_js`, select at least five meaningful elements from the authored page and
check all four canvas edges (`x < 0`, `y < 0`, `x + width > maxWidth`,
`y + height > maxHeight`). Check image enlargement and aspect-ratio distortion too.
Return an `issues` array with measured values and identifiable selectors so repairs can
target the actual problem. Use page-specific selectors rather than copying unrelated ones.

After authoring `slide_html` and its `analysis_body`, execute:

```python
from sdk.tool import tool

result = tool.call("create_slide", {
    "file_path": "quarterly-review/cover.html",
    "content": slide_html,
    "speaker_notes": "Introduce the quarter's main conclusion.",
    "max_width": 1920,
    "max_height": 1080,
    "analysis_js": analysis_body,
    "insert_after_slide": ""
})
print(result.content)
```

Write failure returns `ok=False`. Browser analysis can fail after a successful file write,
and registration status is reported separately in content. `ok=True` therefore does not
prove layout QA passed or that registration succeeded: read all three stages. Correct
layout issues using the skill's repair limits. If registration failed, inspect the current
`magic.project.js` before correcting the page list; preserve its existing metadata.
Never report a page as visually checked when browser analysis failed.

Create the project before dependent pages. Review each page's result before continuing;
do not blindly run page creation in parallel or suppress failed-stage details.
