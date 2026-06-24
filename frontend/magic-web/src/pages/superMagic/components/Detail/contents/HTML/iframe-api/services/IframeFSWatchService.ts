import { FS_MESSAGE_TYPES, type FSDirEntry } from "../types"

type PostToIframe = (message: object) => void

interface IframeFSWatchServiceConfig {
	postToIframe: PostToIframe
	getFileUpdatedAt: (resolvedPath: string) => string | undefined
	getDirEntries: (resolvedDir: string, originalDir: string) => FSDirEntry[]
}

interface FileWatchEntry {
	watchers: Map<string, string>
}

interface DirWatchEntry {
	watchers: Map<string, string>
}

const POLL_INTERVAL_MS = 3000
const MAX_FILE_WATCHES = 10
const MAX_DIR_WATCHES = 10

export class IframeFSWatchService {
	private readonly cfg: IframeFSWatchServiceConfig
	private fileRegistry = new Map<string, FileWatchEntry>()
	private fileSnapshot = new Map<string, string | undefined>()
	private dirRegistry = new Map<string, DirWatchEntry>()
	private dirSnapshot = new Map<string, string[]>()
	private pollTimerId: ReturnType<typeof setInterval> | null = null

	constructor(cfg: IframeFSWatchServiceConfig) {
		this.cfg = cfg
	}

	registerFile(requestId: string, originalPath: string, resolvedPath: string) {
		if (this.fileRegistry.size >= MAX_FILE_WATCHES && !this.fileRegistry.has(resolvedPath)) {
			return
		}

		if (!this.fileRegistry.has(resolvedPath)) {
			this.fileRegistry.set(resolvedPath, { watchers: new Map() })
			this.fileSnapshot.set(resolvedPath, this.cfg.getFileUpdatedAt(resolvedPath))
		}

		this.fileRegistry.get(resolvedPath)?.watchers.set(requestId, originalPath)
		this.startPollingIfNeeded()
	}

	unregisterFile(requestId: string, resolvedPath: string) {
		const entry = this.fileRegistry.get(resolvedPath)
		if (!entry) return

		entry.watchers.delete(requestId)
		if (entry.watchers.size === 0) {
			this.fileRegistry.delete(resolvedPath)
			this.fileSnapshot.delete(resolvedPath)
		}

		this.stopPollingIfIdle()
	}

	registerDir(requestId: string, originalDir: string, resolvedDir: string) {
		if (this.dirRegistry.size >= MAX_DIR_WATCHES && !this.dirRegistry.has(resolvedDir)) {
			return
		}

		if (!this.dirRegistry.has(resolvedDir)) {
			this.dirRegistry.set(resolvedDir, { watchers: new Map() })
			this.dirSnapshot.set(resolvedDir, this.snapshotDir(resolvedDir, originalDir))
		}

		this.dirRegistry.get(resolvedDir)?.watchers.set(requestId, originalDir)
		this.startPollingIfNeeded()
	}

	unregisterDir(requestId: string, resolvedDir: string) {
		const entry = this.dirRegistry.get(resolvedDir)
		if (!entry) return

		entry.watchers.delete(requestId)
		if (entry.watchers.size === 0) {
			this.dirRegistry.delete(resolvedDir)
			this.dirSnapshot.delete(resolvedDir)
		}

		this.stopPollingIfIdle()
	}

	destroy() {
		if (this.pollTimerId !== null) {
			clearInterval(this.pollTimerId)
			this.pollTimerId = null
		}
		this.fileRegistry.clear()
		this.fileSnapshot.clear()
		this.dirRegistry.clear()
		this.dirSnapshot.clear()
	}

	private startPollingIfNeeded() {
		if (this.pollTimerId !== null) return
		this.pollTimerId = setInterval(() => this.poll(), POLL_INTERVAL_MS)
	}

	private stopPollingIfIdle() {
		if (this.fileRegistry.size > 0 || this.dirRegistry.size > 0) return
		if (this.pollTimerId !== null) {
			clearInterval(this.pollTimerId)
			this.pollTimerId = null
		}
	}

	private poll() {
		this.pollFiles()
		this.pollDirs()
	}

	private pollFiles() {
		this.fileRegistry.forEach(({ watchers }, resolvedPath) => {
			const prev = this.fileSnapshot.get(resolvedPath)
			const curr = this.cfg.getFileUpdatedAt(resolvedPath)
			if (!curr || curr === prev) return

			this.fileSnapshot.set(resolvedPath, curr)
			const paths = new Set(watchers.values())
			paths.forEach((path) => {
				this.cfg.postToIframe({
					type: FS_MESSAGE_TYPES.FILE_CHANGED,
					path,
					timestamp: Date.now(),
				})
			})
		})
	}

	private pollDirs() {
		this.dirRegistry.forEach(({ watchers }, resolvedDir) => {
			const firstOriginalDir = watchers.values().next().value
			if (!firstOriginalDir) return

			const previous = this.dirSnapshot.get(resolvedDir) ?? []
			const current = this.snapshotDir(resolvedDir, firstOriginalDir)
			const added = current.filter((name) => !previous.includes(name))
			const removed = previous.filter((name) => !current.includes(name))
			if (added.length === 0 && removed.length === 0) return

			this.dirSnapshot.set(resolvedDir, current)
			const timestamp = Date.now()
			const dirs = new Set(watchers.values())
			dirs.forEach((dir) => {
				this.cfg.postToIframe({
					type: FS_MESSAGE_TYPES.DIR_CHANGED,
					dir,
					timestamp,
					added,
					removed,
					entries: this.cfg.getDirEntries(resolvedDir, dir),
				})
			})
		})
	}

	private snapshotDir(resolvedDir: string, originalDir: string): string[] {
		return this.cfg.getDirEntries(resolvedDir, originalDir).map((entry) => entry.name)
	}
}
