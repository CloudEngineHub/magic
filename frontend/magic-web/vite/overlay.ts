import { resolve } from "node:path"
import { mergeConfig, type UserConfig } from "vite"
import {
	buildOverlayFromLayers,
	mergeLayerConfigs,
	resolveLayerConfigs,
	type LayerConfig,
} from "./layers"

/**
 * The overlay stack — the single source of truth for "what overlays what". Each
 * entry declares ONLY what genuinely differs between layers:
 *   - rootDir: the folder whose presence activates the layer — this *is* the layer.
 *   - alias: import alias for that layer's source (false = none, i.e. the baseline).
 *   - reloadOnChange: only the baseline opts out (see below).
 *
 * Everything uniform (config module, source dir, derived name) is filled in by
 * {@link toLayerConfigs}. Array order IS merge order: earlier = baseline, later =
 * wins. Tools and plugins never hardcode these folders — they only consume the
 * resolved array.
 *
 * `reloadOnChange` is intentionally asymmetric. The layered-overlay plugin forces
 * a full page reload when a file is *added/removed* in a layer (content edits go
 * through normal HMR regardless of this flag):
 *   - baseline `src/` = false: a new base file can't flip an already-resolved
 *     module (baseline is lowest priority), so Vite's HMR suffices — reloading on
 *     every new src file would only hurt DX.
 *   - overlay `enterprise/src`, `customer/src` = true (plugin default): a new file
 *     there can start shadowing a loaded baseline module, a resolution flip Vite's
 *     module graph can't infer, so a full reload is required.
 */
const OVERLAY_STACK: {
	rootDir: string
	alias: string | false
	reloadOnChange?: boolean
}[] = [
	{ rootDir: ".", alias: false, reloadOnChange: false },
	{ rootDir: "enterprise", alias: "@enterprise" },
	{ rootDir: "customer", alias: "@customer" },
]

function toLayerConfigs(): LayerConfig[] {
	/** Every layer ships the same config module and source dir; only the root differs. */
	const LAYER_CONFIG_FILE = "vite/config.ts"
	const LAYER_SOURCE_DIR = "src"
	/** Name for the project-root layer (rootDir "."), whose dir name is unusable as a label. */
	const BASELINE_NAME = "base"

	return OVERLAY_STACK.map((entry) => ({
		name: entry.rootDir === "." ? BASELINE_NAME : entry.rootDir,
		rootDir: entry.rootDir,
		configFile: LAYER_CONFIG_FILE,
		sourceDir: LAYER_SOURCE_DIR,
		alias: entry.alias,
		reloadOnChange: entry.reloadOnChange,
	}))
}

/**
 * Compose the Vite config from the active overlay stack. A layer joins purely by
 * folder existence (resolved in layers.ts). Config that belongs to the *stack*
 * rather than any single layer is applied here, so per-layer config files stay
 * free of overlay bookkeeping:
 *   - cacheDir: isolate the dep pre-bundle per distinct overlay stack so switching
 *     stacks never serves a stale overlay resolution.
 *   - server.port: read from the environment only (PORT); unset → Vite's default.
 *     No port is hardcoded anywhere — dev tooling loads it from .env into the
 *     environment and it rides process.env into the Vite child.
 *   - root-level HTML entries: derived by unioning `*.html` across the active
 *     layers (baseline overridden by more-specific layers), while `root` is
 *     ALWAYS the baseline project root — winning overlay entries are projected
 *     onto virtual baseline paths and served/emitted by the html-overlay
 *     plugin. Per-layer config files therefore never enumerate HTML entries or
 *     set `root`.
 *
 * Kept synchronous because both vite.config.ts and vitest.config.ts consume it
 * synchronously.
 */
export function getOverlayViteConfig({ projectRoot }: { projectRoot: string }): UserConfig {
	const layers = resolveLayerConfigs({ projectRoot, layers: toLayerConfigs() })

	const stackConfig: UserConfig = {
		cacheDir: resolve(
			projectRoot,
			"node_modules/.vite",
			layers.map((layer) => layer.name).join("-"),
		),
		server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
	}

	return [
		stackConfig,
		mergeLayerConfigs({ projectRoot, layers }),
		buildOverlayFromLayers({ projectRoot, layers }),
	].reduce<UserConfig>((acc, partial) => mergeConfig(acc, partial), {})
}
