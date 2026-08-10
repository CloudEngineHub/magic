const { layerImportBoundaryOverrides } = require("./eslint/layer-import-boundaries.cjs")
const { projectRuleOverrides } = require("./eslint/project-rule-overrides.cjs")
const path = require("path")

module.exports = {
	root: true,
	ignorePatterns: [
		"src/pages/superMagic/components/Detail/contents/HTML/templates/**",
		"src/pages/superMagic/stores/test.ts",
		"src/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/preview/__tests__/readFilesMockStream.test.ts",
	],
	extends: [
		"@dtyq/eslint-config/base",
		"@dtyq/eslint-config/typescript",
		"@dtyq/eslint-config/react",
		"@dtyq/eslint-config/prettier",
	],
	plugins: ["tailwindcss", "local", "compat"],
	parserOptions: {
		project: ["./tsconfig.eslint.json"],
		tsconfigRootDir: __dirname,
	},
	settings: {
		"import/core-modules": ["virtual:magic-api"],
		"import/resolver": {
			typescript: {
				project: ["./tsconfig.json", "./tsconfig.eslint.json", "./tsconfig.test.json"],
			},
		},
		react: {
			version: "detect",
		},
		tailwindcss: {
			config: path.resolve(__dirname, "tailwind.config.js"),
			callees: ["cn", "clsx", "cva"],
		},
		polyfills: [
			"Array.prototype.at",
			"Array.prototype.findLast",
			"Array.prototype.findLastIndex",
			"String.prototype.at",
			"String.prototype.replaceAll",
			"Object.hasOwn",
			"Promise.withResolvers",
			"window.requestIdleCallback",
			"window.cancelIdleCallback",
		],
	},
	rules: projectRuleOverrides,
	overrides: [
		...layerImportBoundaryOverrides,
		{
			files: ["*.cjs", "eslint/**/*.{cjs,js}"],
			parserOptions: {
				project: null,
			},
			env: {
				node: true,
			},
			rules: {
				"@typescript-eslint/no-var-requires": "off",
			},
		},
		{
			files: ["eslint/**/*.ts"],
			parserOptions: {
				project: null,
			},
		},
	],
}
