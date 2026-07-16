const { existsSync, readFileSync } = require("node:fs")
const { resolve } = require("node:path")
const { parse } = require("dotenv")
const { expand } = require("dotenv-expand")
const { resolveActiveLayers } = require("./edition.cjs")

/** Vite's standard env file order: later files override earlier file slots. */
function getEnvFileNames(mode) {
	if (mode === "local") {
		throw new Error('"local" cannot be used as a mode because it conflicts with .env.local')
	}

	return [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]
}

/**
 * Resolve one winning physical file for every standard env file name. This is
 * deliberately file-level overlay behavior: if enterprise/.env exists, the
 * baseline .env is not parsed at all, including keys absent from enterprise.
 */
function resolveLayeredEnvFiles({
	projectRoot = process.cwd(),
	mode,
	layers = resolveActiveLayers(projectRoot),
	fileExists = existsSync,
} = {}) {
	return getEnvFileNames(mode).flatMap((fileName) => {
		for (let index = layers.length - 1; index >= 0; index -= 1) {
			const layer = layers[index]
			const filePath = resolve(projectRoot, layer.rootDir, fileName)
			if (fileExists(filePath)) return [{ fileName, filePath, layer: layer.name }]
		}

		return []
	})
}

/**
 * Parse only the selected files, then apply normal env-file precedence between
 * the four distinct file slots. Shell/CI variables remain the final authority.
 */
function loadLayeredEnvFiles({
	projectRoot = process.cwd(),
	mode,
	processEnv = process.env,
	layers,
	fileExists = existsSync,
	readFile = readFileSync,
} = {}) {
	const files = resolveLayeredEnvFiles({ projectRoot, mode, layers, fileExists })
	const parsed = {}

	for (const file of files) {
		Object.assign(parsed, parse(readFile(file.filePath, "utf8")))
	}

	const expanded =
		expand({
			parsed: { ...parsed },
			// Expansion may read shell variables, but must not mutate the caller's env.
			processEnv: { ...processEnv },
		}).parsed ?? parsed

	return {
		env: { ...expanded, ...processEnv },
		files,
	}
}

function applyLayeredEnvFiles(options = {}) {
	const processEnv = options.processEnv ?? process.env
	const result = loadLayeredEnvFiles({ ...options, processEnv })

	for (const [key, value] of Object.entries(result.env)) {
		if (value !== undefined) processEnv[key] = value
	}

	return result
}

module.exports = {
	applyLayeredEnvFiles,
	getEnvFileNames,
	loadLayeredEnvFiles,
	resolveLayeredEnvFiles,
}
