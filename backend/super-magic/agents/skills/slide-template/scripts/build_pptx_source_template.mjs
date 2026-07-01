#!/usr/bin/env node

import { access, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { scaleCanvasText, scaleCssText } from "./pptx_canvas_scale.mjs";
import { writeTemplateZip } from "./pptx_template_zip.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--source-dir") {
      args.sourceDir = value;
      i += 1;
    } else if (key === "--output-dir") {
      args.outputDir = value;
      i += 1;
    } else if (key === "--help" || key === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "node scripts/build_pptx_source_template.mjs --source-dir /path/extraction-output --output-dir /path/template-output",
  ].join("\n");
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readAttribute(attributes, name) {
  const doubleQuoted = new RegExp(`\\s${name}\\s*=\\s*"([\\s\\S]*?)"`, "i").exec(attributes);
  if (doubleQuoted) return doubleQuoted[1];
  const singleQuoted = new RegExp(`\\s${name}\\s*=\\s*'([\\s\\S]*?)'`, "i").exec(attributes);
  if (singleQuoted) return singleQuoted[1];
  return "";
}

function readDataHtml(value) {
  const match = String(value || "").match(/^data:text\/html(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) return "";
  const body = match[2] || "";
  if (match[1]) {
    return Buffer.from(body, "base64").toString("utf8");
  }
  return decodeURIComponent(body);
}

function extractFrameBodyAndCss(html) {
  const css = [];
  const withoutStyles = String(html || "").replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, cssText) => {
    const normalized = String(cssText || "").trim();
    if (normalized) css.push(normalized);
    return "";
  });
  const bodyMatch = withoutStyles.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch
    ? bodyMatch[1]
    : withoutStyles
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<html\b[^>]*>|<\/html>/gi, "")
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  return { body: body.trim(), css };
}

function flattenIframes(html) {
  const iframeCss = [];
  let flattenedCount = 0;
  const flattenedHtml = String(html || "").replace(/<iframe\b([^>]*)>[\s\S]*?<\/iframe>/gi, (match, attributes) => {
    const srcdoc = readAttribute(attributes, "srcdoc");
    const src = readAttribute(attributes, "src");
    const frameHtml = srcdoc ? decodeHtmlAttribute(srcdoc) : readDataHtml(decodeHtmlAttribute(src));
    if (!frameHtml) return match;

    const extracted = extractFrameBodyAndCss(frameHtml);
    iframeCss.push(...extracted.css);
    flattenedCount += 1;
    return `<div class="flattened-iframe" data-flattened-iframe="true">${extracted.body}</div>`;
  });

  return { html: flattenedHtml, css: iframeCss, count: flattenedCount };
}

function buildThemeCss(sourceThemeCss, iframeCss, presentation) {
  const scaledSourceThemeCss = scaleCssText(sourceThemeCss, presentation);
  const scaledIframeCss = iframeCss.map((css) => scaleCssText(css, presentation));
  if (scaledIframeCss.length === 0) return scaledSourceThemeCss;
  return [
    scaledSourceThemeCss.trimEnd(),
    "",
    "/* Flattened iframe styles */",
    ...[...new Set(scaledIframeCss)],
    "",
  ].join("\n");
}

function buildPreviewHtml(sourcePreviewHtml) {
  const flattened = flattenIframes(sourcePreviewHtml);
  return {
    html: flattened.html.replace('href="source-theme.css"', 'href="theme.css"'),
    iframe_css: flattened.css,
    flattened_iframe_count: flattened.count,
  };
}

function replaceHeadStyleWithLink(html, href) {
  const withoutStyle = String(html || "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  if (/<\/head>/i.test(withoutStyle)) {
    return withoutStyle.replace(/<\/head>/i, `  <link rel="stylesheet" href="${href}">\n</head>`);
  }
  return withoutStyle.replace(/<body/i, `<head><link rel="stylesheet" href="${href}"></head>\n<body`);
}

function extractBody(html) {
  const match = String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : html;
}

function buildPreviewIndex({ payload, pages }) {
  const sections = pages.map((page) => {
    const body = extractBody(page.html).replaceAll("../assets/", "assets/");
    return [
      `<section class="template-page-preview" data-page-file="${page.file}">`,
      `  <header class="template-page-meta"><a href="${page.file}">${page.file}</a> · ${page.layout_name}</header>`,
      body,
      "</section>",
    ].join("\n");
  });
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `  <title>${payload.source.name} Template Pages</title>`,
    "  <link rel=\"stylesheet\" href=\"theme.css\">",
    "  <style>",
    "    body { margin: 0; padding: 32px; background: #f3f4f6; }",
    "    .template-page-preview { display: grid; gap: 10px; margin-bottom: 32px; }",
    "    .template-page-meta { font: 13px Arial, sans-serif; color: #4b5563; }",
    "  </style>",
    "</head>",
    "<body>",
    sections.join("\n"),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function buildTemplatePagesMarkdown(payload, pages) {
  const rows = pages.length
    ? pages
        .map((page) => `| ${page.file} | ${page.layout_name} | ${page.source_slides} | ${page.use_case} | ${page.core_css_classes} | ${page.placeholder_fields} | ${page.asset_dependencies} |`)
        .join("\n")
    : "| none | none | none | none | none | none | none |";
  return [
    "# PPTX Template Pages",
    "",
    "This fallback mapping records the multi HTML page package generated from cleaned PPTX evidence. It is a debug/source-preserved scaffold; the default workflow should use LLM style/layout consolidation.",
    "",
    "| Page File | Layout Type | Source Slides | Use Case | Core CSS Classes | Placeholder Fields | Asset Dependencies |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    "## Format Compatibility",
    "",
    "- Three-file template: `visual-spec.md`, `theme.css`, `preview.html`.",
    "- Multi HTML page package: `theme.css`, `pages/*.html`, `template-pages.md`.",
    "- `theme.css` is shared by `preview.html` and `pages/*.html`.",
    "",
  ].join("\n");
}

function buildVisualSpec(payload, sourceTransforms) {
  const colorRows = payload.theme.colors.length
    ? payload.theme.colors.map((item) => `| ${item.value} | ${item.count} |`).join("\n")
    : "| none | 0 |";
  const fontRows = payload.theme.fonts.length
    ? payload.theme.fonts.map((item) => `| ${item.name} | ${item.count} |`).join("\n")
    : "| none | 0 |";
  const patternRows = payload.page_patterns.length
    ? payload.page_patterns
        .map((pattern) => `| ${pattern.id} | ${pattern.name} | ${pattern.source_slide_indexes.map((index) => index + 1).join(", ")} | ${pattern.layout_signature} | ${pattern.style_tokens.join(", ")} |`)
        .join("\n")
    : "| none | none | none | none | none |";
  const risks = payload.risks.length ? payload.risks.map((item) => `- ${item}`).join("\n") : "- None";

  return [
    "# PPTX Source-Preserved Fallback Template",
    "",
    `Source file: ${payload.source.name}`,
    "",
    "This fallback template was assembled from `source-preview.html`, `source-theme.css`, and `pptx-template-brief.json` for debugging or recovery. The default PPTX conversion workflow should use LLM style/layout consolidation before producing the final platform template.",
    "",
    "## Output Files",
    "",
    "- `visual-spec.md`: this mapping document.",
    "- `theme.css`: copied from `cleaned-theme.css` when available, otherwise from `source-theme.css`.",
    "- `preview.html`: page-package index and three-file preview scaffold.",
    "- `pages/*.html`: independent multi HTML page package files.",
    "- `template-pages.md`: page-to-layout mapping for the multi HTML page package.",
    "- `assets/images/`: copied migrated PPTX image resources.",
    "",
    "## Canvas",
    "",
    `- Width: ${payload.presentation.canvas.width}`,
    `- Height: ${payload.presentation.canvas.height}`,
    `- Aspect ratio: ${payload.presentation.canvas.aspect_ratio}`,
    "",
    "## Colors",
    "",
    "| Color | Count |",
    "| --- | ---: |",
    colorRows,
    "",
    "## Fonts",
    "",
    "| Font | Count |",
    "| --- | ---: |",
    fontRows,
    "",
    "## Layout Types",
    "",
    "| Layout ID | Name | Source Slides | Signature | Style Tokens |",
    "| --- | --- | --- | --- | --- |",
    patternRows,
    "",
    "## Source Preservation Rules",
    "",
    "- Every rendered slide is represented either in `pages/*.html` from `cleaned-slides/` or in source fallback pages.",
    "- CSS rules from cleaned semantic evidence are copied into `theme.css` when available.",
    "- `preview.html` is not the only template page carrier; it indexes the page package and remains compatible with the three-file format.",
    `- Flattened iframes: ${sourceTransforms.flattened_iframe_count}. Readable iframe HTML is merged into \`preview.html\`, and iframe \`<style>\` content is appended to \`theme.css\`.`,
    "- Migrated images are local files under `assets/images/` and should remain local.",
    "- `visual-spec.md` records the page index and source signals only; it does not redefine or abstract the template system.",
    "",
    "## Risks",
    "",
    risks,
    "",
  ].join("\n");
}

async function copyAssets(sourceDir, outputDir) {
  const sourceAssets = resolve(sourceDir, "assets");
  const outputAssets = resolve(outputDir, "assets");
  if (!(await pathExists(sourceAssets))) return false;
  const sourceStats = await stat(sourceAssets);
  if (!sourceStats.isDirectory()) return false;
  await cp(sourceAssets, outputAssets, { recursive: true });
  return true;
}

async function buildPagePackage({ source, output, payload, sourcePreviewHtml }) {
  const pagesDir = resolve(output, "pages");
  await mkdir(pagesDir, { recursive: true });
  let candidates = payload.page_package_candidates?.length
    ? payload.page_package_candidates
    : payload.page_patterns.map((pattern) => ({
        layout_id: pattern.id,
        layout_name: pattern.name,
        source_slide_indexes: pattern.source_slide_indexes,
        cleaned_html_path: null,
        suggested_page_file: `pages/source-slide-${pattern.source_slide_indexes[0] + 1}.html`,
        core_css_classes: [`layout-${pattern.id}`, "slide-page"],
        placeholder_fields: [],
      }));
  if (candidates.length === 0) {
    candidates = [{
      layout_id: "source-slide",
      layout_name: "Source Slide",
      source_slide_indexes: [0],
      cleaned_html_path: null,
      suggested_page_file: "pages/source-slide-1.html",
      core_css_classes: ["source-slide"],
      placeholder_fields: [],
    }];
  }
  const sourceFallback = buildPreviewHtml(sourcePreviewHtml);
  const pages = [];

  for (const candidate of candidates) {
    const pageFile = candidate.suggested_page_file || `pages/${candidate.layout_id}.html`;
    const pageName = pageFile.replace(/^pages\//, "");
    const sourceHtmlPath = candidate.cleaned_html_path ? resolve(source, candidate.cleaned_html_path) : null;
    const sourceHtml = sourceHtmlPath && (await pathExists(sourceHtmlPath)) ? await readFile(sourceHtmlPath, "utf8") : sourceFallback.html;
    const pageHtml = scaleCanvasText(replaceHeadStyleWithLink(sourceHtml, "../theme.css"), payload.presentation);
    await writeFile(resolve(pagesDir, pageName), pageHtml, "utf8");
    pages.push({
      file: `pages/${pageName}`,
      html: pageHtml,
      layout_name: candidate.layout_name || candidate.layout_id,
      source_slides: (candidate.source_slide_indexes || []).map((index) => index + 1).join(", ") || "unknown",
      use_case: candidate.layout_name || candidate.layout_id,
      core_css_classes: (candidate.core_css_classes || []).join(", "),
      placeholder_fields: (candidate.placeholder_fields || []).join(", ") || "none",
      asset_dependencies: "assets/images",
    });
  }

  return pages;
}

async function buildTemplate({ sourceDir, outputDir }) {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  await mkdir(output, { recursive: true });

  const payload = JSON.parse(await readFile(resolve(source, "pptx-template-brief.json"), "utf8"));
  const sourcePreviewHtml = await readFile(resolve(source, payload.source_bundle.preview_html), "utf8");
  const themeCssPath = payload.source_bundle.cleaned_theme_css && (await pathExists(resolve(source, payload.source_bundle.cleaned_theme_css)))
    ? resolve(source, payload.source_bundle.cleaned_theme_css)
    : resolve(source, payload.source_bundle.theme_css);
  const sourceThemeCss = await readFile(themeCssPath, "utf8");
  const sourcePreview = buildPreviewHtml(sourcePreviewHtml);
  const pages = await buildPagePackage({ source, output, payload, sourcePreviewHtml });
  const preview = {
    ...sourcePreview,
    html: buildPreviewIndex({ payload, pages }),
  };

  await writeFile(resolve(output, "visual-spec.md"), buildVisualSpec(payload, preview), "utf8");
  await writeFile(resolve(output, "theme.css"), buildThemeCss(sourceThemeCss, sourcePreview.iframe_css, payload.presentation), "utf8");
  await writeFile(resolve(output, "preview.html"), preview.html, "utf8");
  await writeFile(resolve(output, "template-pages.md"), buildTemplatePagesMarkdown(payload, pages), "utf8");
  const copiedAssets = await copyAssets(source, output);
  const archive = await writeTemplateZip({
    outputDir: output,
    sourceDir: source,
    payload,
    mode: "source-preserved",
  });

  return {
    output_dir: output,
    files: ["visual-spec.md", "theme.css", "preview.html", "template-pages.md", "pages/*.html"],
    copied_assets: copiedAssets,
    source: basename(source),
    template_style: archive.template_style,
    zip_path: archive.zip_path,
    zip_file: archive.zip_file,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.sourceDir || !args.outputDir) {
    throw new Error(usage());
  }
  const result = await buildTemplate({
    sourceDir: args.sourceDir,
    outputDir: args.outputDir,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        error: "failed to build pptx source-preserved template",
        message: error?.message || String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
