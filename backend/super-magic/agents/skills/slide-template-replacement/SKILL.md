---
name: slide-template-replacement
description: "Replace the visual template of an existing HTML slide project while preserving its content. Use when a user asks to change, apply, or replace a PPT template for an existing project or a specific slide and provides a template_code or a template selected from the template picker. Do not use for creating templates or converting native PPTX files."
---

# Slide Template Replacement

Use this skill when the input asks to apply an existing platform template to an existing HTML slide project. The frontend command includes the exact `template_code`, the current PPT file and folder mentions, and either an entire-deck scope or a target slide scope.

## Supported input

- Only existing HTML slide projects are supported. Do not treat native `.pptx`, `.ppt`, `.potx`, `.pot`, or `.ppsx` files as editable HTML projects.
- Require an exact `template_code` from the platform template picker or upstream context. Never infer a code from a display name, URL, or local directory.
- Resolve the current PPT, its containing folder, and the target slide from the structured `@` mentions supplied by the user interface. Do not ask the user to select those nodes again unless a mention is missing or ambiguous.
- The user may append natural-language requirements. Treat those requirements as authoritative for the requested scope, including explicit content edits.

## Choose the save mode

For an entire-deck request, call `ask_user` before changing files with exactly these choices:

1. `新增一个 PPT` (default): create a result beside the current PPT, using the name `原文件名-模板名` and the existing naming-conflict behavior.
2. `直接修改当前 PPT`: edit the current PPT in place and rely on the existing file-history mechanism for recovery.

Allow an optional natural-language note in the same question. If the question is skipped or times out, use `新增一个 PPT` and an empty note.

For a single-slide request, do not ask this save-mode question. Modify the referenced slide in the current PPT directly, keep every other slide unchanged, and use the target page number/path from the structured context.

## Install and inspect the template

Reuse the installation and resource rules from `slide-template`:

1. Call `install_slides_template` with the exact `template_code`.
2. Read `template.json` first.
3. Resolve CSS, visual specifications, representative slides, fonts, images, and other assets only from the files declared by `template.json`.
4. Read `theme.css` and `visual-spec.md` when present.
5. Never leave generated slides referencing the temporary installation directory.

## Apply the template

- Preserve the original PPT's text and image content by default. Replace visual styling and layout: theme CSS, typography, spacing, colors, backgrounds, decorations, and layout rules declared by the selected template.
- Preserve page count, page order, links, interaction scripts, `data-slot` semantics, and project-local asset references unless the user's explicit note requests a change.
- For a single-slide request, limit writes to the target slide and required shared style resources; do not rewrite unrelated pages.
- For a new-deck request, copy the current project content into the sibling result before applying the selected template. The original PPT remains unchanged.
- For an in-place request, save a recoverable file-history version before replacing content. Do not create an additional result file.
- Keep all slides fixed at 1920x1080 and use project-local CSS and assets.

## Verify and report

Before saving, check that the resulting HTML project still has the expected slide count, target scope, text/image presence, local resource references, and valid template assets. If installation, parsing, rendering, or saving fails, do not silently overwrite the original content; report the concrete failure and the available retry/recovery path.

Report the selected template name and exact code, save mode, affected page count, and resulting file/version. Do not expose temporary installation paths.
