import { describe, expect, it, vi } from "vitest"
import { FS_MESSAGE_TYPES, type FSDirEntry } from "../../types"
import { IframeFSWatchService } from "../IframeFSWatchService"

function createWatchService(overrides?: {
	getFileUpdatedAt?: (resolvedPath: string) => string | undefined
	getDirEntryNames?: (resolvedDir: string) => string[]
	getDirEntries?: (resolvedDir: string, originalDir: string) => FSDirEntry[]
}) {
	const postToIframe = vi.fn()
	const service = new IframeFSWatchService({
		postToIframe,
		getFileUpdatedAt: overrides?.getFileUpdatedAt ?? (() => undefined),
		getDirEntryNames: overrides?.getDirEntryNames ?? (() => []),
		getDirEntries: overrides?.getDirEntries ?? (() => []),
	})
	return { service, postToIframe }
}

describe("IframeFSWatchService", () => {
	it("keeps directory diff snapshots independent from watcher originalDir", () => {
		vi.useFakeTimers()
		const { service, postToIframe } = createWatchService({
			getDirEntryNames: () => ["task.json"],
			getDirEntries: (_resolvedDir, originalDir) => [
				{
					name: `task.json:${originalDir}`,
					path: `${originalDir}task.json`,
					isDirectory: false,
				},
			],
		})

		service.registerDir("watch-dir-1", "data/tasks/", "app/data/tasks/")
		service.registerDir("watch-dir-2", "./data/tasks/", "app/data/tasks/")
		service.unregisterDir("watch-dir-1", "app/data/tasks/")
		vi.advanceTimersByTime(3000)

		expect(postToIframe).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: FS_MESSAGE_TYPES.DIR_CHANGED }),
		)

		service.destroy()
		vi.useRealTimers()
	})

	it("reports oversized directories and does not keep polling them", () => {
		vi.useFakeTimers()
		let names = Array.from({ length: 1001 }, (_, index) => `entry-${index}.json`)
		const getDirEntryNames = vi.fn(() => names)
		const { service, postToIframe } = createWatchService({
			getDirEntryNames,
			getDirEntries: () => [
				{
					name: "entry-1001.json",
					path: "data/tasks/entry-1001.json",
					isDirectory: false,
				},
			],
		})

		service.registerDir("watch-dir-1", "data/tasks/", "app/data/tasks/")
		names = [...names, "entry-1001.json"]
		vi.advanceTimersByTime(3000)

		expect(getDirEntryNames).toHaveBeenCalledTimes(1)
		expect(postToIframe).toHaveBeenCalledWith({
			type: FS_MESSAGE_TYPES.DIR_WATCH_STATUS,
			dir: "data/tasks/",
			success: false,
			reason: "too_many_entries",
			entryCount: 1001,
			maxEntryCount: 1000,
			timestamp: expect.any(Number),
		})
		expect(postToIframe).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: FS_MESSAGE_TYPES.DIR_CHANGED }),
		)

		service.destroy()
		vi.useRealTimers()
	})
})
