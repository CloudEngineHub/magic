import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { defineConfig, type UserConfig } from "vite"
import type { PackagingRuntimeIdentity } from "./src/packaging/streaming-types"

const projectRoot = fileURLToPath(new URL(".", import.meta.url))
const magicWebRoot = resolve(projectRoot, "../..")
const packageJsonPath = resolve(projectRoot, "package.json")
const vendorManifestPath = resolve(magicWebRoot, "vendor/pptxgenjs-5.0.0.manifest.json")

interface Html2PptxPackageManifest {
	version?: unknown
}

interface PptxGenJsVendorManifest {
	version?: unknown
	sourceCommit?: unknown
	sha256?: unknown
}

export function getPackagingRuntimeIdentity(
	environment: NodeJS.ProcessEnv = process.env,
	edition?: PackagingRuntimeIdentity["edition"],
): PackagingRuntimeIdentity {
	const runtimeEdition = edition ?? resolveEdition(environment)
	const packageManifest = readJson<Html2PptxPackageManifest>(packageJsonPath)
	const vendorManifest = readJson<PptxGenJsVendorManifest>(vendorManifestPath)
	const html2pptxVersion = requireNonEmptyString(
		packageManifest.version,
		`${packageJsonPath} version`,
	)
	const pptxgenjsVersion = requireNonEmptyString(
		vendorManifest.version,
		`${vendorManifestPath} version`,
	)
	const sourceCommit = requireNonEmptyString(
		vendorManifest.sourceCommit,
		`${vendorManifestPath} sourceCommit`,
	)
	const sha256 = requireNonEmptyString(
		vendorManifest.sha256,
		`${vendorManifestPath} sha256`,
	)
	if (!/^[0-9a-f]{64}$/.test(sha256)) {
		throw new Error(`${vendorManifestPath} sha256 must be 64 lowercase hexadecimal characters`)
	}

	return Object.freeze({
		protocolVersion: 2,
		edition: runtimeEdition,
		html2pptxVersion,
		buildId:
			firstNonEmpty(environment.HTML2PPTX_BUILD_ID, environment.MAGIC_BUILD_ID) ??
			readMagicGitCommit(),
		pptxgenjsVersion,
		sourceCommit,
		artifactHash: `sha256:${sha256}`,
	})
}

export function getPackagingRuntimeIdentityDefine(
	environment: NodeJS.ProcessEnv = process.env,
	edition?: PackagingRuntimeIdentity["edition"],
): Record<string, string> {
	return {
		__HTML2PPTX_RUNTIME_IDENTITY__: JSON.stringify(
			getPackagingRuntimeIdentity(environment, edition),
		),
	}
}

export function getBaseViteConfig({
	mode,
	environment = process.env,
	edition,
}: {
	mode: string
	environment?: NodeJS.ProcessEnv
	edition?: PackagingRuntimeIdentity["edition"]
}): UserConfig {
	const isProd = mode === "production"

	return {
		define: getPackagingRuntimeIdentityDefine(environment, edition),
		// Keep package-owned worker chunks relative to the published entry. A
		// root-absolute `/assets/...` URL breaks when the package is deployed
		// below a sub-path or behind a CDN. Hosts can still override workerUrl.
		base: "./",
		resolve: {
			alias: {
				"@": resolve(projectRoot, "src"),
			},
		},
		publicDir: false,
		server: {
			port: 5177,
			open: false,
		},
		build: {
			outDir: resolve(projectRoot, "dist"),
			emptyOutDir: true,
			sourcemap: true,
			minify: isProd ? "esbuild" : false,
			lib: {
				entry: resolve(projectRoot, "src/index.ts"),
				name: "Html2Pptx",
				fileName: "index",
				formats: ["es", "cjs"],
			},
			rollupOptions: {
				external: ["@zumer/snapdom", "pptxgenjs"],
				output: {
					globals: {
						"@zumer/snapdom": "snapdom",
						pptxgenjs: "pptxgenjs",
					},
				},
			},
		},
	}
}

function resolveEdition(environment: NodeJS.ProcessEnv): PackagingRuntimeIdentity["edition"] {
	return environment.EDITION === "enterprise" ? "enterprise" : "open"
}

export default defineConfig((configEnv) => getBaseViteConfig({ mode: configEnv.mode }))

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T
}

function requireNonEmptyString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${label} must be a non-empty string`)
	}
	return value.trim()
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
	for (const value of values) {
		if (value?.trim()) return value.trim()
	}
	return undefined
}

function readMagicGitCommit(): string {
	try {
		return requireNonEmptyString(
			execFileSync("git", ["-C", magicWebRoot, "rev-parse", "HEAD"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}),
			"Magic git commit",
		)
	} catch (error) {
		throw new Error(
			"Unable to determine html2pptx buildId; set HTML2PPTX_BUILD_ID or MAGIC_BUILD_ID",
			{ cause: error },
		)
	}
}
