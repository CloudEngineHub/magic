import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import { resolveSafePreviewUrl } from "@/pages/superMagic/components/Detail/components/FilesViewer/components/previewUrl"
import { parseExpiresAt } from "@/components/CanvasDesign/runtime/resources/offline-cache/ossExpiryUtils"
import type { ImageProcessOptions } from "@/utils/image-processing"

export interface ProjectFileImagePreviewCacheItem {
	url: string
	expiresAt?: string
}

interface ProjectFileImagePreviewRequestSource {
	fileId: string
	cacheKey: string
}

interface PendingPreviewRequest {
	source: ProjectFileImagePreviewRequestSource
	resolve: (item: ProjectFileImagePreviewCacheItem | undefined) => void
	consumerCount: number
	started: boolean
}

interface InFlightPreviewRequest {
	promise: Promise<ProjectFileImagePreviewCacheItem | undefined>
	request: PendingPreviewRequest
}

interface PersistedPreviewCacheItem extends ProjectFileImagePreviewCacheItem {
	cacheKey: string
}

const PROJECT_FILE_IMAGE_PREVIEW_PROCESS: ImageProcessOptions = {
	resize: { w: 320, h: 320, m: "lfit" },
	quality: 45,
	format: "webp",
	autoOrient: 1,
}

export const PROJECT_FILE_IMAGE_PREVIEW_RENDITION_KEY = "320x320-lfit-q45-webp-auto1"

const PREVIEW_MEMORY_CACHE_LIMIT = 5000
const PREVIEW_SESSION_CACHE_LIMIT = 2000
const PREVIEW_SESSION_MISS_CACHE_LIMIT = 5000
const PREVIEW_EXPIRY_SAFETY_WINDOW_MS = 30_000
const PREVIEW_REQUEST_BATCH_DELAY_MS = 80
const PREVIEW_REQUEST_BATCH_SIZE = 50
const PREVIEW_REQUEST_MAX_CONCURRENCY = 2
const PREVIEW_SESSION_CACHE_PREFIX = "magic:project-file-image-preview:v3:"
const PREVIEW_SESSION_CACHE_CURSOR_KEY = `${PREVIEW_SESSION_CACHE_PREFIX}cursor`
const PREVIEW_SESSION_CACHE_SLOT_PREFIX = `${PREVIEW_SESSION_CACHE_PREFIX}slot:`

const previewMemoryCache = new Map<string, ProjectFileImagePreviewCacheItem>()
const previewSessionCacheMisses = new Set<string>()
const previewRequestQueue = new Map<string, PendingPreviewRequest>()
const previewInFlightRequests = new Map<string, InFlightPreviewRequest>()

let previewRequestFlushTimer: ReturnType<typeof setTimeout> | null = null
let activePreviewRequestBatchCount = 0

function isPreviewCacheItemValid(
	item?: ProjectFileImagePreviewCacheItem,
): item is ProjectFileImagePreviewCacheItem {
	if (!item?.url) return false

	const expiresAtTs = parseExpiresAt(item.expiresAt)
	return expiresAtTs === null || Date.now() + PREVIEW_EXPIRY_SAFETY_WINDOW_MS < expiresAtTs
}

function hashPreviewCacheKey(cacheKey: string): string {
	let hash = 0x811c9dc5
	for (let index = 0; index < cacheKey.length; index += 1) {
		hash ^= cacheKey.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}

function getPreviewSessionStorageKey(cacheKey: string): string {
	return `${PREVIEW_SESSION_CACHE_PREFIX}${hashPreviewCacheKey(cacheKey)}-${cacheKey.length}`
}

function getSessionStorage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage
	} catch {
		return null
	}
}

function readPersistedPreviewCacheItem(
	cacheKey: string,
): ProjectFileImagePreviewCacheItem | undefined {
	const storage = getSessionStorage()
	if (!storage) return undefined

	const storageKey = getPreviewSessionStorageKey(cacheKey)
	try {
		const rawValue = storage.getItem(storageKey)
		if (!rawValue) return undefined

		const parsed = JSON.parse(rawValue) as PersistedPreviewCacheItem
		if (parsed.cacheKey !== cacheKey || !isPreviewCacheItemValid(parsed)) {
			storage.removeItem(storageKey)
			return undefined
		}

		return { url: parsed.url, expiresAt: parsed.expiresAt }
	} catch {
		return undefined
	}
}
function persistPreviewCacheItem(cacheKey: string, item: ProjectFileImagePreviewCacheItem) {
	// Without a known expiry, keep the URL in memory only to avoid restoring a stale signed URL.
	if (parseExpiresAt(item.expiresAt) === null) return

	const storage = getSessionStorage()
	if (!storage) return

	try {
		const storageKey = getPreviewSessionStorageKey(cacheKey)
		const existed = storage.getItem(storageKey) !== null
		if (!existed) {
			const rawCursor = Number.parseInt(
				storage.getItem(PREVIEW_SESSION_CACHE_CURSOR_KEY) || "0",
				10,
			)
			const cursor = Number.isFinite(rawCursor) ? rawCursor : 0
			const slotKey = `${PREVIEW_SESSION_CACHE_SLOT_PREFIX}${cursor % PREVIEW_SESSION_CACHE_LIMIT}`
			const evictedStorageKey = storage.getItem(slotKey)
			if (evictedStorageKey && evictedStorageKey !== storageKey) {
				storage.removeItem(evictedStorageKey)
			}
			storage.setItem(slotKey, storageKey)
			storage.setItem(PREVIEW_SESSION_CACHE_CURSOR_KEY, String(cursor + 1))
		}

		storage.setItem(
			storageKey,
			JSON.stringify({
				cacheKey,
				url: item.url,
				expiresAt: item.expiresAt,
			} satisfies PersistedPreviewCacheItem),
		)
	} catch {
		// Storage quota or privacy restrictions must not block thumbnail rendering.
	}
}

function deletePersistedPreviewCacheItem(cacheKey: string) {
	const storage = getSessionStorage()
	if (!storage) return

	try {
		const storageKey = getPreviewSessionStorageKey(cacheKey)
		storage.removeItem(storageKey)
	} catch {
		// Ignore storage access failures.
	}
}

export function getProjectFileImagePreviewMemoryCacheItem(
	cacheKey: string,
): ProjectFileImagePreviewCacheItem | undefined {
	const memoryItem = previewMemoryCache.get(cacheKey)
	if (isPreviewCacheItemValid(memoryItem)) {
		previewMemoryCache.delete(cacheKey)
		previewMemoryCache.set(cacheKey, memoryItem)
		return memoryItem
	}
	if (memoryItem) previewMemoryCache.delete(cacheKey)
	return undefined
}

export function getProjectFileImagePreviewCacheItem(
	cacheKey: string,
): ProjectFileImagePreviewCacheItem | undefined {
	const memoryItem = getProjectFileImagePreviewMemoryCacheItem(cacheKey)
	if (memoryItem) return memoryItem
	if (previewSessionCacheMisses.has(cacheKey)) return undefined

	const persistedItem = readPersistedPreviewCacheItem(cacheKey)
	if (!persistedItem) {
		previewSessionCacheMisses.add(cacheKey)
		while (previewSessionCacheMisses.size > PREVIEW_SESSION_MISS_CACHE_LIMIT) {
			const oldestKey = previewSessionCacheMisses.values().next().value
			if (!oldestKey) break
			previewSessionCacheMisses.delete(oldestKey)
		}
		return undefined
	}

	previewSessionCacheMisses.delete(cacheKey)
	setProjectFileImagePreviewCacheItem(cacheKey, persistedItem, false)
	return persistedItem
}

export function setProjectFileImagePreviewCacheItem(
	cacheKey: string,
	item: ProjectFileImagePreviewCacheItem,
	persist = true,
) {
	if (!isPreviewCacheItemValid(item)) return

	previewSessionCacheMisses.delete(cacheKey)
	previewMemoryCache.delete(cacheKey)
	previewMemoryCache.set(cacheKey, item)

	while (previewMemoryCache.size > PREVIEW_MEMORY_CACHE_LIMIT) {
		const oldestKey = previewMemoryCache.keys().next().value
		if (!oldestKey) break
		previewMemoryCache.delete(oldestKey)
	}

	if (persist) persistPreviewCacheItem(cacheKey, item)
}

export function deleteProjectFileImagePreviewCacheItem(cacheKey: string) {
	previewSessionCacheMisses.delete(cacheKey)
	previewMemoryCache.delete(cacheKey)
	deletePersistedPreviewCacheItem(cacheKey)
}

function takeNextPreviewRequestBatch(): PendingPreviewRequest[] {
	const batch: PendingPreviewRequest[] = []
	for (const [cacheKey, request] of previewRequestQueue) {
		previewRequestQueue.delete(cacheKey)
		request.started = true
		batch.push(request)
		if (batch.length >= PREVIEW_REQUEST_BATCH_SIZE) break
	}
	return batch
}

function schedulePreviewRequestFlush(delayMs = PREVIEW_REQUEST_BATCH_DELAY_MS) {
	if (previewRequestFlushTimer || previewRequestQueue.size === 0) return
	if (activePreviewRequestBatchCount >= PREVIEW_REQUEST_MAX_CONCURRENCY) return

	previewRequestFlushTimer = setTimeout(() => {
		previewRequestFlushTimer = null
		flushPreviewRequestQueue()
	}, delayMs)
}

function buildPreviewRowsByFileId(rows: GetTemporaryDownloadUrlItem[]) {
	const rowsByFileId = new Map<string, GetTemporaryDownloadUrlItem>()
	for (const row of rows) rowsByFileId.set(row.file_id, row)
	return rowsByFileId
}

function settlePreviewRequestBatch(
	batch: PendingPreviewRequest[],
	rows: GetTemporaryDownloadUrlItem[],
) {
	const rowsByFileId = buildPreviewRowsByFileId(rows)

	for (const request of batch) {
		const row = rowsByFileId.get(request.source.fileId)
		const rawUrl = row?.url?.trim()
		const safeUrl = rawUrl ? resolveSafePreviewUrl(rawUrl) || "" : ""
		const candidate = safeUrl ? { url: safeUrl, expiresAt: row?.expires_at } : undefined
		const cacheItem = isPreviewCacheItemValid(candidate) ? candidate : undefined

		if (cacheItem) {
			setProjectFileImagePreviewCacheItem(request.source.cacheKey, cacheItem)
		}

		request.resolve(cacheItem)
		previewInFlightRequests.delete(request.source.cacheKey)
	}
}

function startPreviewRequestBatch(batch: PendingPreviewRequest[]) {
	activePreviewRequestBatchCount += 1
	const fileIds = Array.from(new Set(batch.map((request) => request.source.fileId)))

	void getTemporaryDownloadUrl({
		file_ids: fileIds,
		options: {
			xMagicImageProcess: PROJECT_FILE_IMAGE_PREVIEW_PROCESS,
		},
		enableErrorMessagePrompt: false,
	})
		.then((rows) => settlePreviewRequestBatch(batch, rows ?? []))
		.catch(() => settlePreviewRequestBatch(batch, []))
		.finally(() => {
			activePreviewRequestBatchCount -= 1
			if (previewRequestQueue.size > 0) schedulePreviewRequestFlush(0)
		})
}

function flushPreviewRequestQueue() {
	while (
		activePreviewRequestBatchCount < PREVIEW_REQUEST_MAX_CONCURRENCY &&
		previewRequestQueue.size > 0
	) {
		const batch = takeNextPreviewRequestBatch()
		if (batch.length === 0) break
		startPreviewRequestBatch(batch)
	}
}

export function requestProjectFileImagePreview(
	source: ProjectFileImagePreviewRequestSource,
): Promise<ProjectFileImagePreviewCacheItem | undefined> {
	const request = enqueueProjectFileImagePreviewRequest(source)
	schedulePreviewRequestFlush()
	return request
}

function enqueueProjectFileImagePreviewRequest(
	source: ProjectFileImagePreviewRequestSource,
): Promise<ProjectFileImagePreviewCacheItem | undefined> {
	const cachedItem = getProjectFileImagePreviewCacheItem(source.cacheKey)
	if (cachedItem) return Promise.resolve(cachedItem)

	const inFlightRequest = previewInFlightRequests.get(source.cacheKey)
	if (inFlightRequest) {
		inFlightRequest.request.consumerCount += 1
		return inFlightRequest.promise
	}

	let resolveRequest!: (item: ProjectFileImagePreviewCacheItem | undefined) => void
	const request = new Promise<ProjectFileImagePreviewCacheItem | undefined>((resolve) => {
		resolveRequest = resolve
	})

	const pendingRequest: PendingPreviewRequest = {
		source,
		resolve: resolveRequest,
		consumerCount: 1,
		started: false,
	}
	previewInFlightRequests.set(source.cacheKey, { promise: request, request: pendingRequest })
	previewRequestQueue.set(source.cacheKey, pendingRequest)

	return request
}

export function cancelProjectFileImagePreviewRequest(cacheKey: string) {
	const inFlightRequest = previewInFlightRequests.get(cacheKey)
	if (!inFlightRequest) return

	inFlightRequest.request.consumerCount = Math.max(0, inFlightRequest.request.consumerCount - 1)
	if (inFlightRequest.request.consumerCount > 0 || inFlightRequest.request.started) return

	previewRequestQueue.delete(cacheKey)
	previewInFlightRequests.delete(cacheKey)
	inFlightRequest.request.resolve(undefined)
}

export function requestProjectFileImagePreviewBatch(
	sources: ProjectFileImagePreviewRequestSource[],
): Promise<Array<ProjectFileImagePreviewCacheItem | undefined>> {
	const requests = sources.map((source) => enqueueProjectFileImagePreviewRequest(source))
	flushPreviewRequestQueue()
	return Promise.all(requests)
}

export function __resetProjectFileImagePreviewCoordinatorForTests({
	clearSession = true,
}: { clearSession?: boolean } = {}) {
	if (previewRequestFlushTimer) clearTimeout(previewRequestFlushTimer)
	previewRequestFlushTimer = null
	activePreviewRequestBatchCount = 0
	previewMemoryCache.clear()
	previewSessionCacheMisses.clear()
	previewRequestQueue.clear()
	previewInFlightRequests.clear()

	if (!clearSession) return
	const storage = getSessionStorage()
	if (!storage) return
	for (let index = storage.length - 1; index >= 0; index -= 1) {
		const key = storage.key(index)
		if (key?.startsWith(PREVIEW_SESSION_CACHE_PREFIX)) storage.removeItem(key)
	}
}

export const projectFileImagePreviewCoordinatorConfig = {
	batchDelayMs: PREVIEW_REQUEST_BATCH_DELAY_MS,
	batchSize: PREVIEW_REQUEST_BATCH_SIZE,
	maxConcurrency: PREVIEW_REQUEST_MAX_CONCURRENCY,
} as const
