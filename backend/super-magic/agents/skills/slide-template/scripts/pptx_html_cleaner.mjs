import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  applySvgPolicy,
  initializeSvgOptimization,
  minifyInlineSvgs,
  svgOptimizationPayload,
} from "./pptx_svg_cleaner.mjs";

function normalizeAssetRefs(value) {
  return String(value || "").replaceAll("../assets/", "assets/");
}

function normalizeStyleValue(value) {
  return normalizeAssetRefs(String(value || "").trim().replace(/\s+/g, " "));
}

function readInlineStyle(element) {
  const style = element.style;
  const declarations = {};
  for (let index = 0; index < style.length; index += 1) {
    const property = String(style.item(index) || style[index] || "").trim().toLowerCase();
    if (!property) continue;
    const value = normalizeStyleValue(style.getPropertyValue(property));
    if (!value) continue;
    const priority = style.getPropertyPriority(property);
    declarations[property] = priority ? `${value} !${priority}` : value;
  }
  const entries = Object.entries(declarations).sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([property, value]) => `${property}: ${value};`).join(" ");
}

function roleForElement(element, patternId) {
  const tag = element.tagName.toLowerCase();
  const text = String(element.textContent || "").trim();
  if (tag === "img" || tag === "image") return "image-frame";
  if (tag === "table") return "table-shell";
  if (tag === "svg") return "chart-shell";
  if (["path", "rect", "circle", "ellipse", "line", "polygon", "polyline"].includes(tag)) return "shape-accent";
  if (text && text.length <= 90 && /title|cover|section|contents/i.test(patternId)) return "text-title";
  if (text) return text.length <= 90 ? "text-title" : "text-body";
  return "layout-block";
}

function addClass(element, className) {
  const existing = (element.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  if (!existing.includes(className)) existing.push(className);
  element.setAttribute("class", existing.join(" "));
}

function normalizeCssText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/:\s+/g, ": ").trim();
}

function preserveStyleAttribute(element) {
  const style = normalizeCssText(element.getAttribute("style") || "");
  if (style) {
    element.setAttribute("style", style);
  }
}

function ensureStyleClass({ element, styleText, role, registry, summary }) {
  if (!styleText) return null;
  if (!registry.has(styleText)) {
    const count = [...registry.values()].filter((item) => item.role === role).length + 1;
    const className = `${role}-${String(count).padStart(3, "0")}`;
    registry.set(styleText, { className, role, styleText });
  }
  const item = registry.get(styleText);
  addClass(element, item.className);
  if (!summary.has(role)) summary.set(role, new Set());
  summary.get(role).add(item.className);
  return item.className;
}

function collectPlaceholders(root) {
  const placeholders = [];
  let textIndex = 0;
  let imageIndex = 0;
  for (const element of root.querySelectorAll("*")) {
    const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
    if (text && element.children.length === 0 && text.length <= 160) {
      textIndex += 1;
      placeholders.push({
        id: `text_${String(textIndex).padStart(2, "0")}`,
        type: "text",
        sample: text,
      });
    }
    if (element.tagName.toLowerCase() === "img" && element.getAttribute("data-source-svg") !== "externalized") {
      imageIndex += 1;
      placeholders.push({
        id: `image_${String(imageIndex).padStart(2, "0")}`,
        type: "image",
        sample: element.getAttribute("src") || "",
      });
    }
  }
  return placeholders.slice(0, 40);
}

function stripNoise(doc) {
  doc.querySelectorAll("script, noscript").forEach((element) => element.remove());
  doc.querySelectorAll("*").forEach((element) => {
    if (element.children.length === 0 && !String(element.textContent || "").trim() && element.attributes.length === 0) {
      element.remove();
    }
  });
}

function slideRootFromDocument(doc) {
  return doc.querySelector(".pptx-slide") || doc.querySelector(".slide-page") || doc.body;
}

function collectStyleBlocks(doc) {
  return [...doc.querySelectorAll("style")]
    .map((style) => normalizeAssetRefs(style.textContent || "").trim())
    .filter(Boolean);
}

function semanticSummary(classSummary) {
  return [...classSummary.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, classNames]) => ({
      role,
      class_names: [...classNames].sort(),
      count: classNames.size,
    }));
}

function normalizeCanvas(canvas) {
  const width = Number(canvas?.width || 960);
  const height = Number(canvas?.height || 540);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 960,
    height: Number.isFinite(height) && height > 0 ? height : 540,
  };
}

function formatPx(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}px`;
}

function buildCss(styleRegistry, canvas, rendererCssBlocks = [], sharedRendererCss = "") {
  const resolvedCanvas = normalizeCanvas(canvas);
  const rules = [
    "html, body { margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, sans-serif; }",
    `.slide-page { width: ${formatPx(resolvedCanvas.width)}; height: ${formatPx(resolvedCanvas.height)}; position: relative; overflow: hidden; box-sizing: border-box; background: #fff; }`,
    ".slide-page * { box-sizing: border-box; }",
    ".layout-cover, .layout-section, .layout-content, .layout-image, .layout-table, .layout-chart, .layout-comparison, .layout-timeline, .layout-process, .layout-contents, .layout-multi-column-content { position: relative; }",
    ".text-title { font-weight: 700; }",
    ".text-body { font-weight: 400; }",
    ".image-frame img, img.image-frame { max-width: 100%; display: block; }",
    ".table-shell { border-collapse: collapse; }",
    ".chart-shell { overflow: visible; }",
    ".shape-accent { pointer-events: none; }",
  ];
  if (sharedRendererCss) {
    rules.push("/* pptx-html-renderer shared CSS */");
    rules.push(normalizeAssetRefs(sharedRendererCss).trim());
  }
  if (rendererCssBlocks.length > 0) {
    rules.push("/* pptx-html-renderer per-slide CSS */");
    rules.push(...rendererCssBlocks);
  }
  for (const item of styleRegistry.values()) {
    rules.push(`.${item.className} { ${item.styleText} }`);
  }
  return `${rules.join("\n")}\n`;
}

function rewriteCssForNestedSlide(css) {
  return String(css || "").replace(/(^|[\s("'=])assets\//g, "$1../assets/");
}

function makeStandaloneHtml({ title, bodyHtml, css }) {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `  <title>${title}</title>`,
    "  <style>",
    css.trimEnd(),
    "  </style>",
    "</head>",
    "<body>",
    bodyHtml,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export async function writeCleanedSlides({ outputDir, renderedSlides, slides, canvas }) {
  const cleanedDir = resolve(outputDir, "cleaned-slides");
  await mkdir(cleanedDir, { recursive: true });
  const slideByIndex = new Map(slides.map((slide) => [slide.index, slide]));
  const styleRegistry = new Map();
  const classSummary = new Map();
  const cleanedSlides = [];
  const inlineStyleExceptions = [];
  const svgAssets = [];
  const sharedRendererCss = await readFile(resolve(outputDir, "assets", "slides.css"), "utf8").catch(() => "");
  const rendererCssBlocks = new Set();

  for (const rendered of renderedSlides) {
    const slide = slideByIndex.get(rendered.index);
    const patternId = slide?.page_pattern?.id || "content";
    const doc = new DOMParser().parseFromString(normalizeAssetRefs(rendered.html), "text/html");
    stripNoise(doc);
    const sourceRoot = slideRootFromDocument(doc);
    collectStyleBlocks(doc).forEach((css) => rendererCssBlocks.add(css));
    const layoutClass = `layout-${patternId}`;
    const stage = doc.createElement("main");
    stage.setAttribute("class", `slide-page ${layoutClass}`);
    stage.setAttribute("data-source-slide", String(rendered.index + 1));
    stage.setAttribute("data-page-pattern", patternId);
    stage.innerHTML = sourceRoot.outerHTML || sourceRoot.innerHTML || "";
    const svgOptimization = initializeSvgOptimization();
    minifyInlineSvgs(stage, svgOptimization);

    for (const element of stage.querySelectorAll("*")) {
      const role = roleForElement(element, patternId);
      if (["text-title", "text-body", "image-frame", "table-shell", "chart-shell", "shape-accent"].includes(role)) {
        addClass(element, role);
      }
      const styleText = readInlineStyle(element);
      const className = ensureStyleClass({ element, styleText, role, registry: styleRegistry, summary: classSummary });
      if (styleText && className) {
        preserveStyleAttribute(element);
      }
    }

    svgAssets.push(...await applySvgPolicy({
      stage,
      outputDir,
      slideIndex: rendered.index,
      summary: svgOptimization,
    }));

    const bodyHtml = stage.outerHTML;
    const css = rewriteCssForNestedSlide(buildCss(styleRegistry, canvas, [...rendererCssBlocks], sharedRendererCss));
    const html = makeStandaloneHtml({ title: `Cleaned Slide ${rendered.index + 1}`, bodyHtml, css });
    const outputPath = resolve(cleanedDir, `slide-${rendered.index + 1}.html`);
    await writeFile(outputPath, html, "utf8");
    cleanedSlides.push({
      index: rendered.index,
      cleaned_html_path: relative(outputDir, outputPath),
      structure_summary: {
        root_class: "slide-page",
        layout_class: layoutClass,
        semantic_class_count: stage.querySelectorAll("[class]").length,
      },
      placeholder_candidates: collectPlaceholders(stage),
      svg_optimization: svgOptimizationPayload(svgOptimization),
    });
  }

  const cleanedThemeCss = buildCss(styleRegistry, canvas, [...rendererCssBlocks], sharedRendererCss);
  await writeFile(resolve(outputDir, "cleaned-theme.css"), cleanedThemeCss, "utf8");

  return {
    cleaned_theme_css: "cleaned-theme.css",
    cleaned_html: {
      output_dir: "cleaned-slides",
      slide_count: cleanedSlides.length,
      semantic_class_summary: semanticSummary(classSummary),
      inline_style_exceptions: inlineStyleExceptions,
      svg_handling: "tiered_inline_and_externalized_svg",
      page_retention: {
        strategy: "preserve_all_source_slides",
        kept_slide_indexes: cleanedSlides.map((slide) => slide.index),
      },
    },
    cleaned_slides: cleanedSlides,
    svg_assets: svgAssets,
  };
}
