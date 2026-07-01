import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeAssetRefs(value) {
  return String(value || "").replaceAll("../assets/", "assets/");
}

function normalizeStyleText(value) {
  return normalizeAssetRefs(String(value || "").trim().replace(/;?\s*$/, ";"));
}

function normalizeStyleValue(value) {
  return normalizeAssetRefs(String(value || "").trim().replace(/\s+/g, " "));
}

function readElementStyle(element) {
  const declarations = {};
  const style = element.style;
  for (let index = 0; index < style.length; index += 1) {
    const property = String(style.item(index) || style[index] || "").trim().toLowerCase();
    if (!property) continue;
    const value = normalizeStyleValue(style.getPropertyValue(property));
    if (!value) continue;
    const priority = style.getPropertyPriority(property);
    declarations[property] = priority ? `${value} !${priority}` : value;
  }

  const entries = Object.entries(declarations).sort(([left], [right]) => left.localeCompare(right));
  return {
    declarations: Object.fromEntries(entries),
    styleText: entries.map(([property, value]) => `${property}: ${value};`).join(" "),
  };
}

function semanticStyleRole(declarations) {
  const has = (property) => Object.hasOwn(declarations, property);
  if (has("font-size") || has("font-family") || has("text-align") || has("line-height") || has("color")) {
    return "text-run";
  }
  if (has("fill-rule") || has("fill") || has("stroke")) {
    return "svg-shape";
  }
  if (has("position") && has("left") && has("top") && (has("width") || has("height"))) {
    return has("transform") ? "positioned-transform" : "positioned-box";
  }
  if (has("background") || has("background-color")) {
    return "background";
  }
  if (has("margin") || has("padding")) {
    return "spacing";
  }
  if (has("transform")) {
    return "transform";
  }
  if (has("width") || has("height")) {
    return "size";
  }
  return "rule";
}

function parseFragment(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  return doc.body;
}

function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(String(html || ""), "text/html");
}

function slideRootFromDocument(doc) {
  return doc.querySelector(".pptx-slide") || doc.querySelector(".slide-page") || doc.body;
}

function collectStyleBlocks(doc) {
  return [...doc.querySelectorAll("style")]
    .map((style) => normalizeAssetRefs(style.textContent || "").trim())
    .filter(Boolean);
}

function extractInlineStyles(body, styleRegistry) {
  const classNames = new Set();
  const roles = new Set();

  for (const element of body.querySelectorAll("[style]")) {
    const style = readElementStyle(element);
    if (!style.styleText) continue;
    if (!styleRegistry.has(style.styleText)) {
      const role = semanticStyleRole(style.declarations);
      const className = `pptx-style-${role}-${String(styleRegistry.size + 1).padStart(4, "0")}`;
      styleRegistry.set(style.styleText, {
        className,
        role,
        styleText: normalizeStyleText(style.styleText),
      });
    }
    const item = styleRegistry.get(style.styleText);
    classNames.add(item.className);
    roles.add(item.role);
  }

  return {
    classNames: [...classNames].sort(),
    roles: [...roles].sort(),
  };
}

function buildSourcePreview({ renderedSlides, slides, styleRegistry, rendererCssBlocks }) {
  const slideByIndex = new Map(slides.map((slide) => [slide.index, slide]));
  const sections = [];
  const slideStyles = [];

  for (const rendered of renderedSlides) {
    const sourceDoc = parseHtmlDocument(normalizeAssetRefs(rendered.html));
    const slideRoot = slideRootFromDocument(sourceDoc);
    collectStyleBlocks(sourceDoc).forEach((css) => rendererCssBlocks.add(css));
    const body = parseFragment(slideRoot.outerHTML || slideRoot.innerHTML || "");
    const styles = extractInlineStyles(body, styleRegistry);
    if (rendererCssBlocks.size > 0) styles.roles.push("renderer-css");
    const slide = slideByIndex.get(rendered.index);
    const pattern = slide?.page_pattern || {};
    slideStyles.push({
      slide_index: rendered.index,
      page_pattern_id: pattern.id || "unknown",
      style_roles: styles.roles,
      class_names: styles.classNames,
    });
    sections.push([
      `<section class="source-slide" data-source-slide="${rendered.index + 1}" data-page-pattern="${escapeHtml(pattern.id || "unknown")}">`,
      `  <header class="source-slide-meta">Slide ${rendered.index + 1} · ${escapeHtml(pattern.name || "Unknown Page")}</header>`,
      "  <div class=\"source-slide-stage\">",
      body.innerHTML,
      "  </div>",
      "</section>",
    ].join("\n"));
  }

  const html = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "  <title>PPTX Source Preview</title>",
    "  <link rel=\"stylesheet\" href=\"source-theme.css\">",
    "</head>",
    "<body>",
    "  <main class=\"source-preview\">",
    sections.join("\n"),
    "  </main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  return { html, slideStyles };
}

function buildSourceTheme(styleRegistry, rendererCssBlocks, sharedRendererCss) {
  const rules = [
    "html, body { margin: 0; padding: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; }",
    ".source-preview { display: grid; gap: 32px; padding: 32px; box-sizing: border-box; }",
    ".source-slide { display: grid; gap: 10px; }",
    ".source-slide-meta { font-size: 13px; color: #4b5563; }",
    ".source-slide-stage { width: max-content; max-width: 100%; overflow: auto; background: #fff; box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12); }",
  ];

  if (sharedRendererCss) {
    rules.push("/* pptx-html-renderer shared CSS */");
    rules.push(normalizeAssetRefs(sharedRendererCss).trim());
  }

  if (rendererCssBlocks.size > 0) {
    rules.push("/* pptx-html-renderer per-slide CSS */");
    rules.push(...rendererCssBlocks);
  }

  for (const { styleText, className } of styleRegistry.values()) {
    rules.push(`.${className} { ${styleText} }`);
  }

  return `${rules.join("\n")}\n`;
}

function buildStyleSummary(styleRegistry, slideStyles, rendererCssRuleCount) {
  const roleGroups = new Map();
  for (const { role, className } of styleRegistry.values()) {
    if (!roleGroups.has(role)) {
      roleGroups.set(role, { role, count: 0, class_names: [] });
    }
    const group = roleGroups.get(role);
    group.count += 1;
    group.class_names.push(className);
  }
  if (rendererCssRuleCount > 0) {
    roleGroups.set("renderer-css", {
      role: "renderer-css",
      count: rendererCssRuleCount,
      class_names: ["pptx-html-renderer-css"],
    });
  }

  const patternGroups = new Map();
  for (const slide of slideStyles) {
    if (!patternGroups.has(slide.page_pattern_id)) {
      patternGroups.set(slide.page_pattern_id, {
        page_pattern_id: slide.page_pattern_id,
        source_slide_indexes: [],
        style_roles: new Set(),
        class_names: new Set(),
      });
    }
    const group = patternGroups.get(slide.page_pattern_id);
    group.source_slide_indexes.push(slide.slide_index);
    slide.style_roles.forEach((role) => group.style_roles.add(role));
    slide.class_names.forEach((className) => group.class_names.add(className));
  }

  return {
    total_rules: styleRegistry.size + rendererCssRuleCount,
    semantic_groups: [...roleGroups.values()]
      .sort((left, right) => right.count - left.count || left.role.localeCompare(right.role))
      .map((group) => ({
        role: group.role,
        count: group.count,
        class_names: group.class_names.sort().slice(0, 40),
      })),
    page_pattern_style_roles: [...patternGroups.values()]
      .sort((left, right) => left.page_pattern_id.localeCompare(right.page_pattern_id))
      .map((group) => ({
        page_pattern_id: group.page_pattern_id,
        source_slide_indexes: group.source_slide_indexes.sort((left, right) => left - right),
        style_roles: [...group.style_roles].sort(),
        class_names: [...group.class_names].sort().slice(0, 60),
      })),
  };
}

function buildSourceVisualSpec({ slides, pagePatterns, sourceBundle, assets }) {
  const patterns = pagePatterns.length
    ? pagePatterns
        .map((pattern) => `| ${pattern.id} | ${pattern.name} | ${pattern.source_slide_indexes.map((index) => index + 1).join(", ")} | ${pattern.layout_signature} |`)
        .join("\n")
    : "| none | none | none | none |";

  const slideRows = slides
    .map((slide) => `| ${slide.index + 1} | ${slide.page_pattern.id} | ${slide.element_count} | ${slide.style_attribute_count} | ${slide.image_count} | ${slide.svg_count} |`)
    .join("\n");

  return [
    "# Source HTML/CSS Preservation",
    "",
    "Use these source artifacts before generating `visual-spec.md`, `theme.css`, `source.css`, `pages/*.html`, `template-pages.md`, and `template-pages.json`. They preserve the rendered PPTX HTML structure, extracted style rules, and migrated image references so the final platform template can keep more of the original deck system.",
    "",
    "## Source Bundle",
    "",
    `- Preview HTML: \`${sourceBundle.preview_html}\``,
    `- Extracted CSS: \`${sourceBundle.theme_css}\``,
    `- Style rules: ${sourceBundle.style_rule_count}`,
    `- Migrated images: ${assets.images.length}`,
    `- Deduplicated image references: ${assets.duplicate_images?.length || 0}`,
    `- External resources: ${assets.external_resources.length}`,
    "",
    "## Page Pattern Map",
    "",
    "| Pattern ID | Name | Source Slides | Layout Signature |",
    "| --- | --- | --- | --- |",
    patterns,
    "",
    "## Slide Structure Index",
    "",
    "| Slide | Pattern | Elements | Inline Styles | Images | SVGs |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    slideRows || "| none | none | 0 | 0 | 0 | 0 |",
    "",
    "## Generation Rule",
    "",
    "When producing the final template files, preserve source HTML structure that defines real layout and visual hierarchy. Use source inline styles as evidence for exact values before consolidating reusable rules into `theme.css`. The extracted `.pptx-style-*` CSS rules are deduplicated, semantically named evidence only; do not treat them as the final authoring API.",
    "",
    "## Visual/HTML Review Contract",
    "",
    "Before generating final `visual-spec.md`, `theme.css`, `source.css`, and `pages/*.html`, review each source slide together with its visual evidence and rendered HTML. For every slide or reusable block, decide whether to retain / parameterize / replace / drop it.",
    "",
    "- Retain: layout groups, chart/table shells, image masks, decorative geometry, and visual hierarchy that define the template.",
    "- Parameterize: repeated titles, metrics, body copy, list items, chart values, table cells, and image slots.",
    "- Replace: source-specific business text or images that should become placeholders while keeping the reusable structure.",
    "- Drop: duplicated wrappers, rendering helpers, or invisible nodes only after visual evidence confirms they do not affect the page.",
    "",
    "The final output must include a source-to-template mapping, placeholder plan, common layout/component classes, and any inline style exceptions.",
    "",
  ].join("\n");
}

export async function writeSourceBundle({ outputDir, renderedSlides, slides, pagePatterns, assets }) {
  await mkdir(outputDir, { recursive: true });
  const styleRegistry = new Map();
  const rendererCssBlocks = new Set();
  const sharedRendererCss = await readFile(resolve(outputDir, "assets", "slides.css"), "utf8").catch(() => "");
  const preview = buildSourcePreview({ renderedSlides, slides, styleRegistry, rendererCssBlocks });
  const rendererCssRuleCount = (sharedRendererCss ? 1 : 0) + rendererCssBlocks.size;
  const styleSummary = buildStyleSummary(styleRegistry, preview.slideStyles, rendererCssRuleCount);
  const sourceBundle = {
    preview_html: "source-preview.html",
    theme_css: "source-theme.css",
    visual_spec: "source-visual-spec.md",
    style_rule_count: styleRegistry.size + rendererCssRuleCount,
    style_summary: styleSummary,
  };
  const sourceTheme = buildSourceTheme(styleRegistry, rendererCssBlocks, sharedRendererCss);
  const sourceSpec = buildSourceVisualSpec({ slides, pagePatterns, sourceBundle, assets });

  await writeFile(resolve(outputDir, sourceBundle.preview_html), preview.html, "utf8");
  await writeFile(resolve(outputDir, sourceBundle.theme_css), sourceTheme, "utf8");
  await writeFile(resolve(outputDir, sourceBundle.visual_spec), sourceSpec, "utf8");

  return sourceBundle;
}
