import { createRequire } from "node:module"
import { resolve } from "node:path"
import { mergeConfig, type UserConfig } from "vite"
import {
	buildOverlayFromLayers,
	mergeLayerConfigs,
	resolveLayerConfigs,
	type LayerConfig,
} from "./layers"

const requireModule = createRequire(import.meta.url)
const { resolveActiveLayers } = requireModule("../scripts/lib/edition.cjs") as {
	resolveActiveLayers: (projectRoot: string) => LayerConfig[]
}
const { applyLayeredEnvFiles } = requireModule("../scripts/lib/env-overlay.cjs") as {
	applyLayeredEnvFiles: (options: { projectRoot: string; mode: string }) => {
		env: Record<string, string | undefined>
	}
}

/**
 * Compose the Vite config from the active overlay stack. A layer joins purely by
 * folder existence (resolved in layers.ts). Config that belongs to the *stack*
 * rather than any single layer is applied here, so per-layer config files stay
 * free of overlay bookkeeping:
 *   - cacheDir: isolate the dep pre-bundle per distinct overlay stack so switching
 *     stacks never serves a stale overlay resolution.
 *   - env files: resolve one whole-file winner per standard Vite env file name,
 *     then disable Vite's root-only reload so replaced baseline keys cannot leak.
 *   - server.port: read from that resolved env only (PORT); unset → Vite's default.
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
export function getOverlayViteConfig({
	projectRoot,
	mode = "development",
	loadEnv = true,
}: {
	projectRoot: string
	mode?: string
	loadEnv?: boolean
}): UserConfig {
	const layers = resolveLayerConfigs({ projectRoot, layers: resolveActiveLayers(projectRoot) })
	const env = loadEnv ? applyLayeredEnvFiles({ projectRoot, mode }).env : process.env

	const stackConfig: UserConfig = {
		// Vite must not load the root env directory again, otherwise keys from a
		// lower-priority file that was replaced as a whole would leak back in.
		...(loadEnv ? { envDir: false } : {}),
		cacheDir: resolve(
			projectRoot,
			"node_modules/.vite",
			layers.map((layer) => layer.name).join("-"),
		),
		server: { port: env.PORT ? Number(env.PORT) : undefined },
	}

	return [
		stackConfig,
		mergeLayerConfigs({ projectRoot, layers, mode, env }),
		buildOverlayFromLayers({ projectRoot, layers }),
	].reduce<UserConfig>((acc, partial) => mergeConfig(acc, partial), {})
}
