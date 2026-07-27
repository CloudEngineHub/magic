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

export type ProjectFileImagePreviewRequestResult =
	| { status: "loaded"; item: ProjectFileImagePreviewCacheItem }
	| { status: "unavailable" }
	| { status: "failed"; error: unknown }
	| { status: "cancelled" }

interface ProjectFileImagePreviewRequestSource {
	fileId: string
	cacheKey: string
}

interface PendingPreviewRequest {
	source: ProjectFileImagePreviewRequestSource
	resolve: (result: ProjectFileImagePreviewRequestResult) => void
	consumerCount: number
	started: boolean
}

interface InFlightPreviewRequest {
	promise: Promise<ProjectFileImagePreviewRequestResult>
	request: PendingPreviewRequest
}

const PROJECT_FILE_IMAGE_PREVIEW_PROCESS: ImageProcessOptions = {
	resize: { w: 320, h: 320, m: "lfit" },
	quality: 45,
	format: "webp",
	autoOrient: 1,
}

export const PROJECT_FILE_IMAGE_PREVIEW_RENDITION_KEY = "320x320-lfit-q45-webp-auto1"

const PREVIEW_MEMORY_CACHE_LIMIT = 5000
const PREVIEW_EXPIRY_SAFETY_WINDOW_MS = 30_000
const PREVIEW_REQUEST_BATCH_DELAY_MS = 80
const PREVIEW_REQUEST_BATCH_SIZE = 50
const PREVIEW_REQUEST_MAX_CONCURRENCY = 2
const LEGACY_PREVIEW_SESSION_CACHE_PREFIX = "magic:project-file-image-preview:v3:"

const previewMemoryCache = new Map<string, ProjectFileImagePreviewCacheItem>()
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

function getSessionStorage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage
	} catch {
		return null
	}
}

function clearLegacyPersistedPreviewCache() {
	const storage = getSessionStorage()
	if (!storage) return

	try {
		for (let index = storage.length - 1; index >= 0; index -= 1) {
			const key = storage.key(index)
			if (key?.startsWith(LEGACY_PREVIEW_SESSION_CACHE_PREFIX)) {
				storage.removeItem(key)
			}
		}
	} catch {
		// Legacy cleanup must not block thumbnail rendering.
	}
}

clearLegacyPersistedPreviewCache()

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
	return getProjectFileImagePreviewMemoryCacheItem(cacheKey)
}

export function setProjectFileImagePreviewCacheItem(
	cacheKey: string,
	item: ProjectFileImagePreviewCacheItem,
) {
	if (!isPreviewCacheItemValid(item)) return

	previewMemoryCache.delete(cacheKey)
	previewMemoryCache.set(cacheKey, item)

	while (previewMemoryCache.size > PREVIEW_MEMORY_CACHE_LIMIT) {
		const oldestKey = previewMemoryCache.keys().next().value
		if (!oldestKey) break
		previewMemoryCache.delete(oldestKey)
	}
}

export function deleteProjectFileImagePreviewCacheItem(cacheKey: string) {
	previewMemoryCache.delete(cacheKey)
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

		request.resolve(
			cacheItem ? { status: "loaded", item: cacheItem } : { status: "unavailable" },
		)
		previewInFlightRequests.delete(request.source.cacheKey)
	}
}

function failPreviewRequestBatch(batch: PendingPreviewRequest[], error: unknown) {
	for (const request of batch) {
		request.resolve({ status: "failed", error })
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
		.catch((error) => failPreviewRequestBatch(batch, error))
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
): Promise<ProjectFileImagePreviewRequestResult> {
	const request = enqueueProjectFileImagePreviewRequest(source)
	schedulePreviewRequestFlush()
	return request
}

function enqueueProjectFileImagePreviewRequest(
	source: ProjectFileImagePreviewRequestSource,
): Promise<ProjectFileImagePreviewRequestResult> {
	const cachedItem = getProjectFileImagePreviewCacheItem(source.cacheKey)
	if (cachedItem) return Promise.resolve({ status: "loaded", item: cachedItem })

	const inFlightRequest = previewInFlightRequests.get(source.cacheKey)
	if (inFlightRequest) {
		inFlightRequest.request.consumerCount += 1
		return inFlightRequest.promise
	}

	let resolveRequest!: (result: ProjectFileImagePreviewRequestResult) => void
	const request = new Promise<ProjectFileImagePreviewRequestResult>((resolve) => {
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
	inFlightRequest.request.resolve({ status: "cancelled" })
}

export function requestProjectFileImagePreviewBatch(
	sources: ProjectFileImagePreviewRequestSource[],
): Promise<ProjectFileImagePreviewRequestResult[]> {
	const requests = sources.map((source) => enqueueProjectFileImagePreviewRequest(source))
	flushPreviewRequestQueue()
	return Promise.all(requests)
}

export function __resetProjectFileImagePreviewCoordinatorForTests() {
	if (previewRequestFlushTimer) clearTimeout(previewRequestFlushTimer)
	previewRequestFlushTimer = null
	activePreviewRequestBatchCount = 0
	previewMemoryCache.clear()
	previewRequestQueue.clear()
	previewInFlightRequests.clear()
	clearLegacyPersistedPreviewCache()
}

export const projectFileImagePreviewCoordinatorConfig = {
	batchDelayMs: PREVIEW_REQUEST_BATCH_DELAY_MS,
	batchSize: PREVIEW_REQUEST_BATCH_SIZE,
	maxConcurrency: PREVIEW_REQUEST_MAX_CONCURRENCY,
} as const
