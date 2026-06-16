import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		name: "html2image",
		environment: "node",
		include: ["tests/**/*.test.ts"],
		globals: true,
		passWithNoTests: true,
		snapshotFormat: {
			printBasicPrototype: false,
		},
	},
})
