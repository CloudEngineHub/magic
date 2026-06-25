#!/usr/bin/env node

/**
 * Development script
 * Syncs theme RGB tokens, runs icon generation, and starts dev servers
 */

const { spawn } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

// Color codes for output
const colors = {
	cyan: "\x1b[36m",
	yellow: "\x1b[33m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	reset: "\x1b[0m",
}

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`)
}

function getPidFilePath() {
	return path.join(os.tmpdir(), `magic-web-dev-${Buffer.from(process.cwd()).toString("hex")}.pid`)
}

function writePidFile() {
	fs.writeFileSync(getPidFilePath(), String(process.pid), "utf8")
}

function cleanupPidFile() {
	const pidFilePath = getPidFilePath()

	if (!fs.existsSync(pidFilePath)) {
		return
	}

	try {
		const recordedPid = fs.readFileSync(pidFilePath, "utf8").trim()

		if (recordedPid === String(process.pid)) {
			fs.unlinkSync(pidFilePath)
		}
	} catch {
		// Ignore pid file cleanup failures on shutdown.
	}
}

/** Reference to the currently running child process, used for graceful shutdown. */
let activeChild = null

/** Whether a shutdown has been initiated (to suppress spurious error messages). */
let isShuttingDown = false

function registerCleanupHandlers() {
	const handleExit = () => {
		if (isShuttingDown) return
		isShuttingDown = true
		cleanupPidFile()

		if (activeChild && !activeChild.killed) {
			// Kill the child process group so all descendants (vite, iframe, etc.) are terminated.
			// This ensures port 443 is released before we exit.
			try {
				process.kill(-activeChild.pid, "SIGTERM")
			} catch {
				// Process may have already exited; try a direct kill as fallback.
				try {
					activeChild.kill("SIGTERM")
				} catch {
					// Ignore — already gone.
				}
			}
		}

		// Do NOT call process.exit() here. Let the child's 'close' event fire first so
		// the port is released before we exit. The process will exit naturally once the
		// event loop drains (i.e. after activeChild closes).
	}

	process.on("SIGINT", handleExit)
	process.on("SIGTERM", handleExit)
	process.on("exit", cleanupPidFile)
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			shell: true,
			// detached: true puts the child in its own process group so we can kill the
			// entire group (process.kill(-pid, signal)) on shutdown.
			detached: true,
			...options,
		})

		activeChild = child

		child.on("close", (code) => {
			activeChild = null
			// Treat signal-induced exits (code 130 = SIGINT, code 143 = SIGTERM) and
			// null (killed by signal) as clean exits when we initiated the shutdown.
			if (code !== 0 && code !== null && !isShuttingDown) {
				reject(new Error(`Command failed with code ${code}`))
			} else {
				resolve()
			}
		})

		child.on("error", reject)
	})
}

async function main() {
	try {
		writePidFile()
		registerCleanupHandlers()

		log("Starting development environment...", "green")

		// Sync theme RGB tokens first
		log("Syncing theme RGB tokens...", "cyan")
		await runCommand("pnpm", ["run", "generate:theme-rgb-tokens"])
		log("Theme RGB tokens synced successfully", "green")

		// Generate icon tags first
		log("Generating icon tags...", "cyan")
		await runCommand("node", ["scripts/icons/gen-tabler-icon-tags.cjs"])
		log("Icon tags generated successfully", "green")

		// Generate the same-origin HTML sandbox shell before Vite serves public assets.
		log("Building husky HTML sandbox shell...", "cyan")
		await runCommand("pnpm", ["run", "build:iframe"])
		log("Husky HTML sandbox shell built successfully", "green")

		// Start concurrently with the main app and the husky shell watcher.
		log("Starting dev servers...", "cyan")
		await runCommand(
			"concurrently",
			[
				'"vite"',
				'"pnpm dev:iframe"',
				"--names",
				'"main,husky"',
				"--prefix-colors",
				'"cyan,yellow"',
			],
			{ stdio: "inherit" },
		)
	} catch (error) {
		if (!isShuttingDown) {
			log(`Error: ${error.message}`, "red")
			process.exit(1)
		}
	}
}

main()
