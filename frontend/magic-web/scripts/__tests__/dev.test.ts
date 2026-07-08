import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { beforeEach, describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)

type FakeFileStore = Map<string, string>

function createFsRef(files: FakeFileStore) {
	return {
		existsSync: (filePath: string) => files.has(filePath),
		readFileSync: (filePath: string) => files.get(filePath) ?? "",
		writeFileSync: (filePath: string, content: string) => {
			files.set(filePath, content)
		},
		unlinkSync: (filePath: string) => {
			files.delete(filePath)
		},
	}
}

function createProcessRef() {
	const processRef = new EventEmitter() as EventEmitter & {
		pid: number
		kill: ReturnType<typeof vi.fn>
		exit: ReturnType<typeof vi.fn>
	}

	processRef.pid = 1001
	processRef.kill = vi.fn()
	processRef.exit = vi.fn()

	return processRef
}

function createChild(pid = 2002) {
	const child = new EventEmitter() as EventEmitter & {
		pid: number
		killed: boolean
		kill: ReturnType<typeof vi.fn>
		exitCode: number | null
		signalCode: NodeJS.Signals | null
	}

	child.pid = pid
	child.killed = false
	child.exitCode = null
	child.signalCode = null
	child.kill = vi.fn()

	return child
}

describe("dev script shutdown controller", () => {
	let devScript: typeof import("../dev.cjs")

	beforeEach(() => {
		vi.resetModules()
		devScript = require("../dev.cjs")
	})

	it("keeps the pid file until the active child closes during shutdown", async () => {
		const files = new Map<string, string>()
		const processRef = createProcessRef()
		const child = createChild()
		const spawnCommand = vi.fn(() => child)
		const controller = devScript.createDevController({
			cwd: "/repo/magic-web",
			fsRef: createFsRef(files),
			processRef,
			spawnCommand,
			tmpDir: "/tmp",
			shutdownTimeoutMs: 1000,
		})

		controller.writePidFile()
		const runPromise = controller.runCommand("vite", [])
		const pidFilePath = controller.getPidFilePath()

		controller.handleShutdown("SIGINT")

		expect(processRef.kill).toHaveBeenCalledWith(-child.pid, "SIGTERM")
		expect(files.has(pidFilePath)).toBe(true)
		expect(JSON.parse(files.get(pidFilePath) ?? "{}")).toMatchObject({
			pid: processRef.pid,
			activeChildPid: child.pid,
			activeChildPgid: child.pid,
		})

		child.emit("close", null, "SIGTERM")
		await runPromise

		expect(files.has(pidFilePath)).toBe(false)
	})

	it("escalates an active child process group to SIGKILL after the shutdown timeout", () => {
		const files = new Map<string, string>()
		const processRef = createProcessRef()
		const child = createChild()
		const timers: Array<() => void> = []
		const controller = devScript.createDevController({
			cwd: "/repo/magic-web",
			fsRef: createFsRef(files),
			processRef,
			spawnCommand: vi.fn(() => child),
			tmpDir: "/tmp",
			shutdownTimeoutMs: 1000,
			setTimer: (callback: () => void) => {
				timers.push(callback)
				return { unref: vi.fn() }
			},
			clearTimer: vi.fn(),
		})

		void controller.runCommand("vite", [])
		controller.handleShutdown("SIGTERM")
		timers[0]()

		expect(processRef.kill).toHaveBeenCalledWith(-child.pid, "SIGTERM")
		expect(processRef.kill).toHaveBeenCalledWith(-child.pid, "SIGKILL")
	})

	it("handles SIGHUP and skips commands requested after shutdown starts", async () => {
		const files = new Map<string, string>()
		const processRef = createProcessRef()
		const spawnCommand = vi.fn()
		const controller = devScript.createDevController({
			cwd: "/repo/magic-web",
			fsRef: createFsRef(files),
			processRef,
			spawnCommand,
			tmpDir: "/tmp",
		})

		controller.registerCleanupHandlers()
		processRef.emit("SIGHUP", "SIGHUP")
		await controller.runCommand("vite", [])

		expect(controller.isShutdownRequested()).toBe(true)
		expect(spawnCommand).not.toHaveBeenCalled()
	})

	it("reaps a stale session's process group recorded in the pid file on startup", () => {
		const files = new Map<string, string>()
		const processRef = createProcessRef()
		// Simulate an orphaned session: recorded group + pids are still alive.
		const alive = new Set([9001, -9002, 9002])
		processRef.kill = vi.fn((target: number, signal: NodeJS.Signals | 0) => {
			if (signal === 0) {
				if (!alive.has(target)) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" })
				return true
			}
			// A real signal terminates the group and its members.
			alive.delete(target)
			if (target === -9002) {
				alive.delete(9002)
			}
			return true
		}) as typeof processRef.kill

		const controller = devScript.createDevController({
			cwd: "/repo/magic-web",
			fsRef: createFsRef(files),
			processRef,
			spawnCommand: vi.fn(),
			tmpDir: "/tmp",
			sleep: vi.fn(),
		})

		const pidFilePath = controller.getPidFilePath()
		files.set(
			pidFilePath,
			JSON.stringify({ pid: 9001, activeChildPid: 9002, activeChildPgid: 9002 }),
		)

		const result = controller.reapStaleSession()

		expect(result.reaped).toBe(true)
		expect(processRef.kill).toHaveBeenCalledWith(-9002, "SIGTERM")
		expect(processRef.kill).toHaveBeenCalledWith(9001, "SIGTERM")
		expect(files.has(pidFilePath)).toBe(false)
	})

	it("escalates a stubborn stale group to SIGKILL when SIGTERM is ignored", () => {
		const files = new Map<string, string>()
		const processRef = createProcessRef()
		const alive = new Set([-9002])
		processRef.kill = vi.fn((target: number, signal: NodeJS.Signals | 0) => {
			if (signal === 0) {
				if (!alive.has(target)) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" })
				return true
			}
			// Only SIGKILL actually terminates the group here.
			if (signal === "SIGKILL") alive.delete(target)
			return true
		}) as typeof processRef.kill

		const controller = devScript.createDevController({
			cwd: "/repo/magic-web",
			fsRef: createFsRef(files),
			processRef,
			spawnCommand: vi.fn(),
			tmpDir: "/tmp",
			sleep: vi.fn(),
			shutdownTimeoutMs: 400,
		})

		const pidFilePath = controller.getPidFilePath()
		files.set(pidFilePath, JSON.stringify({ pid: 9001, activeChildPgid: 9002 }))

		controller.reapStaleSession()

		expect(processRef.kill).toHaveBeenCalledWith(-9002, "SIGTERM")
		expect(processRef.kill).toHaveBeenCalledWith(-9002, "SIGKILL")
		expect(files.has(pidFilePath)).toBe(false)
	})

	it("removes the pid file without signalling when the recorded session is already gone", () => {
		const files = new Map<string, string>()
		const processRef = createProcessRef()
		// No process is alive: every kill probe throws ESRCH.
		processRef.kill = vi.fn(() => {
			throw Object.assign(new Error("ESRCH"), { code: "ESRCH" })
		}) as typeof processRef.kill

		const controller = devScript.createDevController({
			cwd: "/repo/magic-web",
			fsRef: createFsRef(files),
			processRef,
			spawnCommand: vi.fn(),
			tmpDir: "/tmp",
			sleep: vi.fn(),
		})

		const pidFilePath = controller.getPidFilePath()
		files.set(pidFilePath, JSON.stringify({ pid: 9001, activeChildPgid: 9002 }))

		const result = controller.reapStaleSession()

		expect(result.reaped).toBe(false)
		expect(files.has(pidFilePath)).toBe(false)
		// Only liveness probes (signal 0) should have run, no termination signals.
		for (const call of processRef.kill.mock.calls) {
			expect(call[1]).toBe(0)
		}
	})

	it("exits through the injected exit function when a setup command fails before shutdown", async () => {
		const controller = {
			reapStaleSession: vi.fn(),
			writePidFile: vi.fn(),
			registerCleanupHandlers: vi.fn(),
			runCommand: vi.fn().mockRejectedValue(new Error("setup failed")),
			isShutdownRequested: vi.fn(() => false),
			cleanupPidFile: vi.fn(),
		}
		const processExit = vi.fn(() => {
			throw new Error("exit 1")
		})

		await expect(devScript.main(controller, processExit)).rejects.toThrow("exit 1")

		expect(processExit).toHaveBeenCalledWith(1)
		expect(controller.cleanupPidFile).toHaveBeenCalled()
	})
})
