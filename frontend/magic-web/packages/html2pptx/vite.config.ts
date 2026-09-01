import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { defineConfig, type UserConfig } from "vite"
import type { PackagingRuntimeIdentity } from "./src/packaging/streaming-types"

const projectRoot = fileURLToPath(new URL(".", import.meta.url))
const magicWebRoot = resolve(projectRoot, "../..")
const packageJsonPath = resolve(projectRoot, "package.json")
const pptxgenjsPatchPath = resolve(magicWebRoot, "patches/pptxgenjs@4.0.1.patch")
const installedPptxgenjsPackageJsonPath = resolve(
	projectRoot,
	"node_modules/pptxgenjs/package.json",
)
const installedPptxgenjsRequire = createRequire(installedPptxgenjsPackageJsonPath)

// The upstream commit is provenance for the implementation carried by the
// patch.  It is kept as a code constant alongside the patch gate; the patch
// bytes themselves provide the artifact fingerprint below, so no sidecar
// metadata file is needed for installation or runtime identity.
const PPTXGENJS_SOURCE_COMMIT = "413429d2e0d4b7fa75291424fe88ba30b3ec794c"
const PPTXGENJS_NAME = "pptxgenjs"
const PPTXGENJS_BASE_VERSION = "4.0.1"

interface Html2PptxPackageManifest {
	version?: unknown
}

interface PptxGenJsInstalledPackageManifest {
	name?: unknown
	version?: unknown
}

interface PptxGenJsRuntimePresentation {
	version?: unknown
	beginStreaming?: unknown
	writeTo?: unknown
}

interface PptxGenJsRuntimeModule {
	default?: unknown
}

export function getPackagingRuntimeIdentity(
	environment: NodeJS.ProcessEnv = process.env,
	edition?: PackagingRuntimeIdentity["edition"],
): PackagingRuntimeIdentity {
	const runtimeEdition = edition ?? resolveEdition(environment)
	const packageManifest = readJson<Html2PptxPackageManifest>(packageJsonPath)
	const html2pptxVersion = requireNonEmptyString(
		packageManifest.version,
		`${packageJsonPath} version`,
	)
	const installedPackageManifest = readJson<PptxGenJsInstalledPackageManifest>(
		installedPptxgenjsPackageJsonPath,
	)
	const installedName = requireNonEmptyString(
		installedPackageManifest.name,
		`${installedPptxgenjsPackageJsonPath} name`,
	)
	const installedBaseVersion = requireNonEmptyString(
		installedPackageManifest.version,
		`${installedPptxgenjsPackageJsonPath} version`,
	)
	if (installedName !== PPTXGENJS_NAME || installedBaseVersion !== PPTXGENJS_BASE_VERSION) {
		throw new Error(
			`${installedPptxgenjsPackageJsonPath} must resolve the patched ${PPTXGENJS_NAME}@${PPTXGENJS_BASE_VERSION} package; found ${installedName}@${installedBaseVersion}`,
		)
	}
	const pptxgenjsVersion = readInstalledPptxGenJsRuntimeVersion()
	const patchSha256 = sha256(readFileSync(pptxgenjsPatchPath))

	return Object.freeze({
		protocolVersion: 2,
		edition: runtimeEdition,
		html2pptxVersion,
		buildId:
			firstNonEmpty(environment.HTML2PPTX_BUILD_ID, environment.MAGIC_BUILD_ID) ??
			readMagicGitCommit(),
		pptxgenjsVersion,
		sourceCommit: PPTXGENJS_SOURCE_COMMIT,
		artifactHash: `sha256:${patchSha256}`,
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

function readInstalledPptxGenJsRuntimeVersion(): string {
	let runtimeModule: unknown
	try {
		runtimeModule = installedPptxgenjsRequire(PPTXGENJS_NAME) as PptxGenJsRuntimeModule
	} catch (error) {
		throw new Error(
			`Unable to load the installed patched ${PPTXGENJS_NAME} runtime`,
			{ cause: error },
		)
	}

	const runtimeConstructor =
		typeof runtimeModule === "function"
			? runtimeModule
			: (runtimeModule as PptxGenJsRuntimeModule | undefined)?.default
	if (typeof runtimeConstructor !== "function") {
		throw new Error(
			`${installedPptxgenjsPackageJsonPath} does not expose a PptxGenJS constructor`,
		)
	}

	let presentation: PptxGenJsRuntimePresentation
	try {
		presentation = new (runtimeConstructor as new () => PptxGenJsRuntimePresentation)()
	} catch (error) {
		throw new Error("Unable to instantiate the installed patched PptxGenJS runtime", {
			cause: error,
		})
	}

	const version = requireNonEmptyString(
		presentation.version,
		`${installedPptxgenjsPackageJsonPath} runtime version`,
	)
	if (typeof presentation.beginStreaming !== "function" || typeof presentation.writeTo !== "function") {
		throw new Error(
			`${installedPptxgenjsPackageJsonPath} runtime must expose beginStreaming() and writeTo()`,
		)
	}
	return version
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex")
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
