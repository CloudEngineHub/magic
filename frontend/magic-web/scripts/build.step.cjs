const { PNPM_COMMAND, pnpmArgs } = require("./lib/pnpm.cjs")

module.exports = [
	{
		id: "base:generate-icon-tags",
		name: "Generating icon tags",
		command: PNPM_COMMAND,
		args: pnpmArgs(["run", "generate:icon-tags"]),
		quiet: true,
	},
	{
		id: "base:build-iframe",
		name: "Building husky sandbox",
		command: PNPM_COMMAND,
		args: pnpmArgs(["run", "build:iframe"]),
		quiet: true,
	},
	{
		id: "base:build-widget",
		name: "Building widget SDK",
		command: PNPM_COMMAND,
		args: pnpmArgs(["run", "build:widget"]),
		quiet: true,
	},
]
