import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		name: "magic-widget-sdk",
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		globals: true,
		passWithNoTests: true,
		snapshotFormat: {
			printBasicPrototype: false,
		},
	},
})
