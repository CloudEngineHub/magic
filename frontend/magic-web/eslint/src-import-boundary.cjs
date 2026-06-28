const restrictedZoneDirectories = [
	"enterprise",
	"plugins",
	"scripts",
	"test",
	"types",
	"vite",
]

const restrictedZoneRules = restrictedZoneDirectories.map((directoryName) => ({
	target: "./src",
	from: `./${directoryName}`,
	message: `Files in "src/" cannot import from "${directoryName}/".`,
}))

const restrictedImportPatterns = [
	{
		group: ["@enterprise", "@enterprise/*", "@enterprise/**"],
		message: 'Files in "src/" cannot import from "@enterprise/*".',
	},
	{
		group: ["enterprise", "enterprise/*", "enterprise/**"],
		message: 'Files in "src/" cannot import from "enterprise/*".',
	},
]

module.exports = {
	srcImportBoundaryOverride: {
		files: ["src/**/*.{ts,tsx,js,jsx}"],
		rules: {
			"import/no-restricted-paths": [
				"error",
				{
					zones: restrictedZoneRules,
				},
			],
			"no-restricted-imports": [
				"error",
				{
					patterns: restrictedImportPatterns,
				},
			],
		},
	},
}
