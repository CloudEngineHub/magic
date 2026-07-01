import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const SVG_SINGLE_INLINE_LIMIT_BYTES = 20 * 1024;
const SVG_PAGE_INLINE_LIMIT_BYTES = 100 * 1024;

function normalizeSvgAttributeText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/:\s+/g, ": ").trim();
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function serializeSvg(svg) {
  if (globalThis.XMLSerializer) {
    return new XMLSerializer().serializeToString(svg);
  }
  return svg.outerHTML;
}

function minifySvgTree(svg) {
  const doc = svg.ownerDocument;
  const nodeFilter = doc.defaultView?.NodeFilter || globalThis.NodeFilter || { SHOW_TEXT: 4, SHOW_COMMENT: 128 };
  const walker = doc.createTreeWalker(svg, nodeFilter.SHOW_COMMENT | nodeFilter.SHOW_TEXT);
  const removableNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 8 || (node.nodeType === 3 && !String(node.nodeValue || "").trim())) {
      removableNodes.push(node);
    } else if (node.nodeType === 3) {
      node.nodeValue = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
    }
  }
  removableNodes.forEach((node) => node.remove());

  for (const element of svg.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const value = normalizeSvgAttributeText(attribute.value);
      if (value) {
        element.setAttribute(attribute.name, value);
      } else if (!["requiredFeatures", "systemLanguage"].includes(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return removableNodes.length;
}

function isTransparentPaint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "none" || normalized === "transparent" || normalized === "rgba(0,0,0,0)" || normalized === "rgba(0, 0, 0, 0)";
}

function parseStrokeWidth(value) {
  const numeric = Number.parseFloat(String(value || "").replace("px", ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseCssLength(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.endsWith("%")) return null;
  const match = raw.match(/^(-?\d*\.?\d+)(?:px)?$/i);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatNumber(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  if (!Number.isFinite(rounded)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function readElementLength(element, property) {
  return parseCssLength(element?.style?.getPropertyValue(property)) || parseCssLength(element?.getAttribute(property));
}

function svgSourceBox(svg) {
  const wrapper = svg.closest(".shape-wrapper");
  const wrapperWidth = readElementLength(wrapper, "width");
  const wrapperHeight = readElementLength(wrapper, "height");
  if (wrapperWidth && wrapperHeight) {
    return { width: wrapperWidth, height: wrapperHeight };
  }

  const svgWidth = readElementLength(svg, "width");
  const svgHeight = readElementLength(svg, "height");
  if (svgWidth && svgHeight) {
    return { width: svgWidth, height: svgHeight };
  }
  return null;
}

function normalizeSvgViewBox(svg) {
  if (svg.getAttribute("viewBox")) return false;
  const sourceBox = svgSourceBox(svg);
  if (!sourceBox) return false;
  svg.setAttribute("viewBox", `0 0 ${formatNumber(sourceBox.width)} ${formatNumber(sourceBox.height)}`);
  if (!svg.getAttribute("preserveAspectRatio")) {
    svg.setAttribute("preserveAspectRatio", "none");
  }
  svg.setAttribute("data-template-viewbox-normalized", "source-box");
  return true;
}

function suppressTextBoxOutlineNoise(stage) {
  let suppressedCount = 0;
  for (const wrapper of stage.querySelectorAll(".shape-wrapper.shape-rect")) {
    if (!wrapper.querySelector(".text-wrapper")) continue;

    const svg = wrapper.querySelector("svg");
    const rect = svg?.querySelector("rect");
    if (!rect) continue;

    const fill = rect.getAttribute("fill");
    const stroke = rect.getAttribute("stroke");
    const strokeWidth = parseStrokeWidth(rect.getAttribute("stroke-width"));
    if (!isTransparentPaint(fill) || isTransparentPaint(stroke) || strokeWidth <= 0 || strokeWidth > 1.5) {
      continue;
    }

    rect.setAttribute("data-template-suppressed-outline", "transparent-textbox-rect");
    rect.setAttribute("stroke", "transparent");
    rect.setAttribute("stroke-width", "0");
    suppressedCount += 1;
  }
  return suppressedCount;
}

export function initializeSvgOptimization() {
  return {
    mode: "tiered_inline_and_externalized_svg",
    optimized_count: 0,
    inline_count: 0,
    externalized_count: 0,
    before_bytes: 0,
    after_bytes: 0,
    removed_noise_nodes: 0,
    suppressed_textbox_outline_count: 0,
    normalized_viewbox_count: 0,
    decisions: [],
  };
}

export function minifyInlineSvgs(stage, summary) {
  summary.suppressed_textbox_outline_count = suppressTextBoxOutlineNoise(stage);
  for (const svg of stage.querySelectorAll("svg")) {
    if (normalizeSvgViewBox(svg)) {
      summary.normalized_viewbox_count += 1;
    }
    summary.optimized_count += 1;
    summary.before_bytes += byteLength(serializeSvg(svg));
    summary.removed_noise_nodes += minifySvgTree(svg);
  }
}

function hasEditableSvgContext(svg) {
  if (svg.querySelector("foreignObject, text, input, textarea, select")) return true;
  if (svg.closest(".text-wrapper")) return true;
  const wrapper = svg.closest(".shape-wrapper");
  return Boolean(wrapper?.querySelector(".text-wrapper"));
}

function hasContextStyleDependency(svg) {
  const serialized = serializeSvg(svg);
  return /\bvar\(/i.test(serialized) || /\bcurrentColor\b/i.test(serialized);
}

function svgDecision(svg, pageTotalBytes) {
  const bytes = byteLength(serializeSvg(svg));
  if (hasEditableSvgContext(svg)) {
    return { action: "inline", reason: "editable_svg_context", bytes };
  }
  if (hasContextStyleDependency(svg)) {
    return { action: "inline", reason: "context_style_dependency", bytes };
  }
  if (bytes > SVG_SINGLE_INLINE_LIMIT_BYTES) {
    return { action: "externalize", reason: `single_svg_over_${SVG_SINGLE_INLINE_LIMIT_BYTES}_bytes`, bytes };
  }
  if (pageTotalBytes > SVG_PAGE_INLINE_LIMIT_BYTES) {
    return { action: "externalize", reason: `page_svg_total_over_${SVG_PAGE_INLINE_LIMIT_BYTES}_bytes`, bytes };
  }
  return { action: "inline", reason: "within_inline_limits", bytes };
}

function copySvgPresentationAttributes(svg, img) {
  for (const attribute of ["width", "height", "style", "class"]) {
    const value = svg.getAttribute(attribute);
    if (value) img.setAttribute(attribute, value);
  }
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) img.setAttribute("data-svg-view-box", viewBox);
  const preserveAspectRatio = svg.getAttribute("preserveAspectRatio");
  if (preserveAspectRatio) img.setAttribute("data-svg-preserve-aspect-ratio", preserveAspectRatio);
}

export async function applySvgPolicy({ stage, outputDir, slideIndex, summary }) {
  const assetsDir = resolve(outputDir, "assets", "images");
  const svgAssets = [];
  let assetIndex = 0;
  const svgs = [...stage.querySelectorAll("svg")];
  const pageTotalBytes = svgs.reduce((total, svg) => total + byteLength(serializeSvg(svg)), 0);

  for (const svg of svgs) {
    const decision = svgDecision(svg, pageTotalBytes);
    if (decision.action === "externalize") {
      assetIndex += 1;
      await mkdir(assetsDir, { recursive: true });
      const fileName = `slide-${slideIndex + 1}-vector-${assetIndex}.svg`;
      const outputPath = resolve(assetsDir, fileName);
      const svgMarkup = serializeSvg(svg);
      await writeFile(outputPath, svgMarkup, "utf8");

      const doc = svg.ownerDocument;
      const img = doc.createElement("img");
      copySvgPresentationAttributes(svg, img);
      img.setAttribute("src", `../assets/images/${fileName}`);
      img.setAttribute("alt", "");
      img.setAttribute("data-source-svg", "externalized");
      img.setAttribute("data-source-slide", String(slideIndex + 1));
      img.setAttribute("data-svg-policy", "large-non-editable-svg");
      img.setAttribute("data-svg-policy-reason", decision.reason);
      svg.replaceWith(img);

      const relativePath = relative(outputDir, outputPath);
      svgAssets.push({
        source_slide_index: slideIndex,
        kind: "externalized-inline-svg",
        output_path: relativePath,
        mime_type: "image/svg+xml",
        bytes: byteLength(svgMarkup),
        reason: decision.reason,
      });
      summary.externalized_count += 1;
      summary.decisions.push({
        action: "externalize",
        reason: decision.reason,
        before_bytes: decision.bytes,
        output_path: relativePath,
      });
    } else {
      summary.inline_count += 1;
      summary.decisions.push({
        action: "inline",
        reason: decision.reason,
        before_bytes: decision.bytes,
      });
    }
  }

  summary.after_bytes = [...stage.querySelectorAll("svg, img[data-source-svg='externalized']")]
    .reduce((total, element) => total + byteLength(element.outerHTML), 0);
  return svgAssets;
}

export function svgOptimizationPayload(summary) {
  return {
    mode: summary.mode,
    optimized_count: summary.optimized_count,
    inline_count: summary.inline_count,
    externalized_count: summary.externalized_count,
    before_bytes: summary.before_bytes,
    after_bytes: summary.after_bytes,
    removed_noise_nodes: summary.removed_noise_nodes,
    suppressed_textbox_outline_count: summary.suppressed_textbox_outline_count,
    normalized_viewbox_count: summary.normalized_viewbox_count,
    decisions: summary.decisions,
  };
}
