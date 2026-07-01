#!/usr/bin/env node

import { resolve } from "node:path";
import { convertPptxToHtml } from "./pptx_to_html_converter.mjs";

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
    "node convert_pptx_to_html.mjs --pptx /path/template.pptx --output-dir /path/output [--max-slides 8]",
  ].join("\n");
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
  const { payload } = await convertPptxToHtml({
    pptxPath: resolve(args.pptx),
    outputDir: resolve(args.outputDir),
    maxSlides: Number.isFinite(args.maxSlides) ? args.maxSlides : null,
  });
  console.log(JSON.stringify(payload, null, 2));
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
        error: "failed to convert pptx to html",
        pptx,
        message: error?.message || String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

