import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig(({ mode }) => {
	const isProd = mode === "production"

	return {
		publicDir: false,
		build: {
			outDir: "dist",
			// The public root contains unrelated deployment assets; widget builds only overwrite magic-widget.*.
			emptyOutDir: false,
			sourcemap: false,
			minify: isProd ? "esbuild" : false,
			lib: {
				entry: resolve(__dirname, "src/index.ts"),
				name: "MagicWidget",
				fileName: () => "magic-widget.js",
				formats: ["umd"],
			},
		},
	}
})
