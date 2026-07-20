#!/usr/bin/env node

/**
 * Build script
 * Builds the same-origin HTML sandbox shell, widget SDK, generated icon tags,
 * edition-contributed build-only pre steps, and finally the main app.
 *
 * Process lifecycle:
 * - Registers SIGINT/SIGTERM/SIGHUP handlers for graceful child cleanup.
 * - Spawns children in their own process group (detached) so the entire tree
 *   can be killed with a single signal.
 * - Escalates to SIGKILL after a configurable timeout if a child ignores SIGTERM.
 * - Appends (not overrides) NODE_OPTIONS for the vite build step.
 */

const { spawn } = require("child_process")
const { existsSync } = require("node:fs")
const { resolve } = require("node:path")
const { env } = require("process")
const { log, printBanner, writeStep, writeStepResult } = require("./lib/banner.cjs")
const { EDITIONS, resolveEdition } = require("./lib/edition.cjs")
const { applyLayeredEnvFiles } = require("./lib/env-overlay.cjs")

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000
const BUILD_STEP_FILE_NAME = "build.step.cjs"

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
				if (child.stdout)
					child.stdout.on("data", (d) => {
						capturedOutput += d
					})
				if (child.stderr)
					child.stderr.on("data", (d) => {
						capturedOutput += d
					})
			}

			child.on("close", (code) => {
				clearShutdownTimer()
				activeChild = null

				if (code !== 0 && code !== null && !isShuttingDown) {
					const msg =
						quiet && capturedOutput
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

				const msg =
					quiet && capturedOutput
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

function slugifyStepName(name) {
	return String(name)
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase()
}

function normalizeBuildStep(step) {
	const layer = step.layer || "base"
	const name = step.name

	return {
		id: step.id || `${layer}:${slugifyStepName(name)}`,
		name,
		command: step.command,
		args: step.args || [],
		quiet: step.quiet !== false,
		options: step.options || {},
		layer,
	}
}

function createViteBuildStep({ edition, envRef = env } = {}) {
	return normalizeBuildStep({
		id: "base:vite-build",
		name: "Building main application",
		command: "vite",
		args: ["build"],
		quiet: false,
		options: {
			env: {
				...envRef,
				EDITION: edition,
				NODE_OPTIONS: mergeNodeOptions(envRef, "--max-old-space-size=16384"),
			},
		},
	})
}

function resolveBuildStepFile({
	projectRoot = process.cwd(),
	edition = resolveEdition(projectRoot),
	fileExists = existsSync,
} = {}) {
	const baseStepFile = resolve(projectRoot, "scripts", BUILD_STEP_FILE_NAME)
	const enterpriseStepFile = resolve(projectRoot, "enterprise", "scripts", BUILD_STEP_FILE_NAME)

	// Mirrors source overlay lookup: the commercial step file replaces the base
	// declaration when present, so each edition owns one complete ordered list.
	if (edition === EDITIONS.enterprise && fileExists(enterpriseStepFile)) {
		return enterpriseStepFile
	}

	return baseStepFile
}

function loadBuildSteps({
	projectRoot = process.cwd(),
	edition = resolveEdition(projectRoot),
} = {}) {
	const buildStepFile = resolveBuildStepFile({ edition, projectRoot })

	if (!existsSync(buildStepFile)) {
		throw new Error(`Build step file not found: ${buildStepFile}`)
	}

	const resolvedBuildStepFile = require.resolve(buildStepFile)
	delete require.cache[resolvedBuildStepFile]

	const loadedBuildSteps = require(resolvedBuildStepFile)
	const buildSteps = Array.isArray(loadedBuildSteps) ? loadedBuildSteps : loadedBuildSteps?.steps

	if (!Array.isArray(buildSteps)) {
		throw new TypeError(`Build step file must export an array: ${buildStepFile}`)
	}

	return buildSteps
}

function createBuildPlan({
	projectRoot = process.cwd(),
	edition = resolveEdition(projectRoot),
	buildSteps,
	envRef = env,
} = {}) {
	const selectedBuildSteps = buildSteps || loadBuildSteps({ edition, projectRoot })
	const preViteSteps = selectedBuildSteps.map((step) => normalizeBuildStep(step))

	return [...preViteSteps, createViteBuildStep({ edition, envRef })]
}

async function runBuildPlan(
	controller,
	plan,
	{
		writeStep: writeStepRef = writeStep,
		writeStepResult: writeStepResultRef = writeStepResult,
	} = {},
) {
	for (let i = 0; i < plan.length; i++) {
		if (controller.isShutdownRequested()) return

		const step = plan[i]
		const label = `[${i + 1}/${plan.length}] ${step.name}`
		writeStepRef(`${label}...`)
		await controller.runCommand(label, step.command, step.args || [], {
			quiet: step.quiet,
			...(step.options || {}),
		})
		if (controller.isShutdownRequested()) return
		writeStepResultRef(true)
	}
}

async function main(controller = createBuildController(), processExit = process.exit) {
	try {
		controller.registerCleanupHandlers()
		const { env: effectiveEnv } = applyLayeredEnvFiles({
			projectRoot: process.cwd(),
			mode: "production",
		})

		// Resolve once and hand the edition to the Vite bundle so build steps and the
		// bundler agree on which edition (and overlay folders) are active.
		const edition = resolveEdition()
		const plan = createBuildPlan({ edition, envRef: effectiveEnv })

		log(`Starting build process (edition: ${edition})...\n`, "green")

		await runBuildPlan(controller, plan)
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
	createBuildPlan,
	createBuildController,
	getShutdownTimeoutMs,
	isChildRunning,
	loadBuildSteps,
	main,
	mergeNodeOptions,
	resolveBuildStepFile,
	runBuildPlan,
}
