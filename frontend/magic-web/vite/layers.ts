import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { mergeConfig, type UserConfig } from "vite"
import vitePluginOverlay from "../plugins/vite-plugin-overlay"

const requireModule = createRequire(import.meta.url)

/**
 * Generic layered Vite config descriptor. This engine only understands the
 * "overlay" idea: an ordered baseline → most-specific merge chain. It never
 * hardcodes what a layer means — callers supply the array that decides what
 * overlays what.
 */
export interface LayerConfig {
	name: string
	/** Layer root relative to projectRoot. Defaults to projectRoot itself. */
	rootDir?: string
	/** Config module path relative to the layer root, e.g. `vite/config.ts`. */
	configFile?: string
	/** Source dir relative to the layer root, used by the layered-overlay resolver. */
	sourceDir?: string
	/** Optional alias exposed for this source layer, e.g. `@enterprise`. */
	alias?: string | false
	reloadOnChange?: boolean
}

/** A layer plus the absolute paths {@link resolveLayerConfigs} computes for it. */
export interface ResolvedLayerConfig extends LayerConfig {
	rootPath: string
	sourceOverlayDir?: string
	configPath?: string
	sourcePath?: string
}

/** Keep only the layers whose config file or source dir actually exists on disk. */
export function resolveLayerConfigs({
	projectRoot,
	layers,
}: {
	projectRoot: string
	layers: LayerConfig[]
}): ResolvedLayerConfig[] {
	return layers
		.map((layer) => {
			const rootDir = layer.rootDir ?? "."
			const rootPath = resolve(projectRoot, rootDir)
			return {
				...layer,
				rootPath,
				sourceOverlayDir: layer.sourceDir
					? joinLayerPath(rootDir, layer.sourceDir)
					: undefined,
				configPath: layer.configFile ? resolve(rootPath, layer.configFile) : undefined,
				sourcePath: layer.sourceDir ? resolve(rootPath, layer.sourceDir) : undefined,
			}
		})
		.filter(
			(layer) =>
				(layer.configPath && existsSync(layer.configPath)) ||
				(layer.sourcePath && existsSync(layer.sourcePath)),
		)
}

/**
 * Wire the unified overlay plugin from the active layers. Internally the plugin
 * keeps src/html/public handling isolated, while this layer composer only passes
 * the resolved layer stack once.
 */
export function buildOverlayFromLayers({
	projectRoot,
	layers,
}: {
	projectRoot: string
	layers: ResolvedLayerConfig[]
}): UserConfig {
	if (layers.length === 0) return {}

	return {
		plugins: vitePluginOverlay({
			projectRoot,
			layers: layers.map((layer) => ({
				name: layer.name,
				rootPath: layer.rootPath,
				sourceDir: layer.sourceDir,
				alias: layer.alias,
				reloadOnChange: layer.reloadOnChange,
			})),
		}),
	}
}

/** Merge each active layer's config module in order (baseline first, most-specific last). */
export function mergeLayerConfigs({
	projectRoot,
	layers,
}: {
	projectRoot: string
	layers: ResolvedLayerConfig[]
}): UserConfig {
	return layers
		.map((layer) => loadLayerConfig({ projectRoot, layer }))
		.reduce<UserConfig>((acc, partial) => mergeConfig(acc, partial), {})
}

function loadLayerConfig({
	projectRoot,
	layer,
}: {
	projectRoot: string
	layer: ResolvedLayerConfig
}): UserConfig {
	if (!layer.configPath || !existsSync(layer.configPath)) return {}

	try {
		registerTsRequireIfNeeded(layer.configPath)
		const mod = requireModule(layer.configPath)
		const factory = mod.getConfig ?? mod.default ?? mod
		if (typeof factory !== "function") return {}

		const partial = factory({ projectRoot })
		return partial && typeof partial === "object" ? (partial as UserConfig) : {}
	} catch (error) {
		console.warn(`[layers] failed to load ${layer.configFile ?? layer.configPath}:`, error)
		return {}
	}
}

function registerTsRequireIfNeeded(configPath: string): void {
	if (!configPath.endsWith(".ts") && !configPath.endsWith(".tsx")) return
	// Idempotent by design: Node's require cache runs tsx/cjs's hook registration
	// only on first load, so repeated calls are cheap no-ops — no guard needed.
	requireModule("tsx/cjs")
}

function joinLayerPath(rootDir: string, relativePath: string): string {
	if (rootDir === "." || rootDir === "") return relativePath
	return `${rootDir.replace(/\/+$/g, "")}/${relativePath.replace(/^\/+/g, "")}`
}
