import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import type { DownloadImageMode } from "@/pages/superMagic/pages/Workspace/types"
import type { ImageProcessOptions } from "@/utils/image-processing"
import { parseExpiresAt } from "@/components/CanvasDesign/runtime/resources/offline-cache/ossExpiryUtils"

/** Refresh a temporary URL before the remote object can expire in the consumer. */
export const SHARED_FILE_URL_EXPIRY_SAFETY_WINDOW_MS = 30_000

export interface SharedFileUrlRequest {
	fileId: string
	fileVersion?: number
	updatedAt?: string
	downloadMode?: DownloadImageMode
	isDownload?: boolean
	cache?: boolean
	imageProcess?: ImageProcessOptions
}

interface SharedFileUrlCacheEntry {
	item: GetTemporaryDownloadUrlItem
	updatedAt?: string
}

const sharedFileUrlCache = new Map<string, SharedFileUrlCacheEntry>()
const sharedFileUrlRequests = new Map<string, Promise<GetTemporaryDownloadUrlItem | null>>()

function buildRequestKey(request: SharedFileUrlRequest): string {
	return JSON.stringify({
		fileId: request.fileId,
		fileVersion: request.fileVersion ?? null,
		updatedAt: request.updatedAt ?? null,
		downloadMode: request.downloadMode ?? null,
		isDownload: request.isDownload ?? false,
		cache: request.cache ?? null,
		imageProcess: request.imageProcess ?? null,
	})
}

function isCacheEntryValid(
	entry: SharedFileUrlCacheEntry | undefined,
	currentUpdatedAt?: string,
): boolean {
	if (!entry?.item.url || !entry.item.expires_at) return false

	const expiresAt = parseExpiresAt(entry.item.expires_at)
	if (expiresAt === null) return false
	if (expiresAt - Date.now() <= SHARED_FILE_URL_EXPIRY_SAFETY_WINDOW_MS) return false

	if (currentUpdatedAt !== undefined && entry.updatedAt !== currentUpdatedAt) return false
	return true
}

function findResponseItem(
	fileId: string,
	items: GetTemporaryDownloadUrlItem[] | undefined,
): GetTemporaryDownloadUrlItem | null {
	if (!items?.length) return null
	return items.find((item) => String(item.file_id) === fileId) ?? null
}

/**
 * Resolve one temporary file URL with shared expiry-aware caching and
 * in-flight request coalescing. Component unmounts do not evict the cache.
 */
export function resolveSharedFileUrl(
	request: SharedFileUrlRequest,
): Promise<GetTemporaryDownloadUrlItem | null> {
	const fileId = request.fileId.trim()
	if (!fileId) return Promise.resolve(null)

	const normalizedRequest = { ...request, fileId }
	const requestKey = buildRequestKey(normalizedRequest)
	const cachedEntry = sharedFileUrlCache.get(requestKey)
	if (isCacheEntryValid(cachedEntry, request.updatedAt)) {
		return Promise.resolve(cachedEntry?.item ?? null)
	}
	if (cachedEntry) sharedFileUrlCache.delete(requestKey)

	const existingRequest = sharedFileUrlRequests.get(requestKey)
	if (existingRequest) return existingRequest

	const pendingRequest = getTemporaryDownloadUrl({
		file_ids: [fileId],
		file_versions:
			request.fileVersion === undefined ? undefined : { [fileId]: request.fileVersion },
		download_mode: request.downloadMode,
		is_download: request.isDownload,
		cache: request.cache,
		options: request.imageProcess ? { xMagicImageProcess: request.imageProcess } : undefined,
	})
		.then((items) => {
			const item = findResponseItem(fileId, items)
			if (item?.url && item.expires_at) {
				sharedFileUrlCache.set(requestKey, {
					item,
					updatedAt: request.updatedAt,
				})
			}
			return item
		})
		.finally(() => {
			sharedFileUrlRequests.delete(requestKey)
		})

	sharedFileUrlRequests.set(requestKey, pendingRequest)
	return pendingRequest
}

export function invalidateSharedFileUrl(fileId: string): void {
	const normalizedFileId = fileId.trim()
	if (!normalizedFileId) return

	for (const key of sharedFileUrlCache.keys()) {
		try {
			if (JSON.parse(key).fileId === normalizedFileId) sharedFileUrlCache.delete(key)
		} catch {
			sharedFileUrlCache.delete(key)
		}
	}
}

/** Test and lifecycle escape hatch; it does not cancel already-running requests. */
export function clearSharedFileUrlCache(): void {
	sharedFileUrlCache.clear()
}

export const sharedFileUrlCacheTestUtils = {
	buildRequestKey,
	isCacheEntryValid,
}
