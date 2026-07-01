import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { sandboxPackageEntryUrl } from "./dom_shims.mjs";
import { readPptxCanvasMetadataFromBuffer } from "./pptx_canvas.mjs";

const RENDERER_WORK_DIR = ".pptx-html-renderer";

async function loadPptxHtmlRenderer() {
  return import(sandboxPackageEntryUrl("pptx-html-renderer", "dist/index.js"));
}

function rewriteSlideFileRefs(html) {
  return String(html || "")
    .replaceAll('href="assets/', 'href="../assets/')
    .replaceAll("href='assets/", "href='../assets/")
    .replaceAll('src="assets/', 'src="../assets/')
    .replaceAll("src='assets/", "src='../assets/")
    .replace(/slide-0*(\d+)\.html/g, (_, number) => `slide-${Number(number)}.html`);
}

function slideFileName(index) {
  return `slide-${String(index + 1).padStart(3, "0")}.html`;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function normalizeRelativePath(path) {
  return path.split("\\").join("/");
}

async function buildAssetManifest({ output, rendererResult }) {
  const assetsRoot = resolve(output, "assets");
  const allFiles = await listFiles(assetsRoot);
  const rendererAssets = new Set((rendererResult.assets || []).map((file) => resolve(file)));
  return allFiles
    .filter((file) => !file.endsWith("slides.css"))
    .filter((file) => rendererAssets.size === 0 || rendererAssets.has(resolve(file)) || file.includes(`${join("assets", "images")}`))
    .map((file) => ({
      source_slide_index: null,
      source_slide_indexes: [],
      kind: "pptx-html-renderer-asset",
      output_path: normalizeRelativePath(relative(output, file)),
      mime_type: null,
      bytes: null,
      usage_count: null,
    }));
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function fillAssetSizes(assets, output) {
  for (const asset of assets) {
    asset.bytes = await fileSize(resolve(output, asset.output_path));
  }
  return assets;
}

function rendererWarningsToRisks(rendererResult) {
  const risks = [];
  for (const warning of rendererResult.warnings || []) {
    risks.push(`pptx-html-renderer warning${warning.slideIndex !== undefined ? ` on slide ${warning.slideIndex + 1}` : ""}: ${warning.message}`);
  }
  for (const warning of rendererResult.unsupportedFeatures || []) {
    risks.push(`pptx-html-renderer unsupported feature${warning.slideIndex !== undefined ? ` on slide ${warning.slideIndex + 1}` : ""}: ${warning.message}`);
  }
  return risks;
}

export async function convertPptxToHtml({ pptxPath, outputDir, maxSlides = null }) {
  const output = resolve(outputDir);
  const sourcePath = resolve(pptxPath);
  const slidesHtmlDir = resolve(output, "slides-html");
  const rendererDir = resolve(output, RENDERER_WORK_DIR);
  await mkdir(slidesHtmlDir, { recursive: true });

  const file = await readFile(sourcePath);
  const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const canvasMetadata = await readPptxCanvasMetadataFromBuffer(arrayBuffer);
  await rm(rendererDir, { recursive: true, force: true });

  const { renderPptxToHtml } = await loadPptxHtmlRenderer();
  const rendererResult = await renderPptxToHtml(file, {
    outDir: rendererDir,
    force: true,
    chartMode: "static",
    assetDir: "assets/images",
    title: basename(sourcePath).replace(/\.pptx$/i, ""),
  });

  await rm(resolve(output, "assets"), { recursive: true, force: true });
  await cp(resolve(rendererDir, "assets"), resolve(output, "assets"), { recursive: true });

  const renderCanvas = canvasMetadata.render_canvas;
  const slideCount = rendererResult.slideCount ?? 0;
  const renderLimit = maxSlides === null ? slideCount : Math.max(0, Math.min(maxSlides, slideCount));
  const risks = rendererWarningsToRisks(rendererResult);
  const slides = [];
  const renderedSlides = [];

  if (renderLimit < slideCount) {
    risks.push(`Limited extraction: rendered ${renderLimit} of ${slideCount} slides.`);
  }
  if (slideCount === 0) {
    risks.push("pptx-html-renderer loaded the file but found zero slides.");
  }

  for (let index = 0; index < renderLimit; index += 1) {
    try {
      const sourceHtmlPath = resolve(rendererDir, slideFileName(index));
      const html = rewriteSlideFileRefs(await readFile(sourceHtmlPath, "utf8"));
      const htmlPath = resolve(slidesHtmlDir, `slide-${index + 1}.html`);
      await writeFile(htmlPath, html, "utf8");
      renderedSlides.push({ index, html });
      slides.push({
        index,
        html_path: `slides-html/slide-${index + 1}.html`,
      });
    } catch (error) {
      risks.push(`Render failed for slide ${index + 1}: ${error?.message || String(error)}`);
    }
  }

  const images = await fillAssetSizes(await buildAssetManifest({ output, rendererResult }), output);
  const assets = { images, duplicate_images: [], external_resources: [] };
  await rm(rendererDir, { recursive: true, force: true });

  const payload = {
    source: {
      name: basename(sourcePath),
      path: sourcePath,
    },
    presentation: {
      slide_count: slideCount,
      canvas: renderCanvas,
      source_size_emu: canvasMetadata.source_size_emu,
      source_size_css: canvasMetadata.source_size_css,
      render_canvas: renderCanvas,
      target_canvas: canvasMetadata.target_canvas,
      scale_to_target: canvasMetadata.scale_to_target,
      render_policy: canvasMetadata.render_policy,
      layout_count: null,
      master_count: null,
      theme_count: null,
      media_count: images.length,
      renderer: "pptx-html-renderer",
    },
    html: {
      rendered_slide_count: slides.length,
      output_dir: "slides-html",
      is_complete: slides.length === slideCount,
    },
    assets,
    slides,
    risks,
  };
  await writeFile(resolve(output, "pptx-html-render.json"), JSON.stringify(payload, null, 2), "utf8");
  return {
    payload,
    renderedSlides,
    canvasMetadata,
    renderCanvas,
    rendererResult,
  };
}
