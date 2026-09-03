---
name: slide-template-replacement
description: "Replace the visual template of an existing HTML slide project while preserving its content. Use when a user asks to change, apply, or replace a PPT template for an existing project, a specific slide, or an explicit page range and provides a template_code or a template selected from the template picker. Do not use for creating templates or converting native PPTX files."
---

# Slide Template Replacement

Use this skill when the input asks to apply an existing platform template to an existing HTML slide project. The frontend command includes the exact `template_code`, the current PPT file and folder mentions, and either an entire-deck scope or a target slide scope. The user may also name a page range such as pages 3-5.

Do not load `slide-template-maker`. This skill only applies an existing platform template.

## Supported input

- Only existing HTML slide projects are supported. If the source is a native `.pptx`, `.ppt`, `.potx`, `.pot`, or `.ppsx` file, refuse and explain that this skill cannot edit native PowerPoint files.
- Require an exact `template_code` from the platform template picker or upstream context. Never infer a code from a display name, URL, or local directory.
- Resolve the current PPT, its containing folder, and any target slide from the structured `@` mentions. If a mention is missing, ask only for that missing node. Do not ask the user to reselect nodes that are already present.
- Accept three scopes: the entire deck, one target slide, or an explicit page range such as pages 3-5. Apply the template only to the requested pages.
- Default to visual replacement only: theme, typography, spacing, colors, backgrounds, decorations, and layout rules. Change text, images, chart data, or page count only when the user's natural-language note explicitly asks for that change.
- If the current project already uses this exact `template_code`, say that no replacement is needed and stop. Do not install, copy, or rewrite files. Do not infer a match from visual similarity.

## Choose the save mode

For an entire-deck request, call `ask_user` before changing files with exactly these choices:

1. `新增一个 PPT` (default): create a sibling result beside the current PPT.
2. `直接修改当前 PPT`: edit the current PPT in place and rely on file history for recovery.

Allow an optional natural-language note in the same question. If the question is skipped or times out, use `新增一个 PPT` and an empty note.

Name a new sibling PPT as `原文件名-模板展示名`, using the platform display name rather than `template_code`, and keep the original extension. If that name already exists, append `-2`, then `-3`, and so on. Example: `季度汇报-商务蓝.html` already exists, so the next file is `季度汇报-商务蓝-2.html`.

For a single-slide or explicit page-range request, do not ask this save-mode question. Modify only the requested pages in the current PPT.

## Install and inspect the template

Reuse the installation and resource rules from `slide-template`:

1. Call `install_slides_template` with the exact `template_code`.
2. Read `template.json` first.
3. Resolve CSS, visual specifications, representative slides, fonts, images, and other assets only from the files declared by `template.json`.
4. Read `theme.css` and `visual-spec.md` when present.
5. Never leave generated slides referencing the temporary installation directory.

## Apply the template

- Keep each target page on its original canvas. Read `data-width` / `data-height` or the equivalent fixed CSS size from the current PPT, then keep that width, height, and aspect ratio. Do not force `1920x1080`, and do not resize the original PPT to the template's canvas.
- Preserve the original PPT's text, images, chart data, links, interaction scripts, `data-slot` semantics, page count, and page order unless the user's note requests a change.
- Copy required visual assets into the project. Do not copy template sample logos, fake people, fake data, placeholder dashboards, or QR codes into user content.
- Leave `index.html`, `magic.project.js`, and `slide-bridge.js` unchanged unless the chosen save mode requires a new sibling project, and even then copy them as project infrastructure rather than rewriting their page list.
- For a single-slide or page-range request, isolate the new theme on those pages: write the new styles into the page HTML or a page-specific stylesheet. Do not change the shared `theme.css` or font list unless that change cannot affect other pages. A mixed result is allowed: requested pages use the new template, and every other page stays on the old template. Do not rewrite unrelated pages to make the deck look uniform.
- For a new-deck request, copy the current project into the sibling result before applying the selected template. The original PPT remains unchanged.
- For an in-place request, save a recoverable file-history version before replacing content. Do not create an additional result file.

## Verify and report

Before saving, check that the resulting HTML project still has the expected slide count, requested page scope, original canvas size, text/image/chart-data presence, local resource references, and valid template assets. If installation, parsing, rendering, or saving fails, do not silently overwrite the original content; report the concrete failure and the available retry/recovery path.

Report the selected template display name and exact code, save mode, affected page numbers, original canvas size, and resulting file/version. Do not expose temporary installation paths.
