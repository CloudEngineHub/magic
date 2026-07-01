#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { convertPptxToHtml } from "../../../../app/tools/pptx_to_html/pptx_to_html_converter.mjs";
import { sandboxRequire } from "../../../../app/tools/pptx_to_html/dom_shims.mjs";
import { writeSourceBundle } from "./pptx_html_source_bundle.mjs";
import { buildLlmGenerationContract } from "./pptx_llm_generation_contract.mjs";
import { writeCleanedSlides } from "./pptx_html_cleaner.mjs";
import { extractSlideSignals, topCounts } from "./pptx_slide_signals.mjs";

function installHtmlParser() {
  if (globalThis.DOMParser && globalThis.XMLSerializer) return;
  const { JSDOM } = sandboxRequire("jsdom", "pptx-html-renderer");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.DOMParser ||= dom.window.DOMParser;
  globalThis.XMLSerializer ||= dom.window.XMLSerializer;
}

function parseArgs(argv) {
  const args = { maxSlides: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--pptx") {
      args.pptx = value;
      i += 1;
    } else if (key === "--output-dir") {
      args.outputDir = value;
      i += 1;
    } else if (key === "--max-slides") {
      args.maxSlides = Number.parseInt(value, 10);
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
    "node scripts/extract_pptx_template_from_html.mjs --pptx /path/template.pptx --output-dir /path/output [--max-slides 8]",
  ].join("\n");
}

function buildPagePatterns(slides) {
  const grouped = new Map();
  for (const slide of slides) {
    const pattern = slide.page_pattern;
    if (!grouped.has(pattern.id)) {
      grouped.set(pattern.id, {
        id: pattern.id,
        name: pattern.name,
        source_slide_indexes: [],
        layout_signature: pattern.layout_signature,
        required_preview: true,
        style_tokens: [],
      });
    }
    const item = grouped.get(pattern.id);
    item.source_slide_indexes.push(slide.index);
    const tokens = [
      pattern.id,
      pattern.layout_signature,
      slide.image_count > 0 ? "image-treatment" : null,
      slide.svg_count > 0 ? "svg-shape-system" : null,
      slide.table_count > 0 ? "table-system" : null,
      slide.text_runs.length > 8 ? "text-hierarchy" : "compact-title",
    ].filter(Boolean);
    item.style_tokens = [...new Set([...item.style_tokens, ...tokens])];
  }
  return [...grouped.values()];
}

function pageFileNameForPattern(patternId, occurrence) {
  if (occurrence === 1) return `pages/${patternId}.html`;
  const suffix = String.fromCharCode(96 + Math.min(occurrence, 26));
  return `pages/${patternId}-variant-${suffix}.html`;
}

function buildPagePackageCandidates(slides, cleanedSlides) {
  const cleanedByIndex = new Map(cleanedSlides.map((slide) => [slide.index, slide]));
  const occurrenceByPattern = new Map();
  return slides.map((slide) => {
    const pattern = slide.page_pattern;
    const occurrence = (occurrenceByPattern.get(pattern.id) || 0) + 1;
    occurrenceByPattern.set(pattern.id, occurrence);
    const cleaned = cleanedByIndex.get(slide.index);
    return {
      layout_id: pattern.id,
      layout_name: pattern.name,
      source_slide_indexes: [slide.index],
      cleaned_html_path: cleaned?.cleaned_html_path || null,
      suggested_page_file: pageFileNameForPattern(pattern.id, occurrence),
      core_css_classes: [`layout-${pattern.id}`, "slide-page"],
      placeholder_fields: (cleaned?.placeholder_candidates || []).map((item) => item.id).slice(0, 12),
      source_page_retention: "keep_original_slide",
    };
  });
}

function writeMarkdown(payload) {
  const colors = payload.theme.colors.map((item) => `${item.value} (${item.count})`).join(", ") || "none";
  const fonts = payload.theme.fonts.map((item) => `${item.name} (${item.count})`).join(", ") || "none";
  const patterns = payload.page_patterns
    .map((item) => `- ${item.name} (${item.id}): slides ${item.source_slide_indexes.join(", ")}`)
    .join("\n");
  const risks = payload.risks.length ? payload.risks.map((item) => `- ${item}`).join("\n") : "- None";

  return [
    "# PPTX HTML Template Brief",
    "",
    `Source: ${payload.source.name}`,
    `Slide count: ${payload.presentation.slide_count}`,
    `Rendered slides: ${payload.html.rendered_slide_count}`,
    `Complete extraction: ${payload.html.is_complete ? "yes" : "no"}`,
    `Canvas: ${payload.presentation.canvas.width} x ${payload.presentation.canvas.height}`,
    `Target canvas: ${payload.presentation.target_canvas.width} x ${payload.presentation.target_canvas.height}`,
    `Scale to target: ${payload.presentation.scale_to_target}`,
    `Source preview: ${payload.source_bundle.preview_html}`,
    `Source CSS: ${payload.source_bundle.theme_css}`,
    `Cleaned CSS: ${payload.source_bundle.cleaned_theme_css}`,
    `Source style rules: ${payload.source_bundle.style_rule_count}`,
    `Cleaned slides: ${payload.cleaned_html.slide_count}`,
    `Style semantic groups: ${payload.style_summary.semantic_groups.map((item) => `${item.role}=${item.count}`).join(", ") || "none"}`,
    `Visual/HTML review required: ${payload.llm_generation_contract.requires_visual_html_review ? "yes" : "no"}`,
    `Migrated images: ${payload.assets.images.length}`,
    `Deduplicated image references: ${payload.assets.duplicate_images.length}`,
    `External resources: ${payload.assets.external_resources.length}`,
    "",
    "## Top Colors",
    colors,
    "",
    "## Font Candidates",
    fonts,
    "",
    "## Page Patterns",
    patterns || "- None",
    "",
    "## Risks",
    risks,
    "",
  ].join("\n");
}

function parseRenderedRoot(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  return doc.querySelector(".pptx-slide") || doc.querySelector("#root") || doc.body || doc.documentElement;
}

async function extract({ pptxPath, outputDir, maxSlides }) {
  installHtmlParser();
  const output = resolve(outputDir);
  const conversion = await convertPptxToHtml({
    pptxPath,
    outputDir: output,
    maxSlides,
  });
  const { payload: htmlPayload, renderedSlides } = conversion;
  const renderCanvas = htmlPayload.presentation.render_canvas;
  const slideCount = htmlPayload.presentation.slide_count;
  const risks = [...htmlPayload.risks];
  const slides = [];
  const assets = htmlPayload.assets;

  for (const rendered of renderedSlides) {
    const htmlPath = resolve(output, "slides-html", `slide-${rendered.index + 1}.html`);
    slides.push(extractSlideSignals(parseRenderedRoot(rendered.html), output, htmlPath, rendered.index));
  }

  const colorCounts = new Map();
  const fontCounts = new Map();
  for (const slide of slides) {
    for (const item of slide.dominant_colors) {
      colorCounts.set(item.value, (colorCounts.get(item.value) || 0) + item.count);
    }
    for (const item of slide.fonts) {
      fontCounts.set(item.name, (fontCounts.get(item.name) || 0) + item.count);
    }
  }

  const pagePatterns = buildPagePatterns(slides);
  const sourceBundle = await writeSourceBundle({
    outputDir: output,
    renderedSlides,
    slides,
    pagePatterns,
    assets,
  });
  const cleanedBundle = await writeCleanedSlides({
    outputDir: output,
    renderedSlides,
    slides,
    canvas: renderCanvas,
  });
  assets.images.push(...(cleanedBundle.svg_assets || []));
  const slidesWithCleanedHtml = slides.map((slide) => {
    const cleaned = cleanedBundle.cleaned_slides.find((item) => item.index === slide.index);
    return {
      ...slide,
      cleaned_html_path: cleaned?.cleaned_html_path || null,
      structure_summary: cleaned?.structure_summary || null,
      placeholder_candidates: cleaned?.placeholder_candidates || [],
    };
  });
  const pagePackageCandidates = buildPagePackageCandidates(slides, cleanedBundle.cleaned_slides);

  const payload = {
    source: {
      name: basename(pptxPath),
      path: resolve(pptxPath),
    },
    presentation: htmlPayload.presentation,
    html: htmlPayload.html,
    output_formats: ["multi_html_page_package"],
    theme: {
      colors: topCounts(colorCounts, "value", 16),
      fonts: topCounts(fontCounts, "name", 16),
    },
    source_bundle: {
      ...sourceBundle,
      cleaned_theme_css: cleanedBundle.cleaned_theme_css,
    },
    cleaned_html: cleanedBundle.cleaned_html,
    style_summary: sourceBundle.style_summary,
    llm_generation_contract: buildLlmGenerationContract(),
    assets,
    page_patterns: pagePatterns,
    page_package_candidates: pagePackageCandidates,
    slides: slidesWithCleanedHtml,
    risks,
  };

  await writeFile(resolve(output, "pptx-template-brief.json"), JSON.stringify(payload, null, 2), "utf8");
  await writeFile(resolve(output, "pptx-template-brief.md"), writeMarkdown(payload), "utf8");
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.pptx || !args.outputDir) {
    throw new Error(usage());
  }
  await extract({
    pptxPath: resolve(args.pptx),
    outputDir: resolve(args.outputDir),
    maxSlides: Number.isFinite(args.maxSlides) ? args.maxSlides : null,
  });
}

main().catch((error) => {
  let pptx = "";
  try {
    pptx = resolve(parseArgs(process.argv.slice(2)).pptx || "");
  } catch {
    pptx = "";
  }
  console.log(
    JSON.stringify(
      {
        error: "failed to extract pptx template from html",
        pptx,
        message: error?.message || String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
