import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import { getPackagingRuntimeIdentityDefine } from "../vite.config"

export default defineConfig({
	define: getPackagingRuntimeIdentityDefine(),
	root: fileURLToPath(new URL(".", import.meta.url)),
	test: {
		environment: "node",
		include: ["browser/**/*.test.ts"],
	},
})
