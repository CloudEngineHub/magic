/**
 * Edition resolution and npm pipeline layers for the build/dev orchestrators.
 * This file must stay plain CJS because scripts/build.cjs and scripts/dev.cjs
 * run directly in node before Vite is involved. Vite consumes the same layer
 * descriptors, so source/config/env resolution cannot drift between runtimes.
 */

const { existsSync } = require("node:fs")
const { resolve } = require("node:path")

const EDITIONS = {
	opensource: "opensource",
	enterprise: "enterprise",
}

/**
 * The edition layer stack, ordered baseline → most specific; later layers
 * override earlier ones. This is the ONE place the layer list is declared.
 *   - rootDir:        layer root relative to the project root
 *   - sourceDir:      source dir relative to the layer root
 *   - configFile:     Vite contribution relative to the layer root
 *   - alias:          explicit layer import alias (`false` for the baseline)
 *   - reloadOnChange: overlay HMR full-reload on file add/remove
 */
const LAYERS = [
	{
		name: "base",
		edition: EDITIONS.opensource,
		rootDir: ".",
		sourceDir: "src",
		configFile: "vite/config.ts",
		alias: false,
		reloadOnChange: false,
	},
	{
		name: EDITIONS.enterprise,
		edition: EDITIONS.enterprise,
		rootDir: "enterprise",
		sourceDir: "src",
		configFile: "vite/config.ts",
		alias: "@enterprise",
	},
	{
		name: "customer",
		edition: EDITIONS.enterprise,
		rootDir: "customer",
		sourceDir: "src",
		configFile: "vite/config.ts",
		alias: "@customer",
	},
]

/** The always-present baseline; the remaining entries are overlays. */
const BASELINE_LAYER = LAYERS[0]
const OVERLAY_LAYERS = LAYERS.slice(1)
/** Overlay folders in baseline → most specific order. Derived from LAYERS. */
const OVERLAY_FOLDERS = OVERLAY_LAYERS.map((layer) => layer.rootDir)

/**
 * Env files must never activate an edition by themselves. Overlay participation
 * follows Vite's real boundary: the layer contributes a config file or source
 * directory. The baseline remains unconditional.
 */
function isLayerActive(projectRoot, layer) {
	if (layer.rootDir === ".") return true

	const rootPath = resolve(projectRoot, layer.rootDir)
	return Boolean(
		(layer.configFile && existsSync(resolve(rootPath, layer.configFile))) ||
		(layer.sourceDir && existsSync(resolve(rootPath, layer.sourceDir))),
	)
}

function resolveActiveLayers(projectRoot = process.cwd()) {
	return LAYERS.filter((layer) => isLayerActive(projectRoot, layer))
}

/**
 * Resolve the effective edition.
 * The filesystem shape is the contract: environment variables must not decide
 * whether a checkout behaves as open-source or commercial. If any overlay folder
 * exists, the shared dev/build entrypoints run the commercial pipeline.
 */
function resolveEdition(projectRoot = process.cwd()) {
	return resolveActiveLayers(projectRoot).some((layer) => layer.edition === EDITIONS.enterprise)
		? EDITIONS.enterprise
		: EDITIONS.opensource
}

module.exports = {
	EDITIONS,
	LAYERS,
	BASELINE_LAYER,
	OVERLAY_LAYERS,
	OVERLAY_FOLDERS,
	isLayerActive,
	resolveActiveLayers,
	resolveEdition,
}
