/**
 * Layer import boundaries
 * ------------------------------------------------------------------
 * Single source of truth for the layered-overlay architecture rules
 * described in docs/layered-overlay-private-deployment-architecture.md.
 *
 *   customer/src  >  enterprise/src  >  src
 *
 * A layer may only depend on itself and the layers *below* it:
 *   - src         → only @/*                               (base, open-source)
 *   - enterprise  → @/* + @enterprise/*                    (enterprise)
 *   - customer    → @/* + @enterprise/* + @customer/*      (customer)
 *
 * Both a path-based check (`import/no-restricted-paths`, catches relative
 * imports like `../../enterprise/src/x`) and an alias-based check
 * (`no-restricted-imports`, catches `@enterprise/x`) are declared, so the
 * boundary holds regardless of how the import is written.
 *
 * To adjust a boundary, edit ONLY the `LAYER_ALIASES` / `LAYERS` tables
 * below — the ESLint overrides are generated from them.
 */

/**
 * Maps a logical layer to its physical directory + the path alias that
 * points at that layer. `@/*` intentionally resolves to `src` (see tsconfig).
 */
const LAYER_ALIASES = {
	src: { dir: "src", alias: "@" },
	enterprise: { dir: "enterprise", alias: "@enterprise" },
	customer: { dir: "customer", alias: "@customer" },
}

/**
 * Non-source directories that application code must never import from.
 * These are build/test tooling zones, not runtime layers.
 */
const NON_SOURCE_ZONES = ["plugins", "scripts", "test", "types", "vite"]

/**
 * Declares, per layer:
 *   - `forbidLayers`: which OTHER runtime layers it may not import from.
 *   - `forbidDirs`:   which non-source directories it may not import from.
 * Anything not listed is allowed, so `customer` (may reach every layer) only
 * inherits the shared non-source restriction.
 */
const LAYERS = [
	{
		name: "src",
		forbidLayers: ["enterprise", "customer"],
		forbidDirs: NON_SOURCE_ZONES,
	},
	{
		name: "enterprise",
		forbidLayers: ["customer"],
		forbidDirs: [],
	},
	{
		name: "customer",
		forbidLayers: [],
		forbidDirs: [],
	},
]

function buildRestrictedImportPatterns(forbiddenLayers, targetLabel) {
	return forbiddenLayers.flatMap((layerName) => {
		const { alias, dir } = LAYER_ALIASES[layerName]
		return [
			{
				group: [alias, `${alias}/*`, `${alias}/**`],
				message: `Files in "${targetLabel}" cannot import from "${alias}/*".`,
			},
			{
				group: [dir, `${dir}/*`, `${dir}/**`],
				message: `Files in "${targetLabel}" cannot import from "${dir}/".`,
			},
		]
	})
}

function buildRestrictedPathZones(forbiddenLayers, forbiddenDirs, targetLabel, targetSrcDir) {
	const layerZones = forbiddenLayers.map((layerName) => ({
		target: `./${targetSrcDir}`,
		from: `./${LAYER_ALIASES[layerName].dir}`,
		message: `Files in "${targetLabel}" cannot import from "${LAYER_ALIASES[layerName].dir}/".`,
	}))

	const dirZones = forbiddenDirs.map((dirName) => ({
		target: `./${targetSrcDir}`,
		from: `./${dirName}`,
		message: `Files in "${targetLabel}" cannot import from "${dirName}/".`,
	}))

	return [...layerZones, ...dirZones]
}

function createLayerOverride({ name, forbidLayers, forbidDirs }) {
	// `src` lives at the repo root (files: "src/**"); the overlay layers live
	// under "<layer>/src/**". Path zones always target the concrete src dir.
	const targetSrcDir = name === "src" ? "src" : `${LAYER_ALIASES[name].dir}/src`
	const targetLabel = `${targetSrcDir}/`
	const rules = {}

	const zones = buildRestrictedPathZones(forbidLayers, forbidDirs, targetLabel, targetSrcDir)
	if (zones.length > 0) {
		rules["import/no-restricted-paths"] = ["error", { zones }]
	}

	if (forbidLayers.length > 0) {
		rules["no-restricted-imports"] = [
			"error",
			{ patterns: buildRestrictedImportPatterns(forbidLayers, targetLabel) },
		]
	}

	return {
		files: [`${targetSrcDir}/**/*.{ts,tsx,js,jsx}`],
		rules,
	}
}

const layerImportBoundaryOverrides = LAYERS.map(createLayerOverride).filter(
	(override) => Object.keys(override.rules).length > 0,
)

module.exports = {
	LAYER_ALIASES,
	LAYERS,
	NON_SOURCE_ZONES,
	layerImportBoundaryOverrides,
	// Backward-compatible / explicit named exports.
	srcImportBoundaryOverride: createLayerOverride(LAYERS[0]),
	enterpriseImportBoundaryOverride: createLayerOverride(LAYERS[1]),
	customerImportBoundaryOverride: createLayerOverride(LAYERS[2]),
}
