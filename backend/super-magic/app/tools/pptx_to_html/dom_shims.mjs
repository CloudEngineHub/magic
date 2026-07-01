import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const localRequire = createRequire(import.meta.url);

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function nodePathRoots() {
  return String(process.env.NODE_PATH || "")
    .split(":")
    .map((item) => item.trim())
    .filter(Boolean);
}

function packageDirFromRoot(root, packageName) {
  const dir = join(root, ...packageName.split("/"));
  return existsSync(dir) ? dir : "";
}

function packageDirFromRequire(requireFn, packageName) {
  try {
    return requireFn.resolve(`${packageName}/package.json`).replace(/\/package\.json$/, "");
  } catch {
    return "";
  }
}

function sandboxPackageDir(packageName) {
  const direct = packageDirFromRequire(localRequire, packageName);
  if (direct) return direct;

  const roots = [
    ...nodePathRoots(),
    commandOutput("npm", ["root", "-g"]),
    commandOutput("pnpm", ["root", "-g"]),
  ].filter(Boolean);

  for (const root of roots) {
    const dir = packageDirFromRoot(root, packageName);
    if (dir) return dir;
    const requireFn = createRequire(join(root, "package.json"));
    const resolved = packageDirFromRequire(requireFn, packageName);
    if (resolved) return resolved;
  }

  throw new Error(`Missing Node package in super-magic sandbox: ${packageName}`);
}

export function sandboxRequire(packageName, fromPackageName = null) {
  const baseDir = fromPackageName ? sandboxPackageDir(fromPackageName) : sandboxPackageDir(packageName);
  return createRequire(join(baseDir, "package.json"))(packageName);
}

export function sandboxPackageEntryUrl(packageName, entryPath) {
  return pathToFileURL(join(sandboxPackageDir(packageName), entryPath)).href;
}
