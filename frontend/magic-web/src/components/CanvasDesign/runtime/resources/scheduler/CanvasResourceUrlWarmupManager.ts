import type { Canvas } from "../../core/Canvas"
import { type CanvasDocument, ElementTypeEnum, type LayerElement } from "../../document/types"
import { parseExpiresAt, isOssExpired } from "../offline-cache/ossExpiryUtils"
import {
	getCanvasResourcePathInfo,
	isRemoteOrSpecialPath,
} from "../../shared/path/canvasResourcePath"
import {
	getFailureReasonFromGetFileInfoError,
	type ResourceLoadFailureReason,
} from "../media-common/resourceLoadFailure"

type WarmupMediaType = "image" | "video"
type WarmupStatus = "queued" | "warming" | "ready" | "failed"

interface WarmupResourceRef {
	elementId: string
	path: string
	mediaType: WarmupMediaType
}

interface WarmupEntry {
	key: string
	path: string
	mediaType: WarmupMediaType
	status: WarmupStatus
	lastReason: string
	lastError?: string
	warmedAt?: number
	expiresAt?: string
	resourceVersion?: string
	failedAt?: number
	retryAfterAt?: number
}

export interface CanvasResourceUrlWarmupSnapshot {
	destroyed: boolean
	registeredElementCount: number
	trackedPathCount: number
	queuedCount: number
	warmingCount: number
	readyCount: number
	failedCount: number
	enqueueCount: number
	skippedCount: number
	successCount: number
	failedRequestCount: number
	batchRunCount: number
	lastBatchSize: number
	lastBatchDurationMs: number
}

const URL_WARMUP_DISPATCH_DELAY_MS = 80
const URL_WARMUP_BATCH_SIZE = 100
const URL_WARMUP_FAILED_RETRY_DELAY_MS = 30 * 1000

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now()
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function hasChildren(
	element: LayerElement,
): element is LayerElement & { children: LayerElement[] } {
	return "children" in element && Array.isArray((element as { children?: unknown }).children)
}

export class CanvasResourceUrlWarmupManager {
	private readonly canvas: Canvas
	private readonly entries = new Map<string, WarmupEntry>()
	private readonly queuedKeys = new Set<string>()
	private readonly warmingKeys = new Set<string>()
	private readonly elementPathKeys = new Map<string, Set<string>>()
	private readonly pathRefCounts = new Map<string, number>()
	private readonly unsubscribers: Array<() => void> = []
	private timerId: ReturnType<typeof setTimeout> | null = null
	private destroyed = false
	private statsSnapshot: CanvasResourceUrlWarmupSnapshot = {
		destroyed: false,
		registeredElementCount: 0,
		trackedPathCount: 0,
		queuedCount: 0,
		warmingCount: 0,
		readyCount: 0,
		failedCount: 0,
		enqueueCount: 0,
		skippedCount: 0,
		successCount: 0,
		failedRequestCount: 0,
		batchRunCount: 0,
		lastBatchSize: 0,
		lastBatchDurationMs: 0,
	}

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.unsubscribers.push(
			this.canvas.eventEmitter.on("document:loaded", () => {
				this.warmupCurrentDocument("document:loaded")
			}),
			this.canvas.eventEmitter.on("document:restored", () => {
				this.warmupCurrentDocument("document:restored")
			}),
			this.canvas.eventEmitter.on("element:created", ({ data }) => {
				this.warmupElementById(data.elementId, "element:created")
			}),
			this.canvas.eventEmitter.on("element:updated", ({ data }) => {
				this.registerElement(data.data, "element:updated")
			}),
			this.canvas.eventEmitter.on("element:rerendered", ({ data }) => {
				this.registerElement(data.data, "element:rerendered")
			}),
			this.canvas.eventEmitter.on("element:batchupdated", () => {
				this.warmupCurrentDocument("element:batchupdated")
			}),
			this.canvas.eventEmitter.on("element:temporary:converted", ({ data }) => {
				this.warmupElementById(data.elementId, "element:temporary:converted")
			}),
			this.canvas.eventEmitter.on("element:deleted", ({ data }) => {
				this.unregisterElement(data.elementId)
			}),
			this.canvas.eventEmitter.on("element:batchdeleted", ({ data }) => {
				data.elementIds.forEach((elementId) => this.unregisterElement(elementId))
			}),
		)
	}

	public warmupDocument(doc: CanvasDocument, reason: string): void {
		if (this.destroyed) return
		this.registerElements(doc.elements ?? [], reason)
	}

	public warmupCurrentDocument(reason: string): void {
		if (this.destroyed) return
		Object.values(this.canvas.elementManager.getElementsDict()).forEach((element) => {
			this.registerElement(element, reason)
		})
	}

	public getSnapshot(): CanvasResourceUrlWarmupSnapshot {
		this.refreshSnapshotCounts()
		return { ...this.statsSnapshot }
	}

	public destroy(): void {
		this.destroyed = true
		if (this.timerId !== null) {
			clearTimeout(this.timerId)
			this.timerId = null
		}
		this.unsubscribers.forEach((unsubscribe) => unsubscribe())
		this.unsubscribers.length = 0
		this.queuedKeys.clear()
		this.warmingKeys.clear()
		this.elementPathKeys.clear()
		this.pathRefCounts.clear()
		this.entries.clear()
		this.refreshSnapshotCounts()
	}

	private warmupElementById(elementId: string, reason: string): void {
		const element = this.canvas.elementManager.getElementData(elementId)
		if (!element) {
			this.unregisterElement(elementId)
			return
		}
		this.registerElement(element, reason)
	}

	private registerElements(elements: LayerElement[], reason: string): void {
		elements.forEach((element) => {
			this.registerElement(element, reason)
			if (hasChildren(element)) {
				this.registerElements(element.children, reason)
			}
		})
	}

	private registerElement(element: LayerElement, reason: string): void {
		if (this.destroyed) return
		const refs = this.collectResourceRefs(element)
		const nextKeys = new Set<string>()

		refs.forEach((ref) => {
			const entry = this.getOrCreateEntry(ref, reason)
			if (!entry) return
			nextKeys.add(entry.key)
			if (!this.elementPathKeys.get(ref.elementId)?.has(entry.key)) {
				this.incrementPathRefCount(entry.key)
			}
			this.enqueue(entry, reason)
		})

		this.replaceElementPathKeys(element.id, nextKeys)
		this.refreshSnapshotCounts()
	}

	private unregisterElement(elementId: string): void {
		const previousKeys = this.elementPathKeys.get(elementId)
		if (!previousKeys) return
		previousKeys.forEach((key) => this.decrementPathRefCount(key))
		this.elementPathKeys.delete(elementId)
		this.refreshSnapshotCounts()
	}

	private replaceElementPathKeys(elementId: string, nextKeys: Set<string>): void {
		const previousKeys = this.elementPathKeys.get(elementId) ?? new Set<string>()
		previousKeys.forEach((key) => {
			if (!nextKeys.has(key)) {
				this.decrementPathRefCount(key)
			}
		})
		if (nextKeys.size > 0) {
			this.elementPathKeys.set(elementId, nextKeys)
		} else {
			this.elementPathKeys.delete(elementId)
		}
	}

	private incrementPathRefCount(key: string): void {
		this.pathRefCounts.set(key, (this.pathRefCounts.get(key) ?? 0) + 1)
	}

	private decrementPathRefCount(key: string): void {
		const next = (this.pathRefCounts.get(key) ?? 0) - 1
		if (next > 0) {
			this.pathRefCounts.set(key, next)
		} else {
			this.pathRefCounts.delete(key)
		}
	}

	private collectResourceRefs(element: LayerElement): WarmupResourceRef[] {
		const refs: WarmupResourceRef[] = []
		if (element.type === ElementTypeEnum.Image && element.src) {
			refs.push({
				elementId: element.id,
				path: element.src,
				mediaType: "image",
			})
		}
		if (element.type === ElementTypeEnum.Video && element.src) {
			refs.push({
				elementId: element.id,
				path: element.src,
				mediaType: "video",
			})
		}
		return refs
	}

	private getOrCreateEntry(ref: WarmupResourceRef, reason: string): WarmupEntry | null {
		const path = ref.path.trim()
		if (!path || isRemoteOrSpecialPath(path)) {
			this.statsSnapshot.skippedCount += 1
			return null
		}

		const resolveAbsolutePath =
			this.canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
		const pathInfo = getCanvasResourcePathInfo(path, resolveAbsolutePath)
		const key = `${ref.mediaType}\0${pathInfo.canonicalPath}`
		let entry = this.entries.get(key)
		if (!entry) {
			entry = {
				key,
				path,
				mediaType: ref.mediaType,
				status: "queued",
				lastReason: reason,
			}
			this.entries.set(key, entry)
		} else {
			entry.path = entry.path || path
			entry.lastReason = reason
		}
		return entry
	}

	private enqueue(entry: WarmupEntry, reason: string): void {
		if (this.destroyed) return
		if (entry.status === "warming") return
		if (entry.status === "ready" && !this.isReadyEntryExpired(entry)) return
		if (entry.status === "failed" && !this.canRetryFailedEntry(entry)) return
		if (!this.queuedKeys.has(entry.key)) {
			this.queuedKeys.add(entry.key)
			entry.status = "queued"
			entry.lastReason = reason
			entry.lastError = undefined
			entry.failedAt = undefined
			entry.retryAfterAt = undefined
			this.statsSnapshot.enqueueCount += 1
		}
		this.scheduleDispatch()
	}

	private isReadyEntryExpired(entry: WarmupEntry): boolean {
		return isOssExpired(parseExpiresAt(entry.expiresAt))
	}

	private canRetryFailedEntry(entry: WarmupEntry): boolean {
		return entry.retryAfterAt === undefined || Date.now() >= entry.retryAfterAt
	}

	private scheduleDispatch(): void {
		if (this.destroyed || this.timerId !== null) return
		this.timerId = setTimeout(() => {
			this.timerId = null
			void this.dispatchNextBatch()
		}, URL_WARMUP_DISPATCH_DELAY_MS)
	}

	private async dispatchNextBatch(): Promise<void> {
		if (this.destroyed) return
		const batchKeys: string[] = []
		this.queuedKeys.forEach((key) => {
			if (batchKeys.length < URL_WARMUP_BATCH_SIZE) {
				batchKeys.push(key)
			}
		})
		batchKeys.forEach((key) => {
			this.queuedKeys.delete(key)
			this.warmingKeys.add(key)
			const entry = this.entries.get(key)
			if (entry) entry.status = "warming"
		})
		if (batchKeys.length === 0) return

		const startedAt = now()
		this.statsSnapshot.batchRunCount += 1
		this.statsSnapshot.lastBatchSize = batchKeys.length
		this.refreshSnapshotCounts()

		await Promise.allSettled(
			batchKeys.map((key) => {
				const entry = this.entries.get(key)
				if (!entry) return Promise.resolve()
				return this.warmupEntry(entry)
			}),
		)

		this.statsSnapshot.lastBatchDurationMs = now() - startedAt
		this.refreshSnapshotCounts()
		if (this.queuedKeys.size > 0) {
			this.scheduleDispatch()
		}
	}

	private async warmupEntry(entry: WarmupEntry): Promise<void> {
		const getFileInfo = this.canvas.magicConfigManager.config?.methods?.getFileInfo
		if (!getFileInfo) {
			this.markFailed(entry, "getFileInfo unavailable", "load-error")
			return
		}

		try {
			const fileInfo = await getFileInfo(entry.path, {
				useImageProcess: entry.mediaType === "image",
				forceRefresh: false,
			})
			if (this.destroyed) return
			this.warmingKeys.delete(entry.key)
			if (!fileInfo?.src) {
				this.markFailed(entry, "empty fileInfo src", "load-error")
				return
			}
			entry.status = "ready"
			entry.lastError = undefined
			entry.failedAt = undefined
			entry.retryAfterAt = undefined
			entry.warmedAt = Date.now()
			entry.expiresAt = fileInfo.expires_at
			entry.resourceVersion = fileInfo.resource_version
			this.statsSnapshot.successCount += 1
		} catch (error) {
			if (this.destroyed) return
			this.statsSnapshot.failedRequestCount += 1
			this.markFailed(
				entry,
				getErrorMessage(error),
				getFailureReasonFromGetFileInfoError(error),
			)
		}
	}

	private markFailed(
		entry: WarmupEntry,
		errorMessage: string,
		reason: ResourceLoadFailureReason,
	): void {
		this.warmingKeys.delete(entry.key)
		entry.status = "failed"
		entry.lastError = errorMessage
		entry.failedAt = Date.now()
		entry.retryAfterAt = entry.failedAt + URL_WARMUP_FAILED_RETRY_DELAY_MS
		if (entry.mediaType === "image") {
			this.canvas.imageResourceManager?.markResourceLoadFailed(entry.path, reason)
		}
	}

	private refreshSnapshotCounts(): void {
		let readyCount = 0
		let failedCount = 0
		this.entries.forEach((entry) => {
			if (entry.status === "ready") readyCount += 1
			if (entry.status === "failed") failedCount += 1
		})
		this.statsSnapshot = {
			...this.statsSnapshot,
			destroyed: this.destroyed,
			registeredElementCount: this.elementPathKeys.size,
			trackedPathCount: this.pathRefCounts.size,
			queuedCount: this.queuedKeys.size,
			warmingCount: this.warmingKeys.size,
			readyCount,
			failedCount,
		}
	}
}
