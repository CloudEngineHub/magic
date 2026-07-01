import { shouldScaleToTarget, targetScaleForPresentation } from "./pptx_canvas.mjs";

function formatNumber(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  if (!Number.isFinite(rounded)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function scaleNumber(value, scale) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return formatNumber(numeric);
  return formatNumber(numeric * scale);
}

export function scalePxValues(value, scale) {
  if (!scale || scale === 1) return String(value || "");
  return String(value || "").replace(/(-?\d*\.?\d+)px\b/g, (_, numeric) => `${scaleNumber(numeric, scale)}px`);
}

export function scaleHtmlNumericAttributes(value, scale) {
  if (!scale || scale === 1) return String(value || "");
  return String(value || "").replace(
    /\b(width|height|x|y|cx|cy|r|rx|ry)=["'](-?\d*\.?\d+)["']/gi,
    (match, name, numeric) => `${name}="${scaleNumber(numeric, scale)}"`,
  );
}

const SVG_OPENING_STYLE_SCALE_PROPERTIES = new Set([
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "left",
  "top",
  "right",
  "bottom",
  "margin",
  "margin-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "padding",
  "padding-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "border-radius",
]);

function scaleSvgOpeningStyle(value, scale) {
  return String(value || "").replace(/\bstyle=(["'])(.*?)\1/gi, (match, quote, styleText) => {
    const scaledStyle = styleText
      .split(";")
      .map((declaration) => {
        const separatorIndex = declaration.indexOf(":");
        if (separatorIndex < 0) return declaration;
        const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
        if (!SVG_OPENING_STYLE_SCALE_PROPERTIES.has(property)) return declaration;
        const prefix = declaration.slice(0, separatorIndex + 1);
        const rawValue = declaration.slice(separatorIndex + 1);
        return `${prefix}${scalePxValues(rawValue, scale)}`;
      })
      .join(";");
    return `style=${quote}${scaledStyle}${quote}`;
  });
}

function scaleSvgOpeningLayoutAttributes(value, scale) {
  return String(value || "").replace(
    /\b(width|height|x|y)=["'](-?\d*\.?\d+)(px)?["']/gi,
    (match, name, numeric, unit = "") => `${name}="${scaleNumber(numeric, scale)}${unit}"`,
  );
}

function scaleViewBoxSvgOpening(value, scale) {
  return scaleSvgOpeningLayoutAttributes(scaleSvgOpeningStyle(value, scale), scale);
}

function protectViewBoxSvgBlocks(value, scale) {
  const blocks = [];
  const text = String(value || "").replace(
    /<svg\b[^>]*\bviewBox\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>[\s\S]*?<\/svg>/gi,
    (block) => {
      const openingMatch = block.match(/^<svg\b[^>]*>/i);
      if (!openingMatch) return block;
      const opening = openingMatch[0];
      const body = block.slice(opening.length);
      const scaledOpening = scaleViewBoxSvgOpening(opening, scale);
      const token = `__PPTX_VIEWBOX_SVG_${blocks.length}__`;
      blocks.push(`${scaledOpening}${body}`);
      return token;
    },
  );
  return { text, blocks };
}

function restoreProtectedBlocks(value, blocks) {
  return blocks.reduce((output, block, index) => output.replace(`__PPTX_VIEWBOX_SVG_${index}__`, block), value);
}

export function scaleCanvasText(value, presentation = {}) {
  if (!shouldScaleToTarget(presentation)) return String(value || "");
  const scale = targetScaleForPresentation(presentation);
  const protectedSvg = protectViewBoxSvgBlocks(value, scale);
  const scaledText = scaleHtmlNumericAttributes(scalePxValues(protectedSvg.text, scale), scale);
  return restoreProtectedBlocks(scaledText, protectedSvg.blocks);
}

export function scaleCssText(value, presentation = {}) {
  if (!shouldScaleToTarget(presentation)) return String(value || "");
  return scalePxValues(value, targetScaleForPresentation(presentation));
}
