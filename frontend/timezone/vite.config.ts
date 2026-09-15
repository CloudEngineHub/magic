import { defineConfig } from "vitest/config"
import dts from "vite-plugin-dts"

export default defineConfig(({ mode }) => {
	const isUmd = mode === "umd"

	return {
		build: isUmd
			? {
				lib: {
					entry: "src/index.ts",
					name: "timezone",
					formats: ["umd"],
					fileName: () => "index.min.js",
				},
				minify: "terser",
				emptyOutDir: false,
				rollupOptions: {
					external: ["dayjs", "dayjs/plugin/utc", "dayjs/plugin/timezone"],
					output: {
						dir: "dist",
						inlineDynamicImports: true,
						globals: {
							dayjs: "dayjs",
							"dayjs/plugin/utc": "dayjs_plugin_utc",
							"dayjs/plugin/timezone": "dayjs_plugin_timezone",
						},
					},
				},
			}
			: {
				lib: {
					entry: "src/index.ts",
					name: "timezone",
				},
				minify: false,
				emptyOutDir: true,
				rollupOptions: {
					external: ["dayjs", "dayjs/plugin/utc", "dayjs/plugin/timezone"],
					output: [
						{
							format: "es",
							dir: "dist/es",
							preserveModules: true,
							preserveModulesRoot: "src",
							entryFileNames: "[name].js",
						},
						{
							format: "cjs",
							dir: "dist/lib",
							preserveModules: true,
							preserveModulesRoot: "src",
							entryFileNames: "[name].js",
							exports: "named",
						},
					],
				},
			},
		plugins: isUmd
			? []
			: [
				dts({
					tsconfigPath: "./tsconfig.json",
					outDir: "dist/es",
					insertTypesEntry: true,
				}),
			],
		test: {
			include: ["test/**/*.test.ts"],
			environment: "jsdom",
			globals: true,
			coverage: {
				provider: "v8",
				include: ["src/**/*.ts"],
				exclude: [
					"**/*.d.ts",
					"**/test/**",
					"**/dist/**",
					"**/node_modules/**",
					"commitlint.config.cjs",
					"scripts/**",
				],
				reporter: ["text", "lcov"],
				reportsDirectory: "coverage",
			},
		},
	}
})
