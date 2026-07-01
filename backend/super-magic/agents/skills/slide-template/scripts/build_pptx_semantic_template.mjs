#!/usr/bin/env node

import { access, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  buildSemanticPagePlan,
  buildSemanticTemplatePages,
  buildSemanticTemplatePagesJson,
  buildSemanticVisualSpec,
} from "./pptx_template_semantics.mjs";
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
    "node scripts/build_pptx_semantic_template.mjs --source-dir /path/extraction-output --output-dir /path/template-output",
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
  return singleQuoted ? singleQuoted[1] : "";
}

function readDataHtml(value) {
  const match = String(value || "").match(/^data:text\/html(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) return "";
  return match[1] ? Buffer.from(match[2] || "", "base64").toString("utf8") : decodeURIComponent(match[2] || "");
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

function extractBody(html) {
  const match = String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : String(html || "");
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function addSemanticMainClasses(html, page) {
  return String(html || "").replace(/<main\b([^>]*)class="([^"]*)"([^>]*)>/i, (_, beforeClass, classes, afterClass) => {
    const next = new Set(String(classes).split(/\s+/).filter(Boolean));
    for (const className of page.core_css_classes) next.add(className);
    return `<main${beforeClass}class="${[...next].join(" ")}"${afterClass} data-template-layout="${page.layout_kind}" data-template-title="${escapeAttribute(page.source_title)}">`;
  });
}

function replaceHeadWithLink(html, href) {
  const withoutStyle = String(html || "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  if (/<\/head>/i.test(withoutStyle)) {
    return withoutStyle.replace(/<\/head>/i, `  <link rel="stylesheet" href="${href}">\n</head>`);
  }
  return withoutStyle.replace(/<body/i, `<head><link rel="stylesheet" href="${href}"></head>\n<body`);
}

function replaceHeadWithLinks(html, hrefs) {
  const links = hrefs.map((href) => `  <link rel="stylesheet" href="${href}">`).join("\n");
  const withoutStyle = String(html || "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  if (/<\/head>/i.test(withoutStyle)) {
    return withoutStyle.replace(/<\/head>/i, `${links}\n</head>`);
  }
  return withoutStyle.replace(/<body/i, `<head>${links}</head>\n<body`);
}

function rewriteResourceRefs(html, { assetsPrefix }) {
  return String(html || "")
    .replaceAll('src="assets/', `src="${assetsPrefix}`)
    .replaceAll("src='assets/", `src='${assetsPrefix}`)
    .replaceAll('href="assets/', `href="${assetsPrefix}`)
    .replaceAll("href='assets/", `href='${assetsPrefix}`);
}

function buildThemeCss() {
  return [
    ":root {",
    "  --pptx-primary-blue: rgba(60,111,241,1);",
    "  --pptx-deep-blue: rgba(41,80,177,1);",
    "  --pptx-accent-green: rgba(26,186,139,1);",
    "  --pptx-text: rgb(38, 38, 38);",
    "  --pptx-bg: rgb(255, 255, 255);",
    "}",
    ".template-page { color: var(--pptx-text); background: var(--pptx-bg); }",
    ".layout-cover, .layout-closing { background: var(--pptx-bg); }",
    ".layout-section { background: var(--pptx-bg); }",
    ".layout-metrics, .layout-chart { background: var(--pptx-bg); }",
    ".layout-gallery, .layout-image-content, .layout-content, .layout-multi-item { background: var(--pptx-bg); }",
    ".template-page .shape-accent { pointer-events: none; }",
    ".template-page .image-frame { object-fit: cover; }",
    ".template-page-index { font-family: Arial, sans-serif; color: var(--pptx-text); }",
    ".template-page-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; padding: 0; list-style: none; }",
    ".template-page-list a { display: block; color: inherit; text-decoration: none; border: 1px solid rgba(60,111,241,0.24); padding: 12px; background: #fff; }",
    ".template-page-list strong { display: block; margin-bottom: 6px; }",
    "",
  ].join("\n");
}

function buildSourceCss(sourceThemeCss, iframeCss, presentation) {
  const scaledSourceThemeCss = scaleCssText(sourceThemeCss, presentation);
  const scaledIframeCss = iframeCss.map((css) => scaleCssText(css, presentation));
  const iframeBlock = scaledIframeCss.length ? `\n/* Flattened iframe styles */\n${[...new Set(scaledIframeCss)].join("\n")}\n` : "";
  return `${String(scaledSourceThemeCss || "").trimEnd()}${iframeBlock}\n`;
}

function stripEmptyTextWrappers(html) {
  return String(html || "").replace(
    /<div\b([^>]*\bclass="[^"]*\btext-wrapper\b[^"]*"[^>]*)>\s*(?:<div\b[^>]*>\s*)?<p\b[^>]*>\s*<span\b[^>]*>(?:&nbsp;|\s)*<\/span>\s*<\/p>\s*(?:<\/div>\s*)?<\/div>/gi,
    "",
  );
}

function slotAttrs(slot) {
  return ` data-slot="${escapeAttribute(slot.name)}" data-slot-type="${escapeAttribute(slot.type || "text")}"`;
}

function applyImageSlots(html, slots) {
  let index = 0;
  const imageSlots = (slots || []).filter((slot) => slot.type === "image");
  return String(html || "").replace(/<img\b(?![^>]*\bdata-slot=)([^>]*)>/gi, (match, attrs) => {
    const slot = imageSlots[index];
    if (!slot) return match;
    index += 1;
    return `<img${slotAttrs(slot)}${attrs}>`;
  });
}

function plainTextFromHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyTextSlots(html, slots) {
  let index = 0;
  const textSlots = (slots || []).filter((slot) => slot.type !== "image");
  return String(html || "").replace(/<span\b(?![^>]*\bdata-slot=)([^>]*)>([\s\S]*?)<\/span>/gi, (match, attrs, content) => {
    const text = plainTextFromHtml(content);
    if (!text) return match;
    const slot = textSlots[index];
    if (!slot) return match;
    index += 1;
    return `<span${slotAttrs(slot)}${attrs}>${content}</span>`;
  });
}

function applySlots(html, page) {
  return applyTextSlots(applyImageSlots(html, page.slots || []), page.slots || []);
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

async function buildPages({ source, output, payload, sourcePreviewHtml }) {
  const pagesDir = resolve(output, "pages");
  await mkdir(pagesDir, { recursive: true });
  const llmPagePlanPath = resolve(source, "llm-page-plan.json");
  const llmPagePlan = await pathExists(llmPagePlanPath)
    ? JSON.parse(await readFile(llmPagePlanPath, "utf8"))
    : null;
  const llmVisualSpecJsonPath = resolve(source, "llm-visual-spec.json");
  const llmVisualSpecJson = await pathExists(llmVisualSpecJsonPath)
    ? JSON.parse(await readFile(llmVisualSpecJsonPath, "utf8"))
    : null;
  const pagePlan = buildSemanticPagePlan(payload, llmPagePlan, llmVisualSpecJson);
  const flattenedSource = flattenIframes(sourcePreviewHtml);
  const pages = [];

  for (const page of pagePlan) {
    const sourceHtmlPath = page.cleaned_html_path ? resolve(source, page.cleaned_html_path) : null;
    const sourceHtml = sourceHtmlPath && (await pathExists(sourceHtmlPath))
      ? await readFile(sourceHtmlPath, "utf8")
      : flattenedSource.html;
    const pageName = page.file.replace(/^pages\//, "");
    const html = rewriteResourceRefs(
      applySlots(stripEmptyTextWrappers(addSemanticMainClasses(replaceHeadWithLinks(sourceHtml, ["../theme.css", "../source.css"]), page)), page),
      { assetsPrefix: "../assets/" },
    );
    const scaledHtml = scaleCanvasText(html, payload.presentation);
    await writeFile(resolve(pagesDir, pageName), scaledHtml, "utf8");
    pages.push({ ...page, html: scaledHtml });
  }

  return {
    pages,
    iframe_css: flattenedSource.css,
    flattened_iframe_count: flattenedSource.count,
    classification_source: llmPagePlan ? "llm-page-plan.json" : "deterministic",
  };
}

async function buildTemplate({ sourceDir, outputDir }) {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  await mkdir(output, { recursive: true });
  await rm(resolve(output, "pages"), { recursive: true, force: true });
  await rm(resolve(output, "assets"), { recursive: true, force: true });
  await rm(resolve(output, "preview.html"), { force: true });

  const payload = JSON.parse(await readFile(resolve(source, "pptx-template-brief.json"), "utf8"));
  const sourcePreviewHtml = await readFile(resolve(source, payload.source_bundle.preview_html), "utf8");
  const themeCssPath = payload.source_bundle.cleaned_theme_css && (await pathExists(resolve(source, payload.source_bundle.cleaned_theme_css)))
    ? resolve(source, payload.source_bundle.cleaned_theme_css)
    : resolve(source, payload.source_bundle.theme_css);
  const sourceThemeCss = await readFile(themeCssPath, "utf8");
  const pageBuild = await buildPages({ source, output, payload, sourcePreviewHtml });
  const transforms = {
    flattened_iframe_count: pageBuild.flattened_iframe_count,
  };
  const llmVisualSpecPath = resolve(source, "llm-visual-spec.md");
  const llmVisualSpec = await pathExists(llmVisualSpecPath)
    ? await readFile(llmVisualSpecPath, "utf8")
    : "";
  const visualSpec = buildSemanticVisualSpec(payload, pageBuild.pages, transforms, { llmVisualSpec });

  await writeFile(resolve(output, "visual-spec.md"), visualSpec.endsWith("\n") ? visualSpec : `${visualSpec}\n`, "utf8");
  await writeFile(resolve(output, "theme.css"), buildThemeCss(), "utf8");
  await writeFile(resolve(output, "source.css"), buildSourceCss(sourceThemeCss, pageBuild.iframe_css, payload.presentation), "utf8");
  await writeFile(resolve(output, "template-pages.md"), buildSemanticTemplatePages(pageBuild.pages), "utf8");
  await writeFile(
    resolve(output, "template-pages.json"),
    `${JSON.stringify(buildSemanticTemplatePagesJson({
      pages: pageBuild.pages,
      classificationSource: pageBuild.classification_source,
    }), null, 2)}\n`,
    "utf8",
  );
  const copiedAssets = await copyAssets(source, output);
  const archive = await writeTemplateZip({
    outputDir: output,
    sourceDir: source,
    payload,
    mode: "semantic",
  });

  return {
    output_dir: output,
    files: ["visual-spec.md", "theme.css", "source.css", "template-pages.md", "template-pages.json", "pages/*.html"],
    copied_assets: copiedAssets,
    source: basename(source),
    mode: "semantic",
    visual_spec_source: await pathExists(llmVisualSpecPath) ? "llm-visual-spec.md" : "deterministic-fallback",
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
        error: "failed to build pptx semantic template",
        message: error?.message || String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
