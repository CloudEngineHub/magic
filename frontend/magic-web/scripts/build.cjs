#!/usr/bin/env node

/**
 * Build script
 * Builds the same-origin HTML sandbox shell, widget SDK, obfuscates code,
 * generates icon tags, and builds the main app.
 *
 * Process lifecycle:
 * - Registers SIGINT/SIGTERM/SIGHUP handlers for graceful child cleanup.
 * - Spawns children in their own process group (detached) so the entire tree
 *   can be killed with a single signal.
 * - Escalates to SIGKILL after a configurable timeout if a child ignores SIGTERM.
 * - Appends (not overrides) NODE_OPTIONS for the vite build step.
 */

const { spawn } = require("child_process")
const { env } = require("process")
const { log, printBanner, writeStep, writeStepResult } = require("./lib/banner.cjs")

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000

function getShutdownTimeoutMs(envRef = env) {
	const parsed = Number(envRef.MAGIC_BUILD_SHUTDOWN_TIMEOUT_MS)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SHUTDOWN_TIMEOUT_MS
}

function mergeNodeOptions(envRef, extra) {
	const existing = envRef.NODE_OPTIONS || ""
	return [existing, extra].filter(Boolean).join(" ")
}

function isChildRunning(child) {
	if (!child || child.killed) return false
	if (child.exitCode !== null && child.exitCode !== undefined) return false
	if (child.signalCode !== null && child.signalCode !== undefined) return false
	return true
}

function createBuildController({
	envRef = env,
	processRef = process,
	spawnCommand = spawn,
	setTimer = setTimeout,
	clearTimer = clearTimeout,
	shutdownTimeoutMs = getShutdownTimeoutMs(envRef),
} = {}) {
	let activeChild = null
	let isShuttingDown = false
	let shutdownTimer = null

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
		}
	}

	const handleProcessExit = () => {
		if (isChildRunning(activeChild)) {
			killActiveChildGroup("SIGTERM", { escalate: false })
		}
	}

	const registerCleanupHandlers = () => {
		processRef.on("SIGINT", handleShutdown)
		processRef.on("SIGTERM", handleShutdown)
		processRef.on("SIGHUP", handleShutdown)
		processRef.on("exit", handleProcessExit)
	}

	const runCommand = (stepName, command, args, options = {}) => {
		if (isShuttingDown) return Promise.resolve()

		const { quiet, ...spawnOptions } = options

		return new Promise((resolve, reject) => {
			const child = spawnCommand(command, args, {
				stdio: quiet ? "pipe" : "inherit",
				detached: true,
				...spawnOptions,
			})

			activeChild = child

			let capturedOutput = ""
			if (quiet) {
				if (child.stdout) child.stdout.on("data", (d) => { capturedOutput += d })
				if (child.stderr) child.stderr.on("data", (d) => { capturedOutput += d })
			}

			child.on("close", (code) => {
				clearShutdownTimer()
				activeChild = null

				if (code !== 0 && code !== null && !isShuttingDown) {
					const msg = quiet && capturedOutput
						? `${stepName} failed with exit code ${code}\n${capturedOutput}`
						: `${stepName} failed with exit code ${code}`
					reject(new Error(msg))
				} else {
					resolve()
				}
			})

			child.on("error", (error) => {
				clearShutdownTimer()
				activeChild = null

				if (isShuttingDown) {
					resolve()
					return
				}

				const msg = quiet && capturedOutput
					? `${stepName} failed: ${error.message}\n${capturedOutput}`
					: `${stepName} failed: ${error.message}`
				reject(new Error(msg))
			})
		})
	}

	return {
		handleShutdown,
		isShutdownRequested: () => isShuttingDown,
		registerCleanupHandlers,
		runCommand,
	}
}

async function main(controller = createBuildController(), processExit = process.exit) {
	try {
		controller.registerCleanupHandlers()

		log("Starting build process...\n", "green")

		writeStep("[1/4] Generating icon tags...")
		await controller.runCommand("[1/4] generate:icon-tags", "pnpm", ["run", "generate:icon-tags"], { quiet: true })
		if (controller.isShutdownRequested()) return
		writeStepResult(true)

		writeStep("[2/4] Building husky sandbox...")
		await controller.runCommand("[2/4] build:iframe", "pnpm", ["run", "build:iframe"], { quiet: true })
		if (controller.isShutdownRequested()) return
		writeStepResult(true)

		writeStep("[3/4] Building widget SDK...")
		await controller.runCommand("[3/4] build:widget", "pnpm", ["run", "build:widget"], { quiet: true })
		if (controller.isShutdownRequested()) return
		writeStepResult(true)

		log("\n  [4/4] Building main application...\n", "cyan")
		await controller.runCommand("[4/4] vite build", "vite", ["build"], {
			env: {
				...env,
				NODE_OPTIONS: mergeNodeOptions(env, "--max-old-space-size=16384"),
			},
		})
		if (controller.isShutdownRequested()) return

		printBanner("Build completed successfully ✨")
	} catch (error) {
		if (!controller.isShutdownRequested()) {
			writeStepResult(false)
			log(`\n❌ Build failed: ${error.message}`, "red")
			processExit(1)
		}
	}
}

if (require.main === module) {
	main()
}

module.exports = {
	createBuildController,
	getShutdownTimeoutMs,
	isChildRunning,
	main,
	mergeNodeOptions,
}
