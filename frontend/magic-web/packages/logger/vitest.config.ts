import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
	resolve: {
		// Providers reuse the host app's release helper; mirror the app alias for package tests.
		alias: {
			"@": resolve(__dirname, "../../src"),
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		passWithNoTests: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.config.ts"],
		},
	},
})
