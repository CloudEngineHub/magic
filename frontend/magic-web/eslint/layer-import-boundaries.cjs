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
 * To adjust a boundary, edit ONLY the `RUNTIME_LAYERS` /
 * `FORBIDDEN_NON_RUNTIME_DIRS_BY_LAYER` tables below — the ESLint overrides
 * are generated from them.
 */

/**
 * Ordered from baseline to most specific. Later layers may depend on earlier
 * layers; earlier layers must not depend on later layers.
 *
 * `@/*` intentionally resolves to `src` (see tsconfig), while overlay aliases
 * point at explicit layer roots.
 */
const RUNTIME_LAYERS = [
	{ name: "src", sourceDir: "src", rootDir: "src", alias: "@" },
	{
		name: "enterprise",
		sourceDir: "enterprise/src",
		rootDir: "enterprise",
		alias: "@enterprise",
	},
	{
		name: "customer",
		sourceDir: "customer/src",
		rootDir: "customer",
		alias: "@customer",
	},
]

/**
 * Non-runtime directories blocked per source layer. Today this only protects
 * the open-source baseline from reaching tooling zones; add layer-specific keys
 * if enterprise/customer source should share the same restriction.
 */
const FORBIDDEN_NON_RUNTIME_DIRS_BY_LAYER = {
	src: ["plugins", "scripts", "test", "types", "vite"],
}

function getForbiddenRuntimeLayers(layerIndex) {
	return RUNTIME_LAYERS.slice(layerIndex + 1)
}

function buildRestrictedImportPatterns(forbiddenLayers, targetLabel) {
	return forbiddenLayers.flatMap(({ alias, rootDir }) => {
		return [
			{
				group: [alias, `${alias}/*`, `${alias}/**`],
				message: `Files in "${targetLabel}" cannot import from "${alias}/*".`,
			},
			{
				group: [rootDir, `${rootDir}/*`, `${rootDir}/**`],
				message: `Files in "${targetLabel}" cannot import from "${rootDir}/".`,
			},
		]
	})
}

function buildRestrictedPathZones(forbiddenLayers, forbiddenDirs, targetLabel, targetSrcDir) {
	const layerZones = forbiddenLayers.map(({ rootDir }) => ({
		target: `./${targetSrcDir}`,
		from: `./${rootDir}`,
		message: `Files in "${targetLabel}" cannot import from "${rootDir}/".`,
	}))

	const dirZones = forbiddenDirs.map((dirName) => ({
		target: `./${targetSrcDir}`,
		from: `./${dirName}`,
		message: `Files in "${targetLabel}" cannot import from "${dirName}/".`,
	}))

	return [...layerZones, ...dirZones]
}

function createLayerOverride(layer, layerIndex) {
	const forbiddenLayers = getForbiddenRuntimeLayers(layerIndex)
	const forbiddenDirs = FORBIDDEN_NON_RUNTIME_DIRS_BY_LAYER[layer.name] ?? []
	const targetSrcDir = layer.sourceDir
	const targetLabel = `${targetSrcDir}/`
	const rules = {}

	const zones = buildRestrictedPathZones(
		forbiddenLayers,
		forbiddenDirs,
		targetLabel,
		targetSrcDir,
	)
	if (zones.length > 0) {
		rules["import/no-restricted-paths"] = ["error", { zones }]
	}

	if (forbiddenLayers.length > 0) {
		rules["no-restricted-imports"] = [
			"error",
			{ patterns: buildRestrictedImportPatterns(forbiddenLayers, targetLabel) },
		]
	}

	return {
		files: [`${targetSrcDir}/**/*.{ts,tsx,js,jsx}`],
		rules,
	}
}

const layerImportBoundaryOverrides = RUNTIME_LAYERS.map(createLayerOverride).filter(
	(override) => Object.keys(override.rules).length > 0,
)

module.exports = {
	RUNTIME_LAYERS,
	FORBIDDEN_NON_RUNTIME_DIRS_BY_LAYER,
	layerImportBoundaryOverrides,
}
