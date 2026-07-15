import { resolve } from "node:path"
import type { UserConfig } from "vite"
import vitePluginMagicEnvProfiles from "../plugins/vite-plugin-env-profiles"
import type { LayerConfigContext } from "./layers"

export function getConfig({
	projectRoot,
	env = process.env,
}: Pick<LayerConfigContext, "projectRoot"> & Partial<Pick<LayerConfigContext, "env">>): UserConfig {
	return {
		// `root` and root-level HTML entries (index.html) are derived across layers
		// by the overlay stack (vite/layers.ts → vite-plugin-overlay), so this
		// baseline config declares neither.
		publicDir: resolve(projectRoot, "public"),
		plugins: [vitePluginMagicEnvProfiles({ projectRoot, env })],
		build: {
			rolldownOptions: {
				input: {
					// AudioWorklet processor as a separate entry for compilation. This is a
					// non-HTML shared entry, so it is declared explicitly here rather than
					// discovered by the HTML overlay.
					"worklets/recorder-worklet-processor": resolve(
						projectRoot,
						"src/services/recordSummary/MediaRecorderService/worklets/recorder-worklet-processor.ts",
					),
				},
			},
		},
	}
}

export default getConfig
