import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "path"
import { build } from "esbuild"
import type { PluginOption, ResolvedConfig, Rollup } from "vite"
import { collectPrecacheAssetUrlsFromAssetFilenames } from "./collect-precache-asset-urls"
import { collectWarmupAssets, type WarmupAssetConfig } from "./collect-warmup-assets"

// Reuse Vite's Rollup-compatible bundle type so this plugin does not require a direct rollup dependency.
type OutputBundle = Rollup.OutputBundle

const APP_SERVICE_WORKER_FILE_NAME = "sw.js"
const APP_SERVICE_WORKER_ROUTE_PATH = `/${APP_SERVICE_WORKER_FILE_NAME}`
const APP_SERVICE_WORKER_SOURCE_PATH = resolve(__dirname, "../src/sw.ts")

interface BuildAppServiceWorkerOptions {
	precacheAssetUrls: string[]
	warmUpAssetUrls: string[]
}

// Keep warm-up targets to high-value public routes while avoiding broad all-bundle preloading.
const CORE_WARMUP_ASSETS = {
	moduleMatchers: [
		"src/pages/superMagic/lazy/ProjectPage",
		"src/pages/superMagic/lazy/ChatProjectPage",
		"src/pages/superMagic/lazy/WorkspacePage",
		"src/pages/superMagic/lazy/TopicPage",
		"src/pages/superMagic/pages/Assistant",
		"src/pages/superMagic/pages/MagiClawPage",
		"src/pages/superMagic/pages/ClawPlayground",
		"src/pages/superMagic/pages/CrewMarket",
		"src/pages/superMagic/pages/MyCrewPage",
		"src/pages/chatNew/lazy/Chat",
	],
	maxAssets: 300,
} satisfies WarmupAssetConfig

/**
 * Collects hashed js/css public paths from the Rollup output bundle (production build).
 */
function collectPrecacheUrlsFromBundle(bundle: OutputBundle): string[] {
	const assetFilenames = Object.keys(bundle).filter((fileName) => {
		if (!fileName.startsWith("assets/")) return false
		const item = bundle[fileName]
		if (!item) return false
		if (item.type === "asset") return /\.(js|css)$/i.test(fileName)
		if (item.type === "chunk") return /\.(js|css)$/i.test(fileName)
		return false
	})

	return collectPrecacheAssetUrlsFromAssetFilenames(assetFilenames)
}

/**
 * Reads hashed js/css filenames from dist/assets when bundle introspection is unavailable.
 */
function collectPrecacheUrlsFromDist(outDir: string): string[] {
	const assetsDir = join(outDir, "assets")
	if (!existsSync(assetsDir)) return []

	const filenames = readdirSync(assetsDir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => `assets/${entry.name}`)

	return collectPrecacheAssetUrlsFromAssetFilenames(filenames)
}

/**
 * Bundles src/sw.ts to IIFE sw.js with an injected precache URL list constant.
 */
async function buildAppServiceWorkerSource(
	options: BuildAppServiceWorkerOptions,
): Promise<string | null> {
	if (!existsSync(APP_SERVICE_WORKER_SOURCE_PATH)) return null

	const result = await build({
		entryPoints: [APP_SERVICE_WORKER_SOURCE_PATH],
		bundle: true,
		write: false,
		format: "iife",
		target: "es2018",
		platform: "browser",
		define: {
			__SW_PRECACHE_ASSETS__: JSON.stringify(options.precacheAssetUrls),
			__SW_WARMUP_ASSETS__: JSON.stringify(options.warmUpAssetUrls),
		},
	})

	const outputFile = result.outputFiles?.[0]
	return outputFile?.text ?? null
}

export default function createAppServiceWorkerPlugin(): PluginOption {
	let resolvedConfig: ResolvedConfig | null = null

	return {
		name: "vite-plugin-app-service-worker",
		enforce: "post",
		configResolved(config) {
			resolvedConfig = config
		},
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (!req.url) {
					next()
					return
				}

				const pathname = new URL(req.url, "https://localhost").pathname
				if (pathname === "/warmup-assets.json") {
					res.statusCode = 200
					res.setHeader("Content-Type", "application/json; charset=utf-8")
					res.end(JSON.stringify([]))
					return
				}

				if (pathname !== APP_SERVICE_WORKER_ROUTE_PATH) {
					next()
					return
				}

				const transformedSource = await buildAppServiceWorkerSource({
					precacheAssetUrls: [],
					warmUpAssetUrls: [],
				})
				if (!transformedSource) {
					next()
					return
				}

				res.statusCode = 200
				res.setHeader("Content-Type", "application/javascript; charset=utf-8")
				res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
				res.setHeader("Pragma", "no-cache")
				res.setHeader("Expires", "0")
				res.setHeader("Service-Worker-Allowed", "/")
				res.end(transformedSource)
			})
		},
		async generateBundle(_options, bundle) {
			if (!resolvedConfig || resolvedConfig.command !== "build") return

			// Precache stays empty; warm-up is limited to configured core page chunks.
			const precacheAssetUrls: string[] = []
			const warmUpAssetUrls = collectWarmupAssets(bundle, CORE_WARMUP_ASSETS)
			const transformedSource = await buildAppServiceWorkerSource({
				precacheAssetUrls,
				warmUpAssetUrls: [],
			})
			if (!transformedSource) return

			this.emitFile({
				type: "asset",
				fileName: APP_SERVICE_WORKER_FILE_NAME,
				source: transformedSource,
			})

			this.emitFile({
				type: "asset",
				fileName: "warmup-assets.json",
				source: JSON.stringify(warmUpAssetUrls),
			})
		},
	}
}

export { collectPrecacheUrlsFromBundle, collectPrecacheUrlsFromDist }
