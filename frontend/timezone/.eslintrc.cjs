module.exports = {
	root: true,
	extends: [
		"@dtyq/eslint-config/base",
		"@dtyq/eslint-config/typescript",
		"@dtyq/eslint-config/prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json", "./tsconfig.*.json"],
		ecmaVersion: "latest",
		sourceType: "module",
		warnOnUnsupportedTypeScriptVersion: false,
	},
	settings: {
		"import/resolver": {
			typescript: {
				project: ["./tsconfig.json", "./tsconfig.*json"],
			},
		},
	},
}
