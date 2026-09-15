import type { GetTemporaryDownloadUrlItem } from "@/pages/superMagic/utils/api"
import { resolveSafePreviewUrl } from "@/pages/superMagic/components/Detail/components/FilesViewer/components/previewUrl"
import {
	clearSharedMediaUrlCache,
	getCachedSharedMediaUrl,
	invalidateSharedMediaUrlEntry,
	requestSharedMediaUrls,
	seedSharedMediaUrls,
	SHARED_MEDIA_URL_EXPIRY_SAFETY_WINDOW_MS,
	SHARED_MEDIA_URL_FALLBACK_TTL_MS,
} from "@/pages/superMagic/services/sharedMediaUrlCache"
import {
	SHARED_MEDIA_THUMBNAIL_IMAGE_PROCESS,
	SHARED_MEDIA_THUMBNAIL_RENDITION_KEY,
} from "@/pages/superMagic/services/sharedMediaImageProcess"
import { parseExpiresAt } from "@/components/CanvasDesign/runtime/resources/offline-cache/ossExpiryUtils"

export interface ProjectFileImagePreviewCacheItem {
	url: string
	expiresAt?: string
}

export type ProjectFileImagePreviewRequestResult =
	| { status: "loaded"; item: ProjectFileImagePreviewCacheItem }
	| { status: "unavailable" }
	| { status: "failed"; error: unknown }
	| { status: "cancelled" }

export interface ProjectFileImagePreviewRequestSource {
	fileId: string
	cacheKey: string
	directThumbnailUrl?: string
	directThumbnailExpiresAt?: string
	fileVersion?: number
	updatedAt?: string
	resourceVersion?: string
}

interface PendingPreviewRequest {
	source: ProjectFileImagePreviewRequestSource
	options: PreviewRequestOptions
	resolve: (result: ProjectFileImagePreviewRequestResult) => void
	consumerCount: number
	started: boolean
}

interface InFlightPreviewRequest {
	promise: Promise<ProjectFileImagePreviewRequestResult>
	request: PendingPreviewRequest
}

const PROJECT_FILE_IMAGE_PREVIEW_PROCESS = SHARED_MEDIA_THUMBNAIL_IMAGE_PROCESS

export const PROJECT_FILE_IMAGE_PREVIEW_RENDITION_KEY = SHARED_MEDIA_THUMBNAIL_RENDITION_KEY

const PREVIEW_REQUEST_BATCH_DELAY_MS = 80
const PREVIEW_REQUEST_BATCH_SIZE = 50
const PREVIEW_REQUEST_MAX_CONCURRENCY = 2
const LEGACY_PREVIEW_SESSION_CACHE_PREFIX = "magic:project-file-image-preview:v3:"

const previewRequestQueue = new Map<string, PendingPreviewRequest>()
const previewInFlightRequests = new Map<string, InFlightPreviewRequest>()

let previewRequestFlushTimer: ReturnType<typeof setTimeout> | null = null
let activePreviewRequestBatchCount = 0

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

interface PreviewRequestOptions {
	forceRefresh?: boolean
	allowAttachmentListUrl?: boolean
}

function getPreviewBatchOptionsKey(options: PreviewRequestOptions): string {
	const forceRefresh = options.forceRefresh ? "1" : "0"
	const allowAttachmentListUrl = options.allowAttachmentListUrl !== false ? "1" : "0"
	return `${forceRefresh}:${allowAttachmentListUrl}`
}

function isStrictPreviewRequest(options: PreviewRequestOptions): boolean {
	return Boolean(options.forceRefresh) || options.allowAttachmentListUrl === false
}

function getPreviewInFlightKey(
	source: ProjectFileImagePreviewRequestSource,
	options: PreviewRequestOptions,
): string {
	if (isStrictPreviewRequest(options)) {
		return `${source.cacheKey}::${getPreviewBatchOptionsKey(options)}`
	}
	return source.cacheKey
}

const rejectedDirectThumbnailKeys = new Map<string, number>()
const directThumbnailFirstSeenAt = new Map<string, number>()

function isDirectThumbnailRejected(cacheKey: string): boolean {
	const expiresAt = rejectedDirectThumbnailKeys.get(cacheKey)
	if (expiresAt === undefined) return false
	if (Date.now() >= expiresAt) {
		rejectedDirectThumbnailKeys.delete(cacheKey)
		return false
	}
	return true
}

function rejectDirectThumbnail(cacheKey: string): void {
	rejectedDirectThumbnailKeys.set(cacheKey, Date.now() + SHARED_MEDIA_URL_FALLBACK_TTL_MS)
}

function buildSharedMediaUrlOptions(
	sources: readonly ProjectFileImagePreviewRequestSource[],
	options: PreviewRequestOptions = {},
) {
	const fileVersions = new Map<string, number>()
	const fileUpdatedAtMap = new Map<string, string>()
	const fileResourceVersionMap = new Map<string, string>()

	for (const source of sources) {
		if (source.fileVersion !== undefined) fileVersions.set(source.fileId, source.fileVersion)
		if (source.updatedAt) fileUpdatedAtMap.set(source.fileId, source.updatedAt)
		if (source.resourceVersion) {
			fileResourceVersionMap.set(source.fileId, source.resourceVersion)
		}
	}

	return {
		imageProcess: PROJECT_FILE_IMAGE_PREVIEW_PROCESS,
		allowAttachmentListUrl: options.allowAttachmentListUrl ?? true,
		forceRefresh: options.forceRefresh,
		fileVersions,
		fileUpdatedAtMap,
		fileResourceVersionMap,
	}
}

function buildSharedMediaUrlRequestOptions(
	source: ProjectFileImagePreviewRequestSource,
	options: PreviewRequestOptions = {},
) {
	return {
		imageProcess: PROJECT_FILE_IMAGE_PREVIEW_PROCESS,
		allowAttachmentListUrl: options.allowAttachmentListUrl ?? true,
		forceRefresh: options.forceRefresh,
		fileVersion: source.fileVersion,
		updatedAt: source.updatedAt,
		resourceVersion: source.resourceVersion,
	}
}

/** Seed usable attachment-list URLs as preview fallbacks for other image scenes. */
export function seedProjectFileImagePreviewDirectUrls(
	sources: readonly ProjectFileImagePreviewRequestSource[],
): void {
	const directSources = sources.filter(
		(source) =>
			source.fileId &&
			source.directThumbnailUrl &&
			!isDirectThumbnailRejected(source.cacheKey),
	)
	for (const source of directSources) {
		if (!directThumbnailFirstSeenAt.has(source.cacheKey)) {
			directThumbnailFirstSeenAt.set(source.cacheKey, Date.now())
		}
	}
	if (directSources.length === 0) return

	const usableDirectSources = directSources.filter((source) => {
		const expiresAt = parseExpiresAt(source.directThumbnailExpiresAt)
		return (
			expiresAt === null || expiresAt - Date.now() > SHARED_MEDIA_URL_EXPIRY_SAFETY_WINDOW_MS
		)
	})
	if (usableDirectSources.length === 0) return

	seedSharedMediaUrls({
		items: usableDirectSources.map((source) => ({
			file_id: source.fileId,
			url: source.directThumbnailUrl as string,
			expires_at: source.directThumbnailExpiresAt,
		})),
		options: buildSharedMediaUrlOptions(usableDirectSources),
		source: "attachment-list",
	})
}

function toPreviewCacheItem(
	item?: GetTemporaryDownloadUrlItem,
): ProjectFileImagePreviewCacheItem | undefined {
	const rawUrl = item?.url?.trim()
	const safeUrl = rawUrl ? resolveSafePreviewUrl(rawUrl) || "" : ""
	return safeUrl ? { url: safeUrl, expiresAt: item?.expires_at } : undefined
}

export function isProjectFileImagePreviewDirectUrlUsable(
	source: ProjectFileImagePreviewRequestSource,
): boolean {
	if (!source.directThumbnailUrl || isDirectThumbnailRejected(source.cacheKey)) return false

	const cachedDirectItem = getCachedSharedMediaUrl(
		{
			fileId: source.fileId,
			...buildSharedMediaUrlRequestOptions(source),
			imageProcess: undefined,
		},
		"attachment-list",
	)
	if (cachedDirectItem) return true

	const expiresAt = parseExpiresAt(source.directThumbnailExpiresAt)
	if (expiresAt !== null) {
		return expiresAt - Date.now() > SHARED_MEDIA_URL_EXPIRY_SAFETY_WINDOW_MS
	}

	const firstSeenAt = directThumbnailFirstSeenAt.get(source.cacheKey) ?? Date.now()
	directThumbnailFirstSeenAt.set(source.cacheKey, firstSeenAt)
	return Date.now() - firstSeenAt < 15 * 60 * 1000
}

export function invalidateProjectFileImagePreviewDirectUrl(
	source: ProjectFileImagePreviewRequestSource,
): void {
	rejectDirectThumbnail(source.cacheKey)
	invalidateSharedMediaUrlEntry(
		{
			fileId: source.fileId,
			...buildSharedMediaUrlRequestOptions(source),
			imageProcess: undefined,
		},
		"attachment-list",
	)
}

export function getProjectFileImagePreviewCacheItem(
	source: ProjectFileImagePreviewRequestSource,
): ProjectFileImagePreviewCacheItem | undefined {
	if (!source.fileId) return undefined

	const options = buildSharedMediaUrlRequestOptions(source)
	const cachedItem = getCachedSharedMediaUrl(
		{
			fileId: source.fileId,
			...options,
		},
		"temporary-download-url",
	)
	if (cachedItem) return toPreviewCacheItem(cachedItem)

	if (options.allowAttachmentListUrl) {
		const attachmentItem = getCachedSharedMediaUrl(
			{
				fileId: source.fileId,
				...options,
				imageProcess: undefined,
			},
			"attachment-list",
		)
		if (attachmentItem) return toPreviewCacheItem(attachmentItem)
	}

	return undefined
}

/** Test/helper entry point that seeds the canonical shared URL cache. */
export function seedProjectFileImagePreviewCacheItem(
	source: ProjectFileImagePreviewRequestSource,
	item: ProjectFileImagePreviewCacheItem,
) {
	if (!source.fileId || !item.url) return
	seedSharedMediaUrls({
		items: [
			{
				file_id: source.fileId,
				url: item.url,
				expires_at: item.expiresAt,
			},
		],
		options: {
			imageProcess: PROJECT_FILE_IMAGE_PREVIEW_PROCESS,
			fileVersions:
				source.fileVersion === undefined
					? undefined
					: new Map([[source.fileId, source.fileVersion]]),
			fileUpdatedAtMap: source.updatedAt
				? new Map([[source.fileId, source.updatedAt]])
				: undefined,
			fileResourceVersionMap: source.resourceVersion
				? new Map([[source.fileId, source.resourceVersion]])
				: undefined,
		},
	})
}

export function deleteProjectFileImagePreviewCacheItem(
	source: ProjectFileImagePreviewRequestSource,
) {
	if (!source.fileId) return
	const options = buildSharedMediaUrlRequestOptions(source)
	invalidateSharedMediaUrlEntry({ fileId: source.fileId, ...options })
	invalidateProjectFileImagePreviewDirectUrl(source)
}

function takeNextPreviewRequestBatch(): PendingPreviewRequest[] {
	if (previewRequestQueue.size === 0) return []

	const firstRequest = previewRequestQueue.values().next().value
	if (!firstRequest) return []

	const batchOptionsKey = getPreviewBatchOptionsKey(firstRequest.options)
	const batch: PendingPreviewRequest[] = []

	for (const [cacheKey, request] of previewRequestQueue) {
		if (getPreviewBatchOptionsKey(request.options) !== batchOptionsKey) continue
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
		const cacheItem = toPreviewCacheItem(row)

		request.resolve(
			cacheItem ? { status: "loaded", item: cacheItem } : { status: "unavailable" },
		)
		previewInFlightRequests.delete(getPreviewInFlightKey(request.source, request.options))
	}
}

function failPreviewRequestBatch(batch: PendingPreviewRequest[], error: unknown) {
	for (const request of batch) {
		request.resolve({ status: "failed", error })
		previewInFlightRequests.delete(getPreviewInFlightKey(request.source, request.options))
	}
}

function startPreviewRequestBatch(batch: PendingPreviewRequest[]) {
	if (batch.length === 0) return

	activePreviewRequestBatchCount += 1
	const fileIds = Array.from(new Set(batch.map((request) => request.source.fileId)))
	const sources = batch.map(({ source }) => source)
	const batchOptions = batch[0].options

	void requestSharedMediaUrls(fileIds, {
		...buildSharedMediaUrlOptions(sources, batchOptions),
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
	options: PreviewRequestOptions = {},
): Promise<ProjectFileImagePreviewRequestResult> {
	const request = enqueueProjectFileImagePreviewRequest(source, options)
	schedulePreviewRequestFlush()
	return request
}

function enqueueProjectFileImagePreviewRequest(
	source: ProjectFileImagePreviewRequestSource,
	options: PreviewRequestOptions = {},
): Promise<ProjectFileImagePreviewRequestResult> {
	const cachedItem = options.forceRefresh
		? undefined
		: getProjectFileImagePreviewCacheItem(source)
	if (cachedItem) return Promise.resolve({ status: "loaded", item: cachedItem })

	const inFlightKey = getPreviewInFlightKey(source, options)
	const queuedPending = previewRequestQueue.get(source.cacheKey)
	if (
		queuedPending &&
		!queuedPending.started &&
		isStrictPreviewRequest(options) &&
		!isStrictPreviewRequest(queuedPending.options)
	) {
		queuedPending.options = { ...options }
		const queuedInFlight = previewInFlightRequests.get(source.cacheKey)
		if (queuedInFlight) {
			queuedInFlight.request.options = { ...options }
			queuedInFlight.request.consumerCount += 1
			return queuedInFlight.promise
		}
	}

	const inFlightRequest = previewInFlightRequests.get(inFlightKey)
	if (inFlightRequest) {
		inFlightRequest.request.consumerCount += 1
		if (
			!inFlightRequest.request.started &&
			isStrictPreviewRequest(options) &&
			getPreviewBatchOptionsKey(inFlightRequest.request.options) !==
				getPreviewBatchOptionsKey(options)
		) {
			inFlightRequest.request.options = { ...options }
			if (queuedPending && !queuedPending.started) {
				queuedPending.options = { ...options }
			}
		}
		return inFlightRequest.promise
	}

	if (isStrictPreviewRequest(options)) {
		const normalInFlight = previewInFlightRequests.get(source.cacheKey)
		if (normalInFlight?.request.started) {
			// Wait for the started normal exchange, then schedule a strict refresh
			// through the public entry so flush runs and the caller receives the
			// refreshed result (Promise.finally would keep the normal result).
			return normalInFlight.promise.then(
				() => requestProjectFileImagePreview(source, options),
				() => requestProjectFileImagePreview(source, options),
			)
		}
	}

	let resolveRequest!: (result: ProjectFileImagePreviewRequestResult) => void
	const request = new Promise<ProjectFileImagePreviewRequestResult>((resolve) => {
		resolveRequest = resolve
	})

	const pendingRequest: PendingPreviewRequest = {
		source,
		options,
		resolve: resolveRequest,
		consumerCount: 1,
		started: false,
	}
	previewInFlightRequests.set(inFlightKey, { promise: request, request: pendingRequest })
	previewRequestQueue.set(source.cacheKey, pendingRequest)

	return request
}

export function cancelProjectFileImagePreviewRequest(cacheKey: string) {
	const inFlightKeys = Array.from(previewInFlightRequests.keys()).filter(
		(key) => key === cacheKey || key.startsWith(`${cacheKey}::`),
	)
	if (inFlightKeys.length === 0) return

	for (const inFlightKey of inFlightKeys) {
		const inFlightRequest = previewInFlightRequests.get(inFlightKey)
		if (!inFlightRequest) continue

		inFlightRequest.request.consumerCount = Math.max(
			0,
			inFlightRequest.request.consumerCount - 1,
		)
		if (inFlightRequest.request.consumerCount > 0 || inFlightRequest.request.started) continue

		previewRequestQueue.delete(cacheKey)
		previewInFlightRequests.delete(inFlightKey)
		inFlightRequest.request.resolve({ status: "cancelled" })
	}
}

export function requestProjectFileImagePreviewBatch(
	sources: ProjectFileImagePreviewRequestSource[],
	options: PreviewRequestOptions = {},
): Promise<ProjectFileImagePreviewRequestResult[]> {
	const requests = sources.map((source) => enqueueProjectFileImagePreviewRequest(source, options))
	flushPreviewRequestQueue()
	return Promise.all(requests)
}

export function __resetProjectFileImagePreviewCoordinatorForTests() {
	if (previewRequestFlushTimer) clearTimeout(previewRequestFlushTimer)
	previewRequestFlushTimer = null
	activePreviewRequestBatchCount = 0
	previewRequestQueue.clear()
	previewInFlightRequests.clear()
	clearSharedMediaUrlCache()
	rejectedDirectThumbnailKeys.clear()
	directThumbnailFirstSeenAt.clear()
	clearLegacyPersistedPreviewCache()
}

export const projectFileImagePreviewCoordinatorConfig = {
	batchDelayMs: PREVIEW_REQUEST_BATCH_DELAY_MS,
	batchSize: PREVIEW_REQUEST_BATCH_SIZE,
	maxConcurrency: PREVIEW_REQUEST_MAX_CONCURRENCY,
} as const
