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

	it("exits through the injected exit function when a setup command fails before shutdown", async () => {
		const controller = {
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
