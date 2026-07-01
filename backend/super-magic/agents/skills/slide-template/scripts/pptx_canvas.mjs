import { readFile } from "node:fs/promises";
import { sandboxRequire } from "../../../../app/tools/pptx_to_html/dom_shims.mjs";

const EMU_PER_CSS_PX = 9525;
const DEFAULT_CANVAS = { width: 960, height: 540 };
const TARGET_WIDE_CANVAS = { width: 1920, height: 1080 };
const WIDE_RATIO = 16 / 9;
const RATIO_TOLERANCE = 0.01;

function roundNumber(value, precision = 3) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function aspectRatio(width, height) {
  if (!width || !height) return "unknown";
  return `${roundNumber(width / height, 3)}:1`;
}

function canvas(width, height) {
  return {
    width: roundNumber(width),
    height: roundNumber(height),
    aspect_ratio: aspectRatio(width, height),
  };
}

function readAttribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  return match ? match[1] : "";
}

export function buildPptxCanvasMetadata({ cx, cy }) {
  const sourceWidthEmu = Number(cx || 0);
  const sourceHeightEmu = Number(cy || 0);
  const hasSourceSize = sourceWidthEmu > 0 && sourceHeightEmu > 0;
  const sourceSizeCss = hasSourceSize
    ? canvas(sourceWidthEmu / EMU_PER_CSS_PX, sourceHeightEmu / EMU_PER_CSS_PX)
    : canvas(DEFAULT_CANVAS.width, DEFAULT_CANVAS.height);
  const ratio = sourceSizeCss.width && sourceSizeCss.height ? sourceSizeCss.width / sourceSizeCss.height : 0;
  const isWideScreen = Math.abs(ratio - WIDE_RATIO) <= RATIO_TOLERANCE;
  const targetCanvas = isWideScreen
    ? canvas(TARGET_WIDE_CANVAS.width, TARGET_WIDE_CANVAS.height)
    : sourceSizeCss;
  const scaleToTarget = isWideScreen ? roundNumber(targetCanvas.width / sourceSizeCss.width, 6) : 1;

  return {
    source_size_emu: {
      width: hasSourceSize ? sourceWidthEmu : 0,
      height: hasSourceSize ? sourceHeightEmu : 0,
    },
    source_size_css: sourceSizeCss,
    render_canvas: sourceSizeCss,
    target_canvas: targetCanvas,
    scale_to_target: scaleToTarget,
    is_wide_screen: isWideScreen,
    render_policy: {
      source: hasSourceSize ? "ppt/presentation.xml p:sldSz" : "default_canvas",
      render_canvas: "source_size_css",
      scale_target: isWideScreen ? "platform_1920x1080" : "source_size_css",
      should_scale_to_target: isWideScreen,
      reason: isWideScreen ? "wide_16_9_source" : "non_16_9_source",
    },
  };
}

export async function readPptxCanvasMetadataFromBuffer(buffer) {
  const JSZip = sandboxRequire("jszip", "pptx-html-renderer");
  const zip = await JSZip.loadAsync(buffer);
  const presentation = zip.file("ppt/presentation.xml");
  if (!presentation) return buildPptxCanvasMetadata({});
  const xml = await presentation.async("string");
  const sldSizeTag = /<[^>]*sldSz\b[^>]*>/i.exec(xml)?.[0] || "";
  return buildPptxCanvasMetadata({
    cx: readAttribute(sldSizeTag, "cx"),
    cy: readAttribute(sldSizeTag, "cy"),
  });
}

export async function readPptxCanvasMetadata(path) {
  const file = await readFile(path);
  return readPptxCanvasMetadataFromBuffer(file);
}

export function shouldScaleToTarget(presentation = {}) {
  return presentation.render_policy?.should_scale_to_target === true
    && Number(presentation.scale_to_target || 1) !== 1;
}

export function targetScaleForPresentation(presentation = {}) {
  return shouldScaleToTarget(presentation) ? Number(presentation.scale_to_target || 1) : 1;
}
