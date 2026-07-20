import { resolve } from "path"
import { defineConfig, mergeConfig } from "vitest/config"
import { getOverlayViteConfig } from "./vite/overlay"

const fixAntdLocaleImportExtensions = () => ({
	name: "fix-antd-locale-import-extensions",
	enforce: "pre" as const,
	transform(code: string, id: string) {
		const normalizedId = id.replace(/\\/g, "/")
		if (!normalizedId.includes("/node_modules/antd/es/")) return

		if (
			!normalizedId.includes("/locale/") &&
			!normalizedId.includes("/date-picker/") &&
			!normalizedId.includes("/calendar/")
		) {
			return
		}

		return code
			.replace(
				/(["'])rc-pagination\/es\/locale\/([^."']+)\1/g,
				"$1rc-pagination/es/locale/$2.js$1",
			)
			.replace(/(["'])rc-picker\/es\/locale\/([^."']+)\1/g, "$1rc-picker/es/locale/$2.js$1")
			.replace(
				/(["'])((?:\.\.\/)+(?:calendar|date-picker|time-picker)\/locale\/[^."']+)\1/g,
				"$1$2.js$1",
			)
	},
})

const getVitestBaseConfig = () => {
	return {
		plugins: [fixAntdLocaleImportExtensions()],
		resolve: {
			alias: [
				{
					find: "@admin/",
					replacement: `${resolve(__dirname, "packages/magic-admin/src")}/`,
				},
				{
					find: /^antd\/es\/locale\/[^/]+$/,
					replacement: resolve(__dirname, "test/mocks/empty-locale.ts"),
				},
				{
					find: /^rc-pagination\/es\/locale\/[^/]+$/,
					replacement: resolve(__dirname, "test/mocks/empty-locale.ts"),
				},
				{
					find: /^rc-picker\/es\/locale\/[^/]+$/,
					replacement: resolve(__dirname, "test/mocks/empty-locale.ts"),
				},
				{
					find: "@/",
					replacement: `${resolve(__dirname, "./src/")}/`,
				},
				{
					find: "virtual:magic-api",
					replacement: resolve(__dirname, "test/mocks/magic-api-prelude.ts"),
				},
				{
					find: /^@dtyq\/html-sandbox\/index\.html(\?raw)?$/,
					replacement: `${resolve(__dirname, "packages/html-sandbox/index.html")}$1`,
				},
				{
					find: "@dtyq/html-sandbox/runtime",
					replacement: resolve(__dirname, "packages/html-sandbox/src/runtime/index.ts"),
				},
				{
					find: "@dtyq/html-sandbox/utils/parentOrigin",
					replacement: resolve(
						__dirname,
						"packages/html-sandbox/src/utils/parentOrigin.ts",
					),
				},
				{
					find: "@dtyq/html-sandbox/telemetry",
					replacement: resolve(__dirname, "packages/html-sandbox/src/telemetry/index.ts"),
				},
				{
					find: "@dtyq/html-sandbox",
					replacement: resolve(__dirname, "packages/html-sandbox/src/index.ts"),
				},
				{
					find: /^@dtyq\/html-sandbox\/(.+)$/,
					replacement: resolve(__dirname, "packages/html-sandbox/src/$1"),
				},
				{
					find: "@dtyq/es6-template-strings",
					replacement: resolve(__dirname, "test/mocks/es6-template-strings.ts"),
				},
				// Keep Vitest aligned with app-local package aliases that are normally resolved by Vite.
				{
					find: "@dtyq/magic-admin/locales",
					replacement: resolve(__dirname, "packages/magic-admin/src/locales/index.ts"),
				},
				{
					find: "@dtyq/x-markdown",
					replacement: resolve(__dirname, "packages/x-markdown/src/index.ts"),
				},
			],
		},
		test: {
			environment: "jsdom",
			globals: true,
			setupFiles: [resolve(__dirname, "test/setup.ts")],
			env: {
				CI: process.env.CI === "true" ? "true" : undefined,
			},
			server: {
				deps: {
					inline: [
						"antd",
						"esdk-obs-browserjs",
						"@dtyq/upload-sdk",
						"@dtyq/es6-template-strings",
						"@dtyq/magic-flow",
						"@dtyq/upload-sdk",
						"rc-pagination",
						"rc-picker",
					],
				},
			},
		},
	}
}

export default defineConfig(
	mergeConfig(getVitestBaseConfig(), {
		resolve: getOverlayViteConfig({ projectRoot: __dirname, mode: "test", loadEnv: false })
			.resolve,
	}),
)
