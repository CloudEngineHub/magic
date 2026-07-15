#!/usr/bin/env node

/**
 * Root postinstall hook: sync dependencies of edition overlay install roots.
 *
 * Overlay folders (enterprise/, customer/) may be standalone pnpm install
 * roots with their own pnpm-workspace.yaml and pnpm-lock.yaml — intentionally
 * NOT workspace members, so the open-source root lockfile never references
 * commercial dependencies. The trade-off is that the root `pnpm install` does
 * not cover them; this hook bridges the gap so one root install brings every
 * present overlay up to date. Open-source checkouts have no overlay folders
 * and skip silently, keeping the baseline free of edition-specific behavior.
 */

const { spawnSync } = require("node:child_process")
const { existsSync } = require("node:fs")
const { resolve } = require("node:path")
const { log } = require("./lib/banner.cjs")
const { OVERLAY_FOLDERS } = require("./lib/edition.cjs")
const { PNPM_COMMAND, pnpmArgs } = require("./lib/pnpm.cjs")

/**
 * npm_config_* suffixes (after stripping the "npm_config_" prefix) that
 * represent user/CI configuration — not parent CLI flags — and must survive
 * into the nested overlay install.
 *
 * Exact strings are compared with ===; RegExp entries are tested against the
 * lowercased suffix.
 */
const CONFIG_PASSTHROUGH_PATTERNS = [
	// Registry (global and scoped, e.g. npm_config_@feb:registry)
	"registry",
	/^@.+:registry$/,
	// Auth credentials: npm_config_//host/:_authToken, _auth, _password, username
	/^\/\/.+/,
	// Proxy
	"proxy",
	"https_proxy",
	"https-proxy",
	"no_proxy",
	"no-proxy",
	"noproxy",
	// SSL/TLS
	"strict_ssl",
	"strict-ssl",
	"cafile",
	"cert",
	"key",
	// Config file pointers
	"userconfig",
	"globalconfig",
]

/**
 * Returns true when the given env key is an npm_config_* variable that should
 * pass through to the nested install (registry, auth, proxy, SSL config).
 */
function shouldPassthrough(envKey) {
	const lower = envKey.toLowerCase()
	if (!lower.startsWith("npm_config_")) return false
	const suffix = lower.slice("npm_config_".length)
	return CONFIG_PASSTHROUGH_PATTERNS.some((p) =>
		typeof p === "string" ? suffix === p : p.test(suffix),
	)
}

/**
 * The parent `pnpm install` exports its CLI flags and resolved config to
 * lifecycle scripts as npm_config_* environment variables. A nested install
 * must not inherit them, otherwise root-level options (e.g. --frozen-lockfile,
 * filters, offline mode) silently leak into the overlay install. CI stays
 * frozen regardless: pnpm derives that default from the CI variable, which is
 * deliberately preserved here.
 *
 * Registry, auth, proxy, and SSL variables are preserved so private-registry
 * installations continue to work regardless of whether credentials are
 * file-based (.npmrc) or environment-based.
 */
function cleanedEnv(env = process.env) {
	const result = {}
	for (const [key, value] of Object.entries(env)) {
		if (key.toLowerCase().startsWith("npm_config_") && !shouldPassthrough(key)) continue
		result[key] = value
	}
	return result
}

/**
 * Overlay install roots are discovered by filesystem shape, mirroring
 * resolveEdition(): a folder participates when it declares its own
 * package.json. Returns the folders that were installed.
 */
function installOverlayDeps({
	projectRoot = process.cwd(),
	env = process.env,
	spawn = spawnSync,
	overlayFolders = OVERLAY_FOLDERS,
	fileExists = existsSync,
	logger = log,
} = {}) {
	const installed = []

	for (const folder of overlayFolders) {
		if (!fileExists(resolve(projectRoot, folder, "package.json"))) continue

		logger(`[postinstall] Syncing ${folder}/ dependencies (standalone install root)...`, "cyan")
		const { error, status } = spawn(PNPM_COMMAND, pnpmArgs(["install", "--dir", folder]), {
			cwd: projectRoot,
			stdio: "inherit",
			env: cleanedEnv(env),
		})

		if (error) throw error
		if (status !== 0) {
			throw new Error(`${folder}/ dependency install failed with exit code ${status}`)
		}

		installed.push(folder)
	}

	return installed
}

function main() {
	try {
		installOverlayDeps()
	} catch (error) {
		log(`\n❌ ${error.message}`, "red")
		process.exit(1)
	}
}

if (require.main === module) {
	main()
}

module.exports = {
	cleanedEnv,
	installOverlayDeps,
	main,
	shouldPassthrough,
}
