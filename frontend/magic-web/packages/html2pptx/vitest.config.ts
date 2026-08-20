import { defineConfig } from "vitest/config"
import { getPackagingRuntimeIdentityDefine } from "./vite.config"

export default defineConfig({
	define: getPackagingRuntimeIdentityDefine(),
	test: {
		name: "html2pptx",
		environment: "node",
		include: ["tests/**/*.test.ts"],
		globals: true,
		snapshotFormat: {
			printBasicPrototype: false,
		},
	},
})
