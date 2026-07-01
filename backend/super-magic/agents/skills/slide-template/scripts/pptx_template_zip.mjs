import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { sandboxRequire } from "../../../../app/tools/pptx_to_html/dom_shims.mjs";

const GENERIC_STYLE_NAMES = new Set([
  "llm-visual-spec",
  "llm 视觉语义规范",
  "pptx 可执行模板规范",
  "pptx source-preserved fallback template",
]);

function stripKnownExtension(value) {
  return String(value || "").replace(/\.(pptx|ppt|potx|pot|ppsx|html|zip)$/i, "");
}

function normalizeStyleName(value) {
  const normalized = stripKnownExtension(value)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}^~[\]`;]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
  return normalized || "";
}

function isGenericStyleName(value) {
  const normalized = normalizeStyleName(value).replace(/-/g, " ").toLowerCase();
  return !normalized || GENERIC_STYLE_NAMES.has(normalized);
}

function firstMarkdownHeading(markdown) {
  const match = String(markdown || "").match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

async function styleNameFromLlmPagePlan(sourceDir) {
  try {
    const plan = JSON.parse(await readFile(resolve(sourceDir, "llm-page-plan.json"), "utf8"));
    const pages = Array.isArray(plan.pages) ? plan.pages : [];
    const names = [plan.template_style, plan.style_name, ...pages.flatMap((page) => [page.template_style, page.style_name])]
      .filter(Boolean)
      .map(normalizeStyleName)
      .filter((name) => name && !isGenericStyleName(name));
    return names[0] || "";
  } catch {
    return "";
  }
}

async function styleNameFromLlmVisualSpec(sourceDir) {
  try {
    const heading = firstMarkdownHeading(await readFile(resolve(sourceDir, "llm-visual-spec.md"), "utf8"));
    const name = normalizeStyleName(heading);
    return name && !isGenericStyleName(name) ? name : "";
  } catch {
    return "";
  }
}

export async function resolveTemplateStyleName({ sourceDir, outputDir, payload }) {
  const candidates = [
    await styleNameFromLlmPagePlan(sourceDir),
    await styleNameFromLlmVisualSpec(sourceDir),
    payload?.template_style,
    payload?.style_name,
    payload?.source?.name,
    basename(outputDir),
  ];

  for (const candidate of candidates) {
    const name = normalizeStyleName(candidate);
    if (name && !isGenericStyleName(name)) return name;
  }
  return "pptx-template";
}

async function listPackageFiles(rootDir) {
  let entries = [];
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue;
    const path = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPackageFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function fileExists(path) {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function listTemplatePackageFiles(outputDir) {
  const relativeFiles = [];

  for (const file of [
    "visual-spec.md",
    "template-pages.md",
    "template-pages.json",
    "theme.css",
    "source.css",
  ]) {
    if (await fileExists(resolve(outputDir, file))) {
      relativeFiles.push(file);
    }
  }

  for (const dir of ["pages", "assets/images"]) {
    for (const file of await listPackageFiles(resolve(outputDir, dir))) {
      relativeFiles.push(relative(outputDir, file).split("\\").join("/"));
    }
  }

  return [...new Set(relativeFiles)].sort((left, right) => left.localeCompare(right));
}

export async function writeTemplateZip({ outputDir, sourceDir, payload, mode }) {
  const output = resolve(outputDir);
  const styleName = await resolveTemplateStyleName({ sourceDir, outputDir: output, payload });
  const zipDir = resolve(dirname(output), "packages");
  const zipPath = resolve(zipDir, `${styleName}-template.zip`);
  const JSZip = sandboxRequire("jszip", "pptx-html-renderer");
  const zip = new JSZip();

  for (const relativePath of await listTemplatePackageFiles(output)) {
    zip.file(relativePath, await readFile(resolve(output, relativePath)));
  }

  zip.file(
    "template-package.json",
    `${JSON.stringify(
      {
        style_name: styleName,
        source: payload?.source?.name || null,
        mode: mode || null,
        packaged_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  await mkdir(zipDir, { recursive: true });
  await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return {
    template_style: styleName,
    zip_path: zipPath,
    zip_file: basename(zipPath),
    zip_dir: zipDir,
  };
}
