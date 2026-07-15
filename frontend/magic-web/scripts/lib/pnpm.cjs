/**
 * Run pnpm through Corepack so child lifecycle steps use the packageManager
 * version declared by this workspace instead of whichever global pnpm appears
 * first on PATH.
 */
const PNPM_COMMAND = "corepack"
const PNPM_ARGS_PREFIX = ["pnpm"]

function pnpmArgs(args = []) {
	return [...PNPM_ARGS_PREFIX, ...args]
}

function pnpmScript(script) {
	return [PNPM_COMMAND, ...PNPM_ARGS_PREFIX, script].join(" ")
}

module.exports = {
	PNPM_COMMAND,
	pnpmArgs,
	pnpmScript,
}
