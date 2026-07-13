#!/usr/bin/env node

/**
 * Development script
 * Syncs theme RGB tokens, runs icon generation, and starts dev servers
 */

const { spawn } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { log, printBanner, writeStep, writeStepResult } = require("./lib/banner.cjs")
const { resolveEdition } = require("./lib/edition.cjs")
const { PNPM_COMMAND, pnpmArgs, pnpmScript } = require("./lib/pnpm.cjs")

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000

/**
 * Load .env files into process.env so PORT (and friends) truly originate from the
 * environment — no port is hardcoded anywhere. Shell env wins over files, and
 * `.env.local` wins over `.env` (loadEnvFile never overrides an already-set key).
 * These values ride `...process.env` into the Vite child, which reads PORT for
 * its dev-server port.
 */
function loadDotEnvFiles(cwd = process.cwd()) {
	if (typeof process.loadEnvFile !== "function") return
	for (const file of [".env.local", ".env"]) {
		const filePath = path.join(cwd, file)
		if (!fs.existsSync(filePath)) continue
		try {
			process.loadEnvFile(filePath)
		} catch {
			// Ignore malformed/locked env files; fall back to shell env.
		}
	}
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

	// No hardcoded fallback: an unset PORT means Vite decides (its default port).
	return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : undefined
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

function parsePidRecord(rawContent) {
	const trimmed = String(rawContent || "").trim()
	if (!trimmed) return null

	let parsed = null
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		parsed = null
	}

	if (parsed && typeof parsed === "object") {
		const pid = Number(parsed.pid)
		if (!Number.isInteger(pid) || pid <= 0) return null

		return {
			pid,
			activeChildPid: Number.isInteger(parsed.activeChildPid) ? parsed.activeChildPid : null,
			activeChildPgid: Number.isInteger(parsed.activeChildPgid)
				? parsed.activeChildPgid
				: null,
		}
	}

	// Backward compatible with legacy pid files that stored a bare numeric pid.
	const legacyPid = Number.parseInt(trimmed, 10)
	if (!Number.isInteger(legacyPid) || legacyPid <= 0) return null
	return { pid: legacyPid, activeChildPid: null, activeChildPgid: null }
}

function sleepSync(ms) {
	// Block synchronously (no busy loop) so stale-session reaping stays simple
	// during the startup phase, before any child process is spawned.
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
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
	sleep = sleepSync,
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
			// Leave the pid file behind so the next dev launch can reap the recorded
			// process group if this process is killed before the group tears down.
			killActiveChildGroup("SIGTERM", { escalate: false })
			return
		}

		cleanupPidFile()
	}

	const registerCleanupHandlers = () => {
		processRef.on("SIGINT", handleShutdown)
		processRef.on("SIGTERM", handleShutdown)
		processRef.on("SIGHUP", handleShutdown)
		processRef.on("SIGQUIT", handleShutdown)
		processRef.on("exit", handleProcessExit)
	}

	const isPidAlive = (pid) => {
		if (!Number.isInteger(pid) || pid <= 0) return false
		try {
			processRef.kill(pid, 0)
			return true
		} catch (error) {
			// EPERM means the target exists but is owned by another user.
			return error.code === "EPERM"
		}
	}

	const isGroupAlive = (pgid) => {
		if (!Number.isInteger(pgid) || pgid <= 0) return false
		try {
			processRef.kill(-pgid, 0)
			return true
		} catch (error) {
			return error.code === "EPERM"
		}
	}

	const signalTarget = (target, signal) => {
		try {
			processRef.kill(target, signal)
		} catch {
			// Ignore targets that already exited.
		}
	}

	const removePidFile = () => {
		try {
			if (fsRef.existsSync(pidFilePath)) fsRef.unlinkSync(pidFilePath)
		} catch {
			// Ignore pid file removal failures.
		}
	}

	/**
	 * Reap a previous dev session left behind by an abnormal shutdown.
	 *
	 * When this process is force-killed (SIGKILL, IDE hard-stop, parent terminal
	 * killed), the JS signal handlers never run, so the detached `concurrently`
	 * group (vite + husky/widget watchers) is reparented to init and keeps
	 * running — spamming the terminal on file changes. Since dev is effectively a
	 * singleton dev server, the next launch closes the loop by terminating the
	 * recorded process group before starting fresh. Runs before writePidFile.
	 */
	const reapStaleSession = () => {
		if (!fsRef.existsSync(pidFilePath)) return { reaped: false }

		const record = parsePidRecord(fsRef.readFileSync(pidFilePath, "utf8"))

		if (!record || record.pid === processRef.pid) {
			// Garbage/stale-empty file, or somehow our own record: drop it and move on.
			removePidFile()
			return { reaped: false }
		}

		const groupIds = record.activeChildPgid ? [record.activeChildPgid] : []
		const pidTargets = [record.pid, record.activeChildPid].filter(
			(pid) => Number.isInteger(pid) && pid > 0,
		)

		const anyAlive = () =>
			groupIds.some((pgid) => isGroupAlive(pgid)) || pidTargets.some((pid) => isPidAlive(pid))

		if (!anyAlive()) {
			removePidFile()
			return { reaped: false }
		}

		log("Reaping previous dev session left running...", "yellow")

		for (const pgid of groupIds) signalTarget(-pgid, "SIGTERM")
		for (const pid of pidTargets) signalTarget(pid, "SIGTERM")

		let waited = 0
		while (waited < shutdownTimeoutMs && anyAlive()) {
			sleep(200)
			waited += 200
		}

		if (anyAlive()) {
			for (const pgid of groupIds) {
				if (isGroupAlive(pgid)) signalTarget(-pgid, "SIGKILL")
			}
			for (const pid of pidTargets) {
				if (isPidAlive(pid)) signalTarget(pid, "SIGKILL")
			}
		}

		removePidFile()
		return { reaped: true, groups: groupIds, pids: pidTargets }
	}

	const runCommand = (command, args, options = {}) => {
		if (isShuttingDown) {
			return Promise.resolve()
		}

		const { quiet, ...spawnOptions } = options

		return new Promise((resolve, reject) => {
			const child = spawnCommand(command, args, {
				stdio: quiet ? "pipe" : "inherit",
				// detached: true puts the child in its own process group so we can kill
				// the entire group (vite, pnpm watch, esbuild services) on shutdown.
				// Intentionally no shell: true — direct spawn keeps the child as the
				// actual process group leader, avoiding orphaned grandchildren through
				// an intermediate shell process.
				detached: true,
				...spawnOptions,
			})

			activeChild = child
			activeCommand = [command, ...args].join(" ")
			writePidFile()

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
				activeCommand = null

				if (isShuttingDown) {
					cleanupPidFile()
				} else {
					writePidFile()
				}

				// Treat signal-induced exits (code 130 = SIGINT, code 143 = SIGTERM) and
				// null (killed by signal) as clean exits when we initiated the shutdown.
				if (code !== 0 && code !== null && !isShuttingDown) {
					const msg =
						quiet && capturedOutput
							? `Command failed with code ${code}\n${capturedOutput}`
							: `Command failed with code ${code}`
					reject(new Error(msg))
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
				if (quiet && capturedOutput) {
					reject(new Error(`${error.message}\n${capturedOutput}`))
				} else {
					reject(error)
				}
			})
		})
	}

	return {
		cleanupPidFile,
		getPidFilePath: () => pidFilePath,
		handleShutdown,
		isShutdownRequested: () => isShuttingDown,
		reapStaleSession,
		registerCleanupHandlers,
		runCommand,
		writePidFile,
	}
}

async function main(controller = createDevController(), processExit = process.exit) {
	try {
		// Make PORT (and friends) available from .env before anything reads it, so
		// the pid record, banner, and Vite child all agree on a single env source.
		loadDotEnvFiles()

		// Clean up any session left running by a previous abnormal shutdown before
		// claiming the pid file for this run.
		controller.reapStaleSession()
		controller.writePidFile()
		controller.registerCleanupHandlers()

		// Resolve once and hand the edition to the Vite dev server so pre-steps and
		// the bundler agree on which edition (and overlay folders) are active.
		const edition = resolveEdition()

		log(`Starting development environment (edition: ${edition})...\n`, "green")

		writeStep("[1/3] Syncing theme RGB tokens...")
		await controller.runCommand(PNPM_COMMAND, pnpmArgs(["run", "generate:theme-rgb-tokens"]), {
			quiet: true,
		})
		if (controller.isShutdownRequested()) return
		writeStepResult(true)

		writeStep("[2/3] Generating icon tags...")
		await controller.runCommand("node", ["scripts/icons/gen-tabler-icon-tags.cjs"], {
			quiet: true,
		})
		if (controller.isShutdownRequested()) return
		writeStepResult(true)

		writeStep("[3/3] Building husky sandbox...")
		await controller.runCommand(PNPM_COMMAND, pnpmArgs(["run", "build:iframe"]), {
			quiet: true,
		})
		if (controller.isShutdownRequested()) return
		writeStepResult(true)

		const port = getDevPort()
		const devServerUrl = port
			? `https://localhost:${port}`
			: "https://localhost (Vite default port)"
		printBanner(`Dev server starting on ${devServerUrl} 🚀`)
		await controller.runCommand(
			"concurrently",
			[
				"vite",
				pnpmScript("dev:iframe"),
				pnpmScript("dev:widget"),
				"--names",
				"main,husky,widget",
				"--prefix-colors",
				"cyan,yellow,magenta",
				"--kill-others",
				"--kill-signal",
				"SIGTERM",
				"--kill-timeout",
				String(getShutdownTimeoutMs()),
			],
			{ stdio: "inherit", env: { ...process.env, EDITION: edition } },
		)
	} catch (error) {
		if (!controller.isShutdownRequested()) {
			writeStepResult(false)
			log(`\n❌ Error: ${error.message}`, "red")
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
	parsePidRecord,
	serializePidRecord,
}
