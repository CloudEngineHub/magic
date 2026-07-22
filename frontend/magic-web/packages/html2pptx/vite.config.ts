import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { defineConfig, type UserConfig } from "vite"

const projectRoot = fileURLToPath(new URL(".", import.meta.url))

function getBaseViteConfig({ mode }: { mode: string }): UserConfig {
	const isProd = mode === "production"

	return {
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

export default defineConfig((configEnv) => getBaseViteConfig({ mode: configEnv.mode }))
