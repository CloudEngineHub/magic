---
name: slide-template
description: "Use when the user asks to create slides with a specific style, wants to use or inspect a PPT template by code, wants to see platform-provided PPT template options before creating, describes a custom template style, provides a PPTX/PPT file to convert into a platform template, or wants to extract a template from an existing PPT project."
description-cn: "当用户想查看平台提供的 PPT 模板选项、通过模板 code 使用或检查 PPT 模板、用特定风格制作幻灯片、描述自定义模板风格、提供 PPTX/PPT 文件转换为平台模板，或从现有 PPT 项目中抽象模板时使用。"
---

# Slide Template Manager

Use this skill to retrieve platform templates by exact code, create a custom template from a style description, extract one from a PPTX/PPT file, or extract one from an existing PPT project.

## Template Metadata

Every downloaded or generated template package should use `template.json` as the metadata entry. Current template packages use the HTML slide template project format:

- `schema_version`: fixed to `"1.0"`.
- `template_id`: `PPT-xxxx` format.
- `category_code`: optional `PPT-CATE-xxxx` format from the platform category list. It may be omitted when classification is maintained outside the template.
- `label.zh_CN`, `label.en_US`, `description.zh_CN`, and `description.en_US`: display metadata.
- `files.theme_css`, `files.slides_dir`, and `files.images_dir`: shared CSS, reusable slide pages, and local assets. `files.visual_spec` is optional in a draft and should be added after the visual spec is generated.
- `slides[].file`, `slides[].title`, `slides[].layout`, and `slides[].description`: reusable page index and default order.
- `source.kind`: `original`, `converted`, or `derived`, with a 1920x1080 canvas.

Do not write or rely on legacy fields such as `name`, `template_dir`, `package_type`, `slides[].slots`, `slides[].source_slide`, `slides[].best_for`, or `slides[].risks`. Use the paths declared by `template.json`; do not assume a fixed directory layout beyond the metadata.

## Template Source

- This skill does not bundle built-in templates. Do not read, list, or copy templates from `<skill_dir>/assets/templates/`.
- Platform templates are external resources identified by exact template `code`.
- Template `code` must come from a platform-provided template list, a user selection, a user-provided value, or explicit upstream context. Do not invent codes, rewrite casing, or map old local directory names to codes.
- If the user asks to see templates and no platform template list or code is available in context, ask the user to select a template in the UI or provide the template code. Do not fabricate local options.

## Decision

- Explicit template `code`: retrieve the template package with `get_slides_template_download_url`, then inspect the downloaded template files.
- Platform template list is available but no template is selected: recommend 3-5 suitable options with `ask_user`. Each option must include name, short description, and exact `code`, plus "no template/default style".
- User only describes scenario/topic/audience without enough visual specs and no platform template list is available: ask for a platform template code or confirm no template/default style.
- User provides a PPTX/PPT/presentation template file or URL and asks to convert it into a platform template: read `references/pptx-template-workflow.md` and follow the PPTX Template Workflow first.
- User describes concrete visual style (colors, materials, layout, decorative elements, visual keywords; 配色/材质/版式/装饰/视觉关键词): generate a custom template first, then use it.
- Editing/fixing/refactoring existing slides does not trigger template selection unless the user asks for a new PPT/project.

## Platform Template Retrieval

When a template code is selected and you need to read or download the template package, first call `get_slides_template_download_url` through Code Mode, then download and inspect the ZIP package.

```python
from sdk.tool import tool

result = tool.call("get_slides_template_download_url", {
    "code": template_code
})

template_file_url = result.data["template_file_url"]
```

After receiving `template_file_url`:

1. Download the ZIP package into the current workspace, for example under `.workspace/slide-templates/<code>/`.
   Prefer `download_from_urls` for the URL download, then use `shell_exec` only for unzip/file inspection.
2. Unzip it into a dedicated directory.
3. Read `template.json` first.
4. Read all available resources declared by `template.json` that are useful for the deck:
   - Always read `files.theme_css` when present.
   - Read `files.visual_spec` for design rules, typography, layout types, chart rules, and image guidance when present.
   - Read representative `slides[].file` files or representative HTML files under `files.slides_dir`, when present.
5. Treat `theme.css` as the authoritative CSS. Treat `template.json`, `visual-spec.md`, and `slides/*.html` as complementary sources for reusable layouts, edit hints, components, composition patterns, visual rhythm, and asset references.
6. Read image paths or assets only when needed for the target deck.
7. Do not link to downloaded template files from generated slides. Copy the required CSS and assets into the PPT project after `create_slide_project`.

## Template Application Workflow

1. Resolve the selected template code from user choice or upstream context. If there is no exact code, ask for it or proceed with no template if the user confirms.
2. Call `get_slides_template_download_url` and download the template package.
3. Read `template.json`, then read the available resources it declares (`theme_css`, `visual_spec`, `slides_dir`, `images_dir`, and `slides[].file`) before creating slide pages.
4. Before writing slides, summarize internally: package resources, palette roles, typography, layout inventory, reusable components, slot/page patterns, composition rules, asset dependencies, and adaptation rules.
5. Create the template package with `create_slide_project`.
6. Copy `theme.css` and any required assets from the downloaded template into the PPT project. Keep all slide references local to that project.
7. Each slide HTML must include the local CSS:

```html
<link rel="stylesheet" href="theme.css" />
```

8. Load `creating-slides` and generate slides. Keep every slide fixed at 1920x1080; do not use responsive design. Use only the downloaded template's CSS variables, components, dedicated layout patterns, chart colors, and image guidance inferred from the template package. If no downloaded layout fits, compose the page from template components, decorations, and layout helpers instead of generic centered text.
9. Each slide should have one clear visual anchor, such as an image area, chart, matrix, large number, color block, or template-specific decoration.
10. Use `data-slot`, `data-slot-type`, and `data-slot-role` from slide HTML as editing hints when present, but do not expect slot metadata in `template.json`.

## Image Rules

- First decide whether the page needs images. Use images for visual layouts, cover/section/closing pages, specific person/product/scene/case, or sparse text.
- Skip image search for dense comparison, card grid, timeline/process, data dashboard, or chart pages.
- Prefer `image_search`. Try at least 2 content-relevant keyword groups and include style keywords inferred from the downloaded template.
- If search results are poor, use `generate_images` and save output under the PPT project `images/` folder.
- Apply template style only to creative illustrations (concept visuals, atmosphere, decorative or abstract images). Do not stylize factual photos, real people, real places, products, history/science references, brand marks, screenshots, QR codes, or data graphics.
- Images should occupy meaningful visual space; do not use them as tiny icons.
- Images can be used as local section backgrounds with an overlay when they support the content and template style.
- If a slide skips images, use a non-image visual anchor instead of leaving sparse text floating in empty space.
- Do not repeat the same background-image treatment on most consecutive slides.

## Custom Template Workflow

Use when the user describes a style in text, provides screenshots, or gives an existing PPT project. Read `<skill_dir>/references/custom-template-workflow.md` and follow it before generating custom template files.

## PPTX Template Workflow

Use when the user provides a presentation file such as `.pptx`, `.ppt`, `.potx`, `.pot`, `.ppsx`, a WPS presentation, or a URL to a presentation template and asks to convert it into this platform's reusable template format. Read `<skill_dir>/references/pptx-template-workflow.md`, then call `convert_pptx_to_slide_template`. After the tool returns, keep working: analyze the converted content, write `visual-spec.md`, refine `template.json`, `theme.css`, `images/`, and `slides/*.html`, run lightweight QA, then ask whether to package the refined draft as the final template ZIP. Do not call the old raw HTML renderer tool or run this skill's old PPTX extraction scripts.

## Style Specificity & Template Scope

- `theme.css` must only contain template-specific styles: color variables, background decorations, typography, template components, and visual helpers. It must NOT contain structural layout properties (padding, flex, grid) on framework-level selectors like `.slide-container`.
- `.slide-container` in `theme.css` should only set: dimensions (`width`/`height`), `position`, `overflow`, `box-sizing`, and template-specific backgrounds/colors. Layout properties (`padding`, `margin`, `display: flex`, `flex-direction`) must be defined in each slide page's own `<style>` block.
- Page-level `<style>` in each slide HTML has higher specificity than `theme.css` by nature of source order (page styles load after `theme.css`). If needed, use more specific selectors (e.g., `.slide-container.my-page`) to ensure page styles override template defaults.
- When writing slide pages, always define layout (padding, flex, grid) directly in the page `<style>` rather than relying on `theme.css`, to avoid cross-page style conflicts.

## Output

- Platform template workflow output: a complete template package generated through `creating-slides`, using template files retrieved through `get_slides_template_download_url`.
- Built-in local template workflow output: none; local bundled templates are no longer supported.
- Custom workflow output: a complete template package generated through `creating-slides`.
- PPTX template conversion output: first create a draft template folder containing `template.json`, `theme.css`, `images/`, and `slides/*.html`; use the model to analyze the converted visual style and write `visual-spec.md`, refine the folder, run lightweight QA, then ask the user whether to create the final sibling `<template-id>-template.zip`.
- Preview images may be generated by a script from `slides/*.html`, but they must be stored in build or publishing artifacts and must not be included in the template ZIP.
- Do not paste raw HTML in chat.
