/**
 * Edition resolution and npm pipeline layers for the build/dev orchestrators.
 * This file must stay plain CJS because scripts/build.cjs and scripts/dev.cjs
 * run directly in node before Vite is involved. Vite's TypeScript config imports
 * only resolveEdition() from here so both sides apply the same edition rule.
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
 *   - name:           layer id, also the `@<name>` source alias in Vite
 *   - srcDir:         source dir joined by the layered-overlay resolver
 *   - folder:         overlay folder, omitted for the baseline
 *   - reloadOnChange: overlay HMR full-reload on file add/remove
 */
const LAYERS = [
	{ name: EDITIONS.opensource, srcDir: "src", reloadOnChange: false },
	{ name: EDITIONS.enterprise, srcDir: "enterprise/src", folder: "enterprise" },
	{ name: "customer", srcDir: "customer/src", folder: "customer" },
]

/** The always-present baseline; the remaining entries are overlays. */
const BASELINE_LAYER = LAYERS[0]
const OVERLAY_LAYERS = LAYERS.slice(1)
/** Overlay folders in baseline → most specific order. Derived from LAYERS. */
const OVERLAY_FOLDERS = OVERLAY_LAYERS.map((layer) => layer.folder)

/**
 * Resolve the effective edition.
 * The filesystem shape is the contract: environment variables must not decide
 * whether a checkout behaves as open-source or commercial. If any overlay folder
 * exists, the shared dev/build entrypoints run the commercial pipeline.
 */
function resolveEdition(projectRoot = process.cwd()) {
	return OVERLAY_LAYERS.some(
		(layer) =>
			existsSync(resolve(projectRoot, layer.folder)) ||
			existsSync(resolve(projectRoot, layer.srcDir)),
	)
		? EDITIONS.enterprise
		: EDITIONS.opensource
}

module.exports = {
	EDITIONS,
	LAYERS,
	BASELINE_LAYER,
	OVERLAY_LAYERS,
	OVERLAY_FOLDERS,
	resolveEdition,
}
