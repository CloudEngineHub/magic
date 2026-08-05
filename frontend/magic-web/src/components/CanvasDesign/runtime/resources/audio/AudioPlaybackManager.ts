import type { Canvas } from "../../core/Canvas"
import { areCanvasHostResourceReferencesSame } from "../../shared/path/canvasResourcePath"
import type { CanvasResourceTaskPriority } from "../scheduler/CanvasResourceScheduler"

export interface AudioPlaybackSnapshot {
	duration: number
	currentTime: number
	paused: boolean
	ended: boolean
	loading: boolean
	error: boolean
}

export type AudioPlaybackSnapshotHandler = (snapshot: AudioPlaybackSnapshot) => void
export type AudioPlaybackAcquireSource = "viewport" | "interaction"

export interface AudioPlaybackPrepareOptions {
	source?: AudioPlaybackAcquireSource
	priority?: CanvasResourceTaskPriority
	signal?: AbortSignal
}

interface AudioPlaybackSession {
	elementId: string
	path: string
	audio: HTMLAudioElement
	cleanup: () => void
	refreshing: boolean
	refreshAbortController?: AbortController
	wantsPlayback: boolean
	source: AudioPlaybackAcquireSource
}

interface PendingAudioPlaybackSession {
	path: string
	token: symbol
	source: AudioPlaybackAcquireSource
	priority: CanvasResourceTaskPriority
	abortController: AbortController
	promise: Promise<AudioPlaybackSession | "cancelled" | null>
	cleanupExternalSignal: () => void
}

const EMPTY_SNAPSHOT: AudioPlaybackSnapshot = {
	duration: 0,
	currentTime: 0,
	paused: true,
	ended: false,
	loading: false,
	error: false,
}

const AUDIO_PRELOAD_TIMEOUT_MS = 15_000

/** 管理 AudioElement 的 HTMLAudioElement 会话、调度和运行时播放状态。 */
export class AudioPlaybackManager {
	private readonly canvas: Canvas
	private readonly sessions = new Map<string, AudioPlaybackSession>()
	private readonly pendingSessions = new Map<string, PendingAudioPlaybackSession>()
	private readonly handlersByElementId = new Map<string, Set<AudioPlaybackSnapshotHandler>>()
	private destroyed = false

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public subscribe(elementId: string, handler: AudioPlaybackSnapshotHandler): () => void {
		const handlers = this.handlersByElementId.get(elementId) ?? new Set()
		handlers.add(handler)
		this.handlersByElementId.set(elementId, handlers)
		handler(this.getSnapshot(elementId))
		return () => {
			const currentHandlers = this.handlersByElementId.get(elementId)
			currentHandlers?.delete(handler)
			if (currentHandlers?.size === 0) this.handlersByElementId.delete(elementId)
		}
	}

	public getSnapshot(elementId: string): AudioPlaybackSnapshot {
		const session = this.sessions.get(elementId)
		return session ? this.createSnapshot(session.audio) : EMPTY_SNAPSHOT
	}

	public async prepare(
		elementId: string,
		path: string,
		options?: AudioPlaybackPrepareOptions,
	): Promise<boolean> {
		const session = await this.ensureSession(elementId, path, options)
		return Boolean(session && session !== "cancelled")
	}

	public async toggle(elementId: string, path: string): Promise<boolean> {
		const session = await this.ensureSession(elementId, path, {
			source: "interaction",
			priority: "critical",
		})
		if (!session || session === "cancelled") return false
		session.source = "interaction"

		if (!session.audio.paused && !session.audio.ended) {
			session.wantsPlayback = false
			session.audio.pause()
			return true
		}

		session.wantsPlayback = true
		this.canvas.mediaPlaybackCoordinator.preparePlayback(elementId)
		try {
			await session.audio.play()
			return true
		} catch {
			this.emit(session)
			return false
		}
	}

	public pause(elementId: string): void {
		const session = this.sessions.get(elementId)
		if (!session) return
		session.wantsPlayback = false
		session.audio.pause()
	}

	public pauseAll(exceptElementId?: string): void {
		this.sessions.forEach((session, elementId) => {
			if (elementId === exceptElementId) return
			session.wantsPlayback = false
			session.audio.pause()
		})
	}

	public seek(elementId: string, progress: number): void {
		const session = this.sessions.get(elementId)
		if (!session) return
		const duration = Number.isFinite(session.audio.duration) ? session.audio.duration : 0
		if (duration <= 0) return
		session.audio.currentTime = Math.max(0, Math.min(1, progress)) * duration
		this.emit(session)
	}

	/** 只回收视口产生的会话；显式点击中的任务与正在播放的会话必须继续。 */
	public releaseViewportPreload(elementId: string): void {
		const pending = this.pendingSessions.get(elementId)
		if (pending?.source === "viewport") {
			this.cancelPendingSession(elementId)
		}
		const session = this.sessions.get(elementId)
		if (!session || session.source !== "viewport") return
		if (!session.audio.paused && !session.audio.ended) return
		this.release(elementId)
	}

	public release(elementId: string): void {
		this.cancelPendingSession(elementId)
		const session = this.sessions.get(elementId)
		if (!session) {
			this.emitSnapshot(elementId, EMPTY_SNAPSHOT)
			return
		}
		this.disposeSession(session)
		this.sessions.delete(elementId)
		this.emitSnapshot(elementId, EMPTY_SNAPSHOT)
	}

	public releaseAll(exceptElementId?: string): void {
		const elementIds = new Set([...this.sessions.keys(), ...this.pendingSessions.keys()])
		elementIds.forEach((elementId) => {
			if (elementId === exceptElementId) return
			this.release(elementId)
		})
	}

	public releaseByPath(path: string): void {
		Array.from(this.pendingSessions.entries()).forEach(([elementId, pendingSession]) => {
			if (areCanvasHostResourceReferencesSame(this.canvas, pendingSession.path, path)) {
				this.release(elementId)
			}
		})
		Array.from(this.sessions.entries()).forEach(([elementId, session]) => {
			if (areCanvasHostResourceReferencesSame(this.canvas, session.path, path)) {
				this.release(elementId)
			}
		})
	}

	public destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		Array.from(new Set([...this.sessions.keys(), ...this.pendingSessions.keys()])).forEach(
			(elementId) => this.release(elementId),
		)
		this.handlersByElementId.clear()
	}

	private async ensureSession(
		elementId: string,
		path: string,
		options?: AudioPlaybackPrepareOptions,
	): Promise<AudioPlaybackSession | "cancelled" | null> {
		if (this.destroyed || !path || options?.signal?.aborted) return null
		const source = options?.source ?? "interaction"
		const priority = options?.priority ?? (source === "interaction" ? "critical" : "visible")
		const existing = this.sessions.get(elementId)
		if (existing?.path === path) {
			if (source === "interaction") existing.source = "interaction"
			return existing
		}
		if (existing) this.release(elementId)

		const pending = this.pendingSessions.get(elementId)
		if (pending?.path === path) {
			if (source === "interaction" && pending.source === "viewport") {
				// Scheduler 不支持原地提升优先级，显式交互需要取消视口任务后重新以 critical 入队。
				this.cancelPendingSession(elementId)
			} else {
				return pending.promise
			}
		} else if (pending) {
			this.cancelPendingSession(elementId)
		}

		const token = Symbol(`audio-playback:${elementId}`)
		const abortController = new AbortController()
		const cleanupExternalSignal = this.linkAbortSignal(options?.signal, abortController)
		const promise = this.acquireSession(
			elementId,
			path,
			token,
			source,
			priority,
			abortController,
		)
			.catch((error) => {
				if (isAbortError(error)) return "cancelled" as const
				this.emitLoadFailed(path)
				return null
			})
			.finally(() => {
				const current = this.pendingSessions.get(elementId)
				if (current?.token !== token) return
				current.cleanupExternalSignal()
				this.pendingSessions.delete(elementId)
			})
		this.pendingSessions.set(elementId, {
			path,
			token,
			source,
			priority,
			abortController,
			promise,
			cleanupExternalSignal,
		})
		return promise
	}

	private async acquireSession(
		elementId: string,
		path: string,
		token: symbol,
		source: AudioPlaybackAcquireSource,
		priority: CanvasResourceTaskPriority,
		abortController: AbortController,
	): Promise<AudioPlaybackSession | "cancelled" | null> {
		const resource = await this.canvas.audioResourceManager.getResource(path, {
			allowCachedFallback: true,
			priority,
			signal: abortController.signal,
		})
		if (!resource || !this.isPendingSessionCurrent(elementId, path, token)) return null
		if (this.destroyed || abortController.signal.aborted) return "cancelled"

		const kind = source === "interaction" ? "audio:playback-acquire" : "audio:preload"
		const session = await this.canvas.resourceScheduler.run(
			kind,
			(signal) => this.createReadySession(elementId, path, resource.ossSrc, source, signal),
			{
				source: `audio-resource:${source}`,
				canvasId: this.canvas.id,
				ownerId: elementId,
				path,
				url: resource.ossSrc,
				priority,
				signal: abortController.signal,
			},
		)
		if (!session) {
			if (
				this.destroyed ||
				abortController.signal.aborted ||
				!this.isPendingSessionCurrent(elementId, path, token)
			) {
				return "cancelled"
			}
			// metadata/canplay 错误或超时不会让 Scheduler reject，需要在这里显式
			// 失效 visibility 去重状态，确保瞬时失败可在后续视口刷新中重试。
			this.emitLoadFailed(path)
			return null
		}
		if (
			this.destroyed ||
			abortController.signal.aborted ||
			!this.isPendingSessionCurrent(elementId, path, token)
		) {
			this.disposeSession(session)
			return "cancelled"
		}

		this.sessions.set(elementId, session)
		this.canvas.mediaResourceOfflineCacheManager.recordVirtualResourceLoadSuccess(
			resource.ossSrc,
		)
		this.emit(session)
		return session
	}

	private async createReadySession(
		elementId: string,
		path: string,
		ossSrc: string,
		source: AudioPlaybackAcquireSource,
		signal: AbortSignal,
	): Promise<AudioPlaybackSession | null> {
		if (signal.aborted || this.destroyed) return null
		const audio = document.createElement("audio")
		audio.preload = "metadata"
		audio.src = ossSrc
		const ready = await this.waitUntilReady(audio, signal)
		if (!ready || signal.aborted || this.destroyed) {
			this.disposeAudioElement(audio)
			return null
		}

		const session: AudioPlaybackSession = {
			elementId,
			path,
			audio,
			cleanup: () => undefined,
			refreshing: false,
			wantsPlayback: false,
			source,
		}
		session.cleanup = this.bindSessionEvents(session)
		return session
	}

	private waitUntilReady(audio: HTMLAudioElement, signal: AbortSignal): Promise<boolean> {
		if (signal.aborted) return Promise.resolve(false)
		if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve(true)

		return new Promise<boolean>((resolve) => {
			let settled = false
			const finish = (ready: boolean) => {
				if (settled) return
				settled = true
				window.clearTimeout(timeoutId)
				audio.removeEventListener("loadedmetadata", handleReady)
				audio.removeEventListener("canplay", handleReady)
				audio.removeEventListener("error", handleError)
				signal.removeEventListener("abort", handleAbort)
				resolve(ready)
			}
			const handleReady = () => finish(true)
			const handleError = () => finish(false)
			const handleAbort = () => finish(false)
			const timeoutId = window.setTimeout(() => finish(false), AUDIO_PRELOAD_TIMEOUT_MS)
			audio.addEventListener("loadedmetadata", handleReady, { once: true })
			audio.addEventListener("canplay", handleReady, { once: true })
			audio.addEventListener("error", handleError, { once: true })
			signal.addEventListener("abort", handleAbort, { once: true })
			// AbortSignal 可能在监听器注册前后由 release/far drain 同步触发；
			// 二次检查避免遗留一个只能等 15 秒超时的 audio 节点。
			if (signal.aborted) {
				handleAbort()
				return
			}
			try {
				audio.load()
			} catch {
				handleError()
			}
		})
	}

	private bindSessionEvents(session: AudioPlaybackSession): () => void {
		const emit = () => this.emit(session)
		const onError = () => {
			this.emit(session)
			void this.refreshFailedSession(session)
		}
		const eventNames = [
			"loadedmetadata",
			"durationchange",
			"timeupdate",
			"play",
			"pause",
			"ended",
			"waiting",
			"canplay",
		] as const
		eventNames.forEach((eventName) => session.audio.addEventListener(eventName, emit))
		session.audio.addEventListener("error", onError)
		return () => {
			eventNames.forEach((eventName) => session.audio.removeEventListener(eventName, emit))
			session.audio.removeEventListener("error", onError)
		}
	}

	private async refreshFailedSession(session: AudioPlaybackSession): Promise<void> {
		if (
			this.destroyed ||
			session.refreshing ||
			this.sessions.get(session.elementId) !== session
		) {
			return
		}
		session.refreshing = true
		const refreshAbortController = new AbortController()
		session.refreshAbortController = refreshAbortController
		try {
			const fallback = await this.canvas.audioResourceManager.resolveVirtualPlaybackFallback(
				session.path,
				session.audio.src,
			)
			if (refreshAbortController.signal.aborted || this.destroyed) return
			const resource =
				fallback ??
				(await this.canvas.audioResourceManager.getResource(session.path, {
					forceRefresh: true,
					allowCachedFallback: false,
					priority: "critical",
					signal: refreshAbortController.signal,
				}))
			if (
				!resource ||
				refreshAbortController.signal.aborted ||
				this.sessions.get(session.elementId) !== session
			) {
				return
			}

			const ready = await this.canvas.resourceScheduler.run(
				session.wantsPlayback ? "audio:playback-acquire" : "audio:preload",
				(signal) => {
					if (signal.aborted) return Promise.resolve(false)
					session.audio.src = resource.ossSrc
					return this.waitUntilReady(session.audio, signal)
				},
				{
					source: "audio-resource:refresh",
					canvasId: this.canvas.id,
					ownerId: session.elementId,
					path: session.path,
					url: resource.ossSrc,
					priority: "critical",
					signal: refreshAbortController.signal,
				},
			)
			if (
				!ready ||
				refreshAbortController.signal.aborted ||
				this.sessions.get(session.elementId) !== session
			) {
				if (refreshAbortController.signal.aborted) return
				this.emitLoadFailed(session.path)
				return
			}
			this.canvas.mediaResourceOfflineCacheManager.recordVirtualResourceLoadSuccess(
				resource.ossSrc,
			)
			if (session.wantsPlayback) {
				this.canvas.mediaPlaybackCoordinator.preparePlayback(session.elementId)
				await session.audio.play().catch(() => undefined)
			}
		} catch (error) {
			if (!refreshAbortController.signal.aborted && !isAbortError(error)) {
				this.emitLoadFailed(session.path)
			}
		} finally {
			if (session.refreshAbortController === refreshAbortController) {
				session.refreshAbortController = undefined
			}
			session.refreshing = false
			if (this.sessions.get(session.elementId) === session) this.emit(session)
		}
	}

	private cancelPendingSession(elementId: string): void {
		const pending = this.pendingSessions.get(elementId)
		if (!pending) return
		pending.cleanupExternalSignal()
		pending.abortController.abort()
		this.pendingSessions.delete(elementId)
	}

	private isPendingSessionCurrent(elementId: string, path: string, token: symbol): boolean {
		const pending = this.pendingSessions.get(elementId)
		return pending?.token === token && pending.path === path
	}

	private linkAbortSignal(
		externalSignal: AbortSignal | undefined,
		abortController: AbortController,
	): () => void {
		if (!externalSignal) return () => undefined
		const abort = () => abortController.abort()
		if (externalSignal.aborted) {
			abort()
			return () => undefined
		}
		externalSignal.addEventListener("abort", abort, { once: true })
		return () => externalSignal.removeEventListener("abort", abort)
	}

	private disposeSession(session: AudioPlaybackSession): void {
		session.wantsPlayback = false
		session.refreshAbortController?.abort()
		session.refreshAbortController = undefined
		session.audio.pause()
		session.cleanup()
		this.disposeAudioElement(session.audio)
	}

	private disposeAudioElement(audio: HTMLAudioElement): void {
		audio.removeAttribute("src")
		audio.load()
	}

	private emitLoadFailed(path: string): void {
		this.canvas.eventEmitter.emit({
			type: "resource:audio:load-failed",
			data: {
				path,
				reason: this.canvas.audioResourceManager.getFailureReason(path) ?? "load-error",
			},
		})
	}

	private emit(session: AudioPlaybackSession): void {
		this.emitSnapshot(session.elementId, this.createSnapshot(session.audio))
	}

	private emitSnapshot(elementId: string, snapshot: AudioPlaybackSnapshot): void {
		this.handlersByElementId.get(elementId)?.forEach((handler) => handler(snapshot))
	}

	private createSnapshot(audio: HTMLAudioElement): AudioPlaybackSnapshot {
		return {
			duration: Number.isFinite(audio.duration) ? audio.duration : 0,
			currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
			paused: audio.paused,
			ended: audio.ended,
			loading: audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA,
			error: Boolean(audio.error),
		}
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error
		? error.name === "AbortError"
		: typeof error === "object" &&
				error !== null &&
				"name" in error &&
				(error as { name?: unknown }).name === "AbortError"
}
