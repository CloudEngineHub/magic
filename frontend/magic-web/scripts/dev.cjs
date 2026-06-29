#!/usr/bin/env node

/**
 * Development script
 * Syncs theme RGB tokens, runs icon generation, and starts dev servers
 */

const { spawn } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000
const DEFAULT_DEV_PORT = 443

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

function getPidFilePath(cwd = process.cwd(), tmpDir = os.tmpdir()) {
	return path.join(tmpDir, `magic-web-dev-${Buffer.from(cwd).toString("hex")}.pid`)
}

function getShutdownTimeoutMs(env = process.env) {
	const parsedTimeout = Number(env.MAGIC_DEV_SHUTDOWN_TIMEOUT_MS)

	return Number.isFinite(parsedTimeout) && parsedTimeout > 0
		? parsedTimeout
		: DEFAULT_SHUTDOWN_TIMEOUT_MS
}

function getDevPort(env = process.env) {
	const parsedPort = Number(env.PORT)

	return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_DEV_PORT
}

function createPidRecord({ cwd, pid, port, activeChild, activeCommand, startedAt }) {
	const record = {
		pid,
		cwd,
		port,
		startedAt,
	}

	if (activeChild?.pid) {
		record.activeChildPid = activeChild.pid
		// Detached children use their pid as process group id on POSIX platforms.
		record.activeChildPgid = activeChild.pid
	}

	if (activeCommand) {
		record.activeCommand = activeCommand
	}

	return record
}

function serializePidRecord(record) {
	return `${JSON.stringify(record, null, 2)}\n`
}

function isChildRunning(child) {
	if (!child || child.killed) return false
	if (child.exitCode !== null && child.exitCode !== undefined) return false
	if (child.signalCode !== null && child.signalCode !== undefined) return false

	return true
}

function createDevController({
	cwd = process.cwd(),
	env = process.env,
	fsRef = fs,
	processRef = process,
	spawnCommand = spawn,
	tmpDir = os.tmpdir(),
	setTimer = setTimeout,
	clearTimer = clearTimeout,
	shutdownTimeoutMs = getShutdownTimeoutMs(env),
} = {}) {
	/** Reference to the currently running child process, used for graceful shutdown. */
	let activeChild = null

	/** Whether a shutdown has been initiated (to suppress spurious error messages). */
	let isShuttingDown = false
	let activeCommand = null
	let shutdownTimer = null
	const startedAt = new Date().toISOString()
	const pidFilePath = getPidFilePath(cwd, tmpDir)

	const writePidFile = () => {
		fsRef.writeFileSync(
			pidFilePath,
			serializePidRecord(
				createPidRecord({
					cwd,
					pid: processRef.pid,
					port: getDevPort(env),
					activeChild,
					activeCommand,
					startedAt,
				}),
			),
			"utf8",
		)
	}

	const cleanupPidFile = () => {
		if (!fsRef.existsSync(pidFilePath)) {
			return
		}

		try {
			const recordedPid = JSON.parse(fsRef.readFileSync(pidFilePath, "utf8")).pid

			if (recordedPid === processRef.pid) {
				fsRef.unlinkSync(pidFilePath)
			}
		} catch {
			// Keep cleanup backward compatible with old numeric pid files.
			try {
				const recordedPid = fsRef.readFileSync(pidFilePath, "utf8").trim()

				if (recordedPid === String(processRef.pid)) {
					fsRef.unlinkSync(pidFilePath)
				}
			} catch {
				// Ignore pid file cleanup failures on shutdown.
			}
		}
	}

	const clearShutdownTimer = () => {
		if (!shutdownTimer) return
		clearTimer(shutdownTimer)
		shutdownTimer = null
	}

	const killActiveChildGroup = (signal, { escalate = true } = {}) => {
		if (!isChildRunning(activeChild)) return

		const childPid = activeChild.pid

		try {
			processRef.kill(-childPid, signal)
		} catch {
			// Process group signaling may fail after partial teardown; fall back to direct child kill.
			try {
				activeChild.kill(signal)
			} catch {
				// Ignore already-closed children.
			}
		}

		if (!escalate || signal === "SIGKILL" || shutdownTimer) return

		shutdownTimer = setTimer(() => {
			shutdownTimer = null
			if (isChildRunning(activeChild)) {
				killActiveChildGroup("SIGKILL", { escalate: false })
			}
		}, shutdownTimeoutMs)

		if (typeof shutdownTimer.unref === "function") {
			shutdownTimer.unref()
		}
	}

	const handleShutdown = () => {
		if (isShuttingDown) return
		isShuttingDown = true

		if (isChildRunning(activeChild)) {
			killActiveChildGroup("SIGTERM")
			return
		}

		cleanupPidFile()
	}

	const handleProcessExit = () => {
		if (isChildRunning(activeChild)) {
			// Leave the pid file behind so stop-dev can use the recorded process group.
			killActiveChildGroup("SIGTERM", { escalate: false })
			return
		}

		cleanupPidFile()
	}

	const registerCleanupHandlers = () => {
		processRef.on("SIGINT", handleShutdown)
		processRef.on("SIGTERM", handleShutdown)
		processRef.on("SIGHUP", handleShutdown)
		processRef.on("exit", handleProcessExit)
	}

	const runCommand = (command, args, options = {}) => {
		if (isShuttingDown) {
			return Promise.resolve()
		}

		return new Promise((resolve, reject) => {
			const child = spawnCommand(command, args, {
				stdio: "inherit",
				shell: true,
				// detached: true puts the child in its own process group so we can kill
				// the entire group (vite, pnpm watch, esbuild services) on shutdown.
				detached: true,
				...options,
			})

			activeChild = child
			activeCommand = [command, ...args].join(" ")
			writePidFile()

			child.on("close", (code) => {
				clearShutdownTimer()
				activeChild = null
				activeCommand = null

				if (isShuttingDown) {
					cleanupPidFile()
				} else {
					writePidFile()
				}

				// Treat signal-induced exits (code 130 = SIGINT, code 143 = SIGTERM) and
				// null (killed by signal) as clean exits when we initiated the shutdown.
				if (code !== 0 && code !== null && !isShuttingDown) {
					reject(new Error(`Command failed with code ${code}`))
				} else {
					resolve()
				}
			})

			child.on("error", (error) => {
				clearShutdownTimer()
				activeChild = null
				activeCommand = null
				if (isShuttingDown) {
					cleanupPidFile()
					resolve()
					return
				}

				writePidFile()
				reject(error)
			})
		})
	}

	return {
		cleanupPidFile,
		getPidFilePath: () => pidFilePath,
		handleShutdown,
		isShutdownRequested: () => isShuttingDown,
		registerCleanupHandlers,
		runCommand,
		writePidFile,
	}
}

async function main(controller = createDevController(), processExit = process.exit) {
	try {
		controller.writePidFile()
		controller.registerCleanupHandlers()

		log("Starting development environment...", "green")

		// Sync theme RGB tokens first
		log("Syncing theme RGB tokens...", "cyan")
		await controller.runCommand("pnpm", ["run", "generate:theme-rgb-tokens"])
		if (controller.isShutdownRequested()) return
		log("Theme RGB tokens synced successfully", "green")

		// Generate icon tags first
		log("Generating icon tags...", "cyan")
		await controller.runCommand("node", ["scripts/icons/gen-tabler-icon-tags.cjs"])
		if (controller.isShutdownRequested()) return
		log("Icon tags generated successfully", "green")

		// Generate the same-origin HTML sandbox shell before Vite serves public assets.
		log("Building husky HTML sandbox shell...", "cyan")
		await controller.runCommand("pnpm", ["run", "build:iframe"])
		if (controller.isShutdownRequested()) return
		log("Husky HTML sandbox shell built successfully", "green")

		// Start concurrently with the main app and the husky shell watcher.
		log("Starting dev servers...", "cyan")
		await controller.runCommand(
			"concurrently",
			[
				'"vite"',
				'"pnpm dev:iframe"',
				"--names",
				'"main,husky"',
				"--prefix-colors",
				'"cyan,yellow"',
				"--kill-others",
				"--kill-signal",
				'"SIGTERM"',
				"--kill-timeout",
				String(getShutdownTimeoutMs()),
			],
			{ stdio: "inherit" },
		)
	} catch (error) {
		if (!controller.isShutdownRequested()) {
			log(`Error: ${error.message}`, "red")
			processExit(1)
		}
	} finally {
		if (!controller.isShutdownRequested()) {
			controller.cleanupPidFile()
		}
	}
}

if (require.main === module) {
	main()
}

module.exports = {
	createDevController,
	createPidRecord,
	getDevPort,
	getPidFilePath,
	getShutdownTimeoutMs,
	isChildRunning,
	main,
	serializePidRecord,
}
