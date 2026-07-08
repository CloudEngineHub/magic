import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		name: "html-sandbox",
		environment: "jsdom",
		include: ["src/**/__tests__/*.test.ts"],
		globals: true,
		snapshotFormat: {
			printBasicPrototype: false,
		},
	},
})
