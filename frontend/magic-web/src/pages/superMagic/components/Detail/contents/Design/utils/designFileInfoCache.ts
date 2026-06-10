import type {
	CanvasFileResourceMeta,
	GetFileInfoResponse,
} from "@/components/CanvasDesign/types.magic"
import { parseExpiresAt, isOssExpired } from "@/components/CanvasDesign/canvas/utils/ossExpiryUtils"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import projectFilesStore from "@/stores/projectFiles"
import { normalizePath } from "./utils"
import {
	getResolvedPathCandidates,
	lookupAttachmentAmongCandidates,
	lookupAttachmentForSingleNormalizedPath,
} from "./designAttachmentPathLookup"
import { GetFileInfoResponseWithFileId } from "./uploadCallbacks"
import { getPreviewFileUrlWatermarkSignature } from "@/utils/aiWatermarkPreviewFileUrlMode"
import type { ImageProcessOptions } from "@/utils/image-processing"
import {
	buildAttachmentsSnapshotKeyFromFlatFiles,
	type DesignAttachmentIndex,
} from "./designAttachmentIndex"
import {
	clearDesignFileInfoIndexedDbCache,
	deleteDesignFileInfoCacheEntries,
	deleteDesignFileInfoCacheNamespace,
	flushDesignFileInfoIndexedDbCacheWrites,
	readDesignFileInfoCacheEntry,
	writeDesignFileInfoCacheEntries,
	type DesignFileInfoIndexedDbEntry,
} from "./designFileInfoIndexedDbCache"

const IMAGE_PROCESS_OPTIONS: { xMagicImageProcess?: ImageProcessOptions } = {
	xMagicImageProcess: {
		format: "webp",
	},
}

// 图片处理大小限制 50MB
const IMAGE_PROCESS_SIZE_LIMIT = 50971420
// 批量请求窗口时间 100ms
const BATCH_REQUEST_WINDOW_MS = 100
// get-file-url 单次请求上限，避免超大画布一次性提交过大的 file_ids payload
const MAX_GET_FILE_URL_BATCH_SIZE = 100
// 默认缓存时间 15 分钟
const DEFAULT_TTL_MS = 15 * 60 * 1000
// 旧 localStorage 存储 key：仅用于一次性迁移到 IndexedDB，后续不再写入这个大 JSON。
const FILE_INFO_STORAGE_KEY = "MAGIC:supermagic-design:file-info-cache:v3"
const LEGACY_FILE_INFO_STORAGE_KEY = "MAGIC:supermagic-design:file-info-cache"
const FILE_INFO_CACHE_PAYLOAD_VERSION = 3 as const

/** 是否启用换链结果缓存：为 false 时不读内存命中、不写内存/持久化，可用于强制每次拉新 URL */
let cacheEnabled = true
/** 旧 localStorage 冷启动数据是否已尝试迁移：只执行一次，避免每次 getFileInfo 都解析持久化 JSON */
let storageCacheLoaded = false

interface CacheEntry {
	fileInfo: GetFileInfoResponse
	/** 写入时 getTemporaryDownloadUrl 自动 download_mode 水印语义，与 getPreviewFileUrlWatermarkSignature() 一致 */
	previewWatermarkSignature: string
	/** 当前 designProject 附件列表快照；目录移动时即使 file_id 不变，也要让旧 URL 整批失效 */
	attachmentsSnapshotKey?: string
	// 当接口未返回 expires_at 时，使用写入时间 + DEFAULT_TTL_MS 兜底过期
	cachedAt?: number
	// 记录当前 path 在最近一次解析时对应的 file_id，用于识别“同路径文件被替换”
	resolvedFileId?: string
}

interface PersistedFileInfoCachePayload {
	version: typeof FILE_INFO_CACHE_PAYLOAD_VERSION
	entries: Record<string, CacheEntry>
}

interface BatchRequestItem {
	cacheKey: string
	path: string
	normalizedPath: string
	fileId: string
	fileName: string
	fileSize?: number
	updatedAt?: string
	resourceVersion?: string | null
	source?: FileItem["source"]
	useImageProcess?: boolean
	attachmentsSnapshotKey?: string
	resolve: (value: GetFileInfoResponse) => void
	reject: (error: Error) => void
}

// 主缓存：key = designProjectId + normalizedRelativePath
const fileInfoRequestCache = new Map<string, Promise<GetFileInfoResponse>>()
const fileInfoCache = new Map<string, CacheEntry>()
const namespaceAttachmentsSnapshotCache = new Map<string, string>()
/** 命名空间 → 该空间下出现过的 scoped cacheKey，用于 O(1) 批量失效（辅以存储回填时的 register） */
const scopedCacheKeysByNamespace = new Map<string, Set<string>>()
// path 维度请求去重，避免同一资源在短时间内重复换链
const fileInfoByIdRequestCache = new Map<string, Promise<GetFileInfoResponseWithFileId>>()
// 上传完成但附件列表尚未刷新时，允许宿主层按 file_id 直接换链
const batchQueue: BatchRequestItem[] = []

let batchTimer: NodeJS.Timeout | null = null

function shouldUseImageProcess(fileSize?: number): boolean {
	if (fileSize === undefined || fileSize === null || fileSize <= 0) {
		return false
	}
	return fileSize < IMAGE_PROCESS_SIZE_LIMIT
}

function getCacheStorage(): Storage | null {
	if (typeof window === "undefined") return null

	try {
		return window.localStorage
	} catch {
		return null
	}
}

function getStoreFiles(filesList?: FileItem[]): FileItem[] {
	return (filesList || projectFilesStore.workspaceFilesList || []) as FileItem[]
}

// 画布内只认相对路径；缓存层额外拼上 designProjectId 做命名空间，避免不同设计目录串 key。
function buildScopedPathKey(normalizedPath: string, designProjectId?: string): string {
	const namespace = designProjectId || "__global__"
	return `${namespace}\0${normalizedPath}`
}

function buildNamespaceKey(designProjectId?: string): string {
	return designProjectId || "__global__"
}

function parseScopedPathKey(scopedPathKey: string): {
	namespace: string
	normalizedPath: string
} {
	const separatorIndex = scopedPathKey.indexOf("\0")
	if (separatorIndex < 0) {
		return {
			namespace: "__global__",
			normalizedPath: scopedPathKey,
		}
	}
	return {
		namespace: scopedPathKey.slice(0, separatorIndex),
		normalizedPath: scopedPathKey.slice(separatorIndex + 1),
	}
}

function isCachedFileInfoExpired(entry: CacheEntry): boolean {
	const expiresAtTs = parseExpiresAt(entry.fileInfo.expires_at)
	if (expiresAtTs !== null) {
		return isOssExpired(expiresAtTs)
	}
	if (entry.cachedAt === undefined) {
		return false
	}
	return Date.now() - entry.cachedAt >= DEFAULT_TTL_MS
}

function isPreviewWatermarkSignatureStale(entry: CacheEntry): boolean {
	return entry.previewWatermarkSignature !== getPreviewFileUrlWatermarkSignature()
}

function trackScopedCacheKey(cacheKey: string): void {
	const { namespace } = parseScopedPathKey(cacheKey)
	let set = scopedCacheKeysByNamespace.get(namespace)
	if (!set) {
		set = new Set()
		scopedCacheKeysByNamespace.set(namespace, set)
	}
	set.add(cacheKey)
}

function untrackScopedCacheKey(cacheKey: string): void {
	const { namespace } = parseScopedPathKey(cacheKey)
	scopedCacheKeysByNamespace.get(namespace)?.delete(cacheKey)
}

function buildAttachmentsSnapshotKey(filesList?: FileItem[]): string {
	return buildAttachmentsSnapshotKeyFromFlatFiles(getStoreFiles(filesList))
}

function deleteNamespaceRequestCache(namespace: string): void {
	const tracked = scopedCacheKeysByNamespace.get(namespace)
	if (tracked?.size) {
		tracked.forEach((cacheKey) => {
			fileInfoRequestCache.delete(cacheKey)
		})
	}
	fileInfoRequestCache.forEach((_, cacheKey) => {
		if (parseScopedPathKey(cacheKey).namespace === namespace) {
			fileInfoRequestCache.delete(cacheKey)
		}
	})
}

function deleteNamespaceMemoryCache(namespace: string): boolean {
	const tracked = scopedCacheKeysByNamespace.get(namespace)
	let removed = false
	if (tracked?.size) {
		tracked.forEach((cacheKey) => {
			if (fileInfoCache.delete(cacheKey)) removed = true
			fileInfoRequestCache.delete(cacheKey)
		})
		scopedCacheKeysByNamespace.delete(namespace)
		if (removed) {
			deleteDesignFileInfoCacheNamespace(namespace).catch(() => undefined)
		}
		return removed
	}
	const keysToDelete: string[] = []
	fileInfoCache.forEach((_, cacheKey) => {
		if (parseScopedPathKey(cacheKey).namespace === namespace) {
			keysToDelete.push(cacheKey)
		}
	})

	keysToDelete.forEach((cacheKey) => {
		deleteMemoryCache(cacheKey)
	})

	if (keysToDelete.length > 0) {
		deleteDesignFileInfoCacheNamespace(namespace).catch(() => undefined)
	}

	return keysToDelete.length > 0
}

function syncNamespaceAttachmentsSnapshot(namespace: string, attachmentsSnapshotKey: string): void {
	const previousSnapshotKey = namespaceAttachmentsSnapshotCache.get(namespace)
	if (previousSnapshotKey === attachmentsSnapshotKey) return

	namespaceAttachmentsSnapshotCache.set(namespace, attachmentsSnapshotKey)
	if (previousSnapshotKey === undefined) return

	deleteNamespaceMemoryCache(namespace)
	deleteNamespaceRequestCache(namespace)
}

function isAttachmentsSnapshotStale(
	entry: CacheEntry,
	attachmentsSnapshotKey?: string,
	hasFilesContext?: boolean,
): boolean {
	if (!hasFilesContext || attachmentsSnapshotKey === undefined) {
		return false
	}
	return entry.attachmentsSnapshotKey !== attachmentsSnapshotKey
}

function setMemoryCache(
	cacheKey: string,
	fileInfo: GetFileInfoResponse,
	resolvedFileId?: string,
	previewWatermarkSignature: string = getPreviewFileUrlWatermarkSignature(),
	attachmentsSnapshotKey?: string,
): void {
	trackScopedCacheKey(cacheKey)
	fileInfoCache.set(cacheKey, {
		fileInfo,
		previewWatermarkSignature,
		attachmentsSnapshotKey,
		resolvedFileId,
		...(fileInfo.expires_at ? {} : { cachedAt: Date.now() }),
	})
}

function deleteMemoryCache(cacheKey: string): void {
	untrackScopedCacheKey(cacheKey)
	fileInfoCache.delete(cacheKey)
	fileInfoRequestCache.delete(cacheKey)
	deleteDesignFileInfoCacheEntries([cacheKey]).catch(() => undefined)
}

function buildIndexedDbEntry(cacheKey: string, entry: CacheEntry): DesignFileInfoIndexedDbEntry {
	const { namespace, normalizedPath } = parseScopedPathKey(cacheKey)
	const now = Date.now()
	return {
		cacheKey,
		namespace,
		normalizedPath,
		fileInfo: entry.fileInfo,
		previewWatermarkSignature: entry.previewWatermarkSignature,
		...(entry.attachmentsSnapshotKey
			? { attachmentsSnapshotKey: entry.attachmentsSnapshotKey }
			: {}),
		...(entry.cachedAt !== undefined ? { cachedAt: entry.cachedAt } : {}),
		...(entry.resolvedFileId ? { resolvedFileId: entry.resolvedFileId } : {}),
		updatedAt: now,
		lastAccessedAt: now,
	}
}

function toMemoryCacheEntry(entry: DesignFileInfoIndexedDbEntry): CacheEntry {
	return {
		fileInfo: entry.fileInfo,
		previewWatermarkSignature: entry.previewWatermarkSignature,
		...(entry.attachmentsSnapshotKey
			? { attachmentsSnapshotKey: entry.attachmentsSnapshotKey }
			: {}),
		...(entry.cachedAt !== undefined ? { cachedAt: entry.cachedAt } : {}),
		...(entry.resolvedFileId ? { resolvedFileId: entry.resolvedFileId } : {}),
	}
}

function persistCacheEntriesToStorage(cacheKeys: string[]): void {
	const seenCacheKeys = new Set<string>()
	const uniqueCacheKeys: string[] = []
	cacheKeys.forEach((cacheKey) => {
		if (seenCacheKeys.has(cacheKey)) return
		seenCacheKeys.add(cacheKey)
		uniqueCacheKeys.push(cacheKey)
	})
	const entries = uniqueCacheKeys
		.map((cacheKey) => {
			const entry = fileInfoCache.get(cacheKey)
			return entry ? buildIndexedDbEntry(cacheKey, entry) : null
		})
		.filter((entry): entry is DesignFileInfoIndexedDbEntry => Boolean(entry))
	if (entries.length === 0) return

	writeDesignFileInfoCacheEntries(entries)
		.then(() => undefined)
		.catch(() => undefined)
}

function clearLegacyPersistedCache(): void {
	const storage = getCacheStorage()
	if (!storage) return

	try {
		storage.removeItem(FILE_INFO_STORAGE_KEY)
		storage.removeItem(LEGACY_FILE_INFO_STORAGE_KEY)
	} catch {
		// ignore storage cleanup failures
	}
}

function clearPersistedCache(): void {
	clearLegacyPersistedCache()
	clearDesignFileInfoIndexedDbCache()
		.then(() => undefined)
		.catch(() => undefined)
}

function ensureStorageCacheLoaded(): void {
	if (storageCacheLoaded) return

	storageCacheLoaded = true
	const storage = getCacheStorage()
	if (!storage) {
		return
	}

	try {
		try {
			storage.removeItem(LEGACY_FILE_INFO_STORAGE_KEY)
		} catch {
			//
		}

		const raw = storage.getItem(FILE_INFO_STORAGE_KEY)
		if (!raw) {
			return
		}

		const parsed = JSON.parse(raw) as Partial<PersistedFileInfoCachePayload> | null
		if (!parsed || typeof parsed !== "object") {
			clearPersistedCache()
			return
		}

		if (parsed.version !== FILE_INFO_CACHE_PAYLOAD_VERSION) {
			clearPersistedCache()
			return
		}

		let shouldSyncStorage = false
		const restoredCacheKeys: string[] = []
		for (const [cacheKey, entry] of Object.entries(parsed.entries ?? {})) {
			if (!entry?.fileInfo?.src) {
				shouldSyncStorage = true
				continue
			}

			if (!entry.previewWatermarkSignature) {
				shouldSyncStorage = true
				continue
			}

			if (!entry.attachmentsSnapshotKey) {
				shouldSyncStorage = true
				continue
			}

			if (!entry.fileInfo.expires_at && entry.cachedAt === undefined) {
				shouldSyncStorage = true
				continue
			}

			fileInfoCache.set(cacheKey, entry as CacheEntry)
			trackScopedCacheKey(cacheKey)
			if (isCachedFileInfoExpired(entry as CacheEntry)) {
				deleteMemoryCache(cacheKey)
				shouldSyncStorage = true
			} else {
				restoredCacheKeys.push(cacheKey)
			}
		}

		if (restoredCacheKeys.length > 0) {
			persistCacheEntriesToStorage(restoredCacheKeys)
		}
		if (shouldSyncStorage || restoredCacheKeys.length > 0) {
			clearLegacyPersistedCache()
		}
	} catch {
		clearPersistedCache()
	}
}

function findFileItemByFileId(fileId: string, filesList?: FileItem[]): FileItem | null {
	if (!fileId) return null
	const found = getStoreFiles(filesList).find(
		(item) => !item.is_directory && item.file_id === fileId,
	)
	return found ?? null
}

function buildResourceVersion(parts: {
	resourceVersion?: string | null
	fileId?: string
	updatedAt?: string
	fileSize?: number
}): string {
	const version = normalizeStrongResourceVersion(parts.resourceVersion)
	if (version) return version
	return [parts.fileId || "", parts.updatedAt || "", parts.fileSize ?? ""].join(":")
}

function normalizeStrongResourceVersion(version?: string | null): string | undefined {
	if (typeof version !== "string") return undefined
	const trimmed = version.trim()
	return trimmed || undefined
}

function getFileItemStrongResourceVersion(fileItem: FileItem): string | undefined {
	return (
		normalizeStrongResourceVersion(fileItem.resource_version) ??
		normalizeStrongResourceVersion(fileItem.version)
	)
}

function buildFileResourceVersion(fileItem: FileItem): string {
	return buildResourceVersion({
		resourceVersion: getFileItemStrongResourceVersion(fileItem),
		fileId: fileItem.file_id,
		updatedAt: fileItem.updated_at,
		fileSize: fileItem.file_size,
	})
}

function buildFileResourceMeta(fileItem: FileItem): CanvasFileResourceMeta {
	return {
		status: "exists",
		fileName: fileItem.file_name || fileItem.display_filename || fileItem.filename || "",
		...(fileItem.source !== undefined ? { source: fileItem.source } : {}),
		resourceVersion: buildFileResourceVersion(fileItem),
		updatedAt: fileItem.updated_at ?? null,
		contentLength: fileItem.file_size ?? null,
	}
}

function mergeFileItemMetaIntoFileInfo(
	base: GetFileInfoResponse,
	fileItem: FileItem | null,
): GetFileInfoResponse {
	if (!fileItem) return base
	return {
		...base,
		...(fileItem.source !== undefined ? { source: fileItem.source } : {}),
		resource_version: buildFileResourceVersion(fileItem),
		...(fileItem.updated_at !== undefined ? { updated_at: fileItem.updated_at } : {}),
		...(fileItem.file_size !== undefined ? { content_length: fileItem.file_size } : {}),
	}
}

function shouldInvalidateCachedEntry(
	entry: CacheEntry,
	fileItem: FileItem | null,
	hasFilesContext: boolean,
): boolean {
	// 没有最新附件上下文时，不主动用 resolvedFileId 做失效，避免误删纯内存命中结果。
	if (!hasFilesContext) {
		return false
	}
	if (!fileItem) {
		return true
	}
	// 同一路径解析出了新的 file_id，说明发生了同名替换，旧 URL 必须丢弃。
	if (entry.resolvedFileId && entry.resolvedFileId !== fileItem.file_id) {
		return true
	}
	return false
}

function getCachedEntryStaleReasons(
	entry: CacheEntry,
	fileItem: FileItem | null,
	attachmentsSnapshotKey: string | undefined,
	hasFilesContext: boolean,
): string[] {
	return [
		isCachedFileInfoExpired(entry) ? "expired" : null,
		isPreviewWatermarkSignatureStale(entry) ? "preview-watermark" : null,
		isAttachmentsSnapshotStale(entry, attachmentsSnapshotKey, hasFilesContext)
			? "attachments-snapshot"
			: null,
		shouldInvalidateCachedEntry(entry, fileItem, hasFilesContext)
			? "attachment-mismatch"
			: null,
	].filter((reason): reason is string => Boolean(reason))
}

function chunkBatchRequestItems(items: BatchRequestItem[]): BatchRequestItem[][] {
	const chunks: BatchRequestItem[][] = []
	for (let i = 0; i < items.length; i += MAX_GET_FILE_URL_BATCH_SIZE) {
		chunks.push(items.slice(i, i + MAX_GET_FILE_URL_BATCH_SIZE))
	}
	return chunks
}

async function requestTemporaryDownloadUrlsForChunk(
	items: BatchRequestItem[],
	options?: { useImageProcess?: boolean },
): Promise<void> {
	try {
		const fileIds = items.map((item) => item.fileId)
		const downloadUrls = await getTemporaryDownloadUrl({
			file_ids: fileIds,
			...(options?.useImageProcess ? { options: IMAGE_PROCESS_OPTIONS } : {}),
		})
		processBatchRequestResults(items, downloadUrls)
	} catch (error) {
		items.forEach((item) => {
			item.reject(error as Error)
			fileInfoRequestCache.delete(item.cacheKey)
		})
	}
}

async function requestTemporaryDownloadUrlsInChunks(
	items: BatchRequestItem[],
	options?: { useImageProcess?: boolean },
): Promise<void> {
	for (const chunk of chunkBatchRequestItems(items)) {
		await requestTemporaryDownloadUrlsForChunk(chunk, options)
	}
}

// 将短时间内的多个 path 请求合并成一轮 file_id 批量换链，减少接口压力。
async function executeBatchRequest(): Promise<void> {
	if (batchQueue.length === 0) return

	const queue = [...batchQueue]
	batchQueue.length = 0
	batchTimer = null

	const withImageProcess: BatchRequestItem[] = []
	const withoutImageProcess: BatchRequestItem[] = []

	for (const item of queue) {
		if (item.useImageProcess === true && shouldUseImageProcess(item.fileSize)) {
			withImageProcess.push(item)
		} else {
			withoutImageProcess.push(item)
		}
	}

	if (withImageProcess.length > 0) {
		await requestTemporaryDownloadUrlsInChunks(withImageProcess, {
			useImageProcess: true,
		})
	}

	if (withoutImageProcess.length > 0) {
		await requestTemporaryDownloadUrlsInChunks(withoutImageProcess)
	}
}

function processBatchRequestResults(
	queue: BatchRequestItem[],
	downloadUrls: GetTemporaryDownloadUrlItem[] | null | undefined,
): void {
	if (!downloadUrls?.length) {
		queue.forEach((item) => {
			item.reject(new Error(`无法获取文件下载地址: ${item.path}`))
			fileInfoRequestCache.delete(item.cacheKey)
		})
		return
	}

	const urlItemMap = new Map<string, GetTemporaryDownloadUrlItem & { url: string }>()
	downloadUrls.forEach((urlItem) => {
		if (urlItem.file_id && urlItem.url) {
			urlItemMap.set(urlItem.file_id, {
				...urlItem,
				url: urlItem.url,
			})
		}
	})

	const cacheKeysToPersist: string[] = []
	queue.forEach((item) => {
		const urlItem = urlItemMap.get(item.fileId)
		if (!urlItem?.url) {
			item.reject(new Error(`无法获取文件下载地址: ${item.path}`))
			fileInfoRequestCache.delete(item.cacheKey)
			return
		}

		const result: GetFileInfoResponse = {
			src: urlItem.url,
			fileName: item.fileName,
			...(urlItem.expires_at ? { expires_at: urlItem.expires_at } : {}),
			...(item.source !== undefined ? { source: item.source } : {}),
			...(urlItem.version !== undefined ? { version: urlItem.version } : {}),
			resource_version: buildResourceVersion({
				resourceVersion: item.resourceVersion,
				fileId: item.fileId,
				updatedAt: item.updatedAt ?? urlItem.updated_at,
				fileSize: item.fileSize,
			}),
			...(item.updatedAt !== undefined || urlItem.updated_at !== undefined
				? { updated_at: item.updatedAt ?? urlItem.updated_at }
				: {}),
			...(item.fileSize !== undefined ? { content_length: item.fileSize } : {}),
		}

		if (cacheEnabled) {
			// 缓存仍然按 path 维度存，但会记住本次解析到的 file_id 以便后续失效校验。
			setMemoryCache(
				item.cacheKey,
				result,
				item.fileId,
				getPreviewFileUrlWatermarkSignature(),
				item.attachmentsSnapshotKey,
			)
			cacheKeysToPersist.push(item.cacheKey)
		}
		fileInfoRequestCache.delete(item.cacheKey)
		item.resolve(result)
	})

	if (cacheKeysToPersist.length > 0) {
		persistCacheEntriesToStorage(cacheKeysToPersist)
	}
}

export async function getFileInfoByPath(
	filePath: string,
	filesList?: FileItem[],
	options?: {
		useImageProcess?: boolean
		forceRefresh?: boolean
		designProjectBasePath?: string
		designProjectId?: string
		attachmentIndex?: DesignAttachmentIndex | null
		attachmentsSnapshotKeyOverride?: string
	},
): Promise<GetFileInfoResponse | null> {
	ensureStorageCacheLoaded()

	const candidates = getResolvedPathCandidates(filePath, options?.designProjectBasePath)
	const fallbackCandidate = candidates[0]
	if (!fallbackCandidate) {
		return null
	}

	const namespace = buildNamespaceKey(options?.designProjectId)
	const storeFiles = getStoreFiles(filesList)
	const hasFilesContext = storeFiles.length > 0
	const attachmentsSnapshotKey = hasFilesContext
		? (options?.attachmentsSnapshotKeyOverride ?? buildAttachmentsSnapshotKey(filesList))
		: undefined
	if (attachmentsSnapshotKey !== undefined) {
		syncNamespaceAttachmentsSnapshot(namespace, attachmentsSnapshotKey)
	}
	const shouldBypassCache = options?.forceRefresh === true

	if (!shouldBypassCache && cacheEnabled) {
		for (const candidate of candidates) {
			const cacheKey = buildScopedPathKey(candidate.normalizedPath, options?.designProjectId)
			const cachedEntry = fileInfoCache.get(cacheKey)
			if (!cachedEntry) continue

			const cachedFileItem = lookupAttachmentForSingleNormalizedPath(
				candidate.normalizedPath,
				filePath,
				getStoreFiles(filesList),
				options?.attachmentIndex,
			)
			const staleReasons = getCachedEntryStaleReasons(
				cachedEntry,
				cachedFileItem,
				attachmentsSnapshotKey,
				hasFilesContext,
			)
			if (staleReasons.length > 0) {
				deleteMemoryCache(cacheKey)
				continue
			}

			return mergeFileItemMetaIntoFileInfo(cachedEntry.fileInfo, cachedFileItem)
		}
	}

	if (!shouldBypassCache) {
		for (const candidate of candidates) {
			const cacheKey = buildScopedPathKey(candidate.normalizedPath, options?.designProjectId)
			const cachedRequest = fileInfoRequestCache.get(cacheKey)
			if (!cachedRequest) continue

			return cachedRequest.then((result) =>
				mergeFileItemMetaIntoFileInfo(
					result,
					lookupAttachmentForSingleNormalizedPath(
						candidate.normalizedPath,
						filePath,
						getStoreFiles(filesList),
						options?.attachmentIndex,
					),
				),
			)
		}
	}

	if (!shouldBypassCache && cacheEnabled) {
		for (const candidate of candidates) {
			const cacheKey = buildScopedPathKey(candidate.normalizedPath, options?.designProjectId)
			let persistedEntry: DesignFileInfoIndexedDbEntry | null = null
			try {
				persistedEntry = await readDesignFileInfoCacheEntry(cacheKey)
			} catch {
				break
			}
			if (!persistedEntry) continue

			const cachedEntry = toMemoryCacheEntry(persistedEntry)
			fileInfoCache.set(cacheKey, cachedEntry)
			trackScopedCacheKey(cacheKey)
			const cachedFileItem = lookupAttachmentForSingleNormalizedPath(
				candidate.normalizedPath,
				filePath,
				getStoreFiles(filesList),
				options?.attachmentIndex,
			)
			const staleReasons = getCachedEntryStaleReasons(
				cachedEntry,
				cachedFileItem,
				attachmentsSnapshotKey,
				hasFilesContext,
			)
			if (staleReasons.length > 0) {
				deleteMemoryCache(cacheKey)
				continue
			}

			return mergeFileItemMetaIntoFileInfo(cachedEntry.fileInfo, cachedFileItem)
		}
	}

	let lookupResult = lookupAttachmentAmongCandidates(
		candidates,
		filePath,
		getStoreFiles(filesList),
		options?.attachmentIndex,
	)
	if (!lookupResult) {
		if (hasFilesContext) {
			const latestStoreFiles = getStoreFiles(undefined)
			const latestHasFilesContext = latestStoreFiles.length > 0
			const latestSnapshotKey = latestHasFilesContext
				? buildAttachmentsSnapshotKey(latestStoreFiles)
				: undefined
			if (latestHasFilesContext && latestSnapshotKey !== attachmentsSnapshotKey) {
				lookupResult = lookupAttachmentAmongCandidates(
					candidates,
					filePath,
					latestStoreFiles,
					options?.attachmentIndex,
				)
			}
			if (!lookupResult) {
				// 附件列表已有快照：当前 path 在列表中不存在即视为不存在，不再阻塞等待
				return null
			}
		}

		// 列表尚未就绪（本地仍为空）：上传/重命名与 workspaceFilesList 填充存在时序，仅在此场景重试
		for (let i = 0; i < 2; i++) {
			await new Promise((resolve) => setTimeout(resolve, 3000))
			lookupResult = lookupAttachmentAmongCandidates(
				candidates,
				filePath,
				getStoreFiles(undefined),
				options?.attachmentIndex,
			)
			if (lookupResult) break
		}
		if (!lookupResult) {
			return null
		}
	}

	const { fileItem, normalizedPath, resolvedPath } = lookupResult
	const cacheKey = buildScopedPathKey(normalizedPath, options?.designProjectId)
	const requestPromise = new Promise<GetFileInfoResponse>((resolve, reject) => {
		batchQueue.push({
			cacheKey,
			path: resolvedPath,
			normalizedPath,
			fileId: fileItem.file_id,
			fileName: fileItem.file_name || fileItem.display_filename || fileItem.filename || "",
			fileSize: fileItem.file_size,
			updatedAt: fileItem.updated_at,
			resourceVersion: getFileItemStrongResourceVersion(fileItem),
			source: fileItem.source,
			useImageProcess: options?.useImageProcess,
			attachmentsSnapshotKey,
			resolve,
			reject,
		})

		if (!batchTimer) {
			batchTimer = setTimeout(() => {
				executeBatchRequest()
			}, BATCH_REQUEST_WINDOW_MS)
		}
	})

	if (!shouldBypassCache) {
		trackScopedCacheKey(cacheKey)
		fileInfoRequestCache.set(cacheKey, requestPromise)
	}
	return requestPromise
}

export async function getFileResourceMetaByPath(
	filePath: string,
	filesList?: FileItem[],
	options?: {
		designProjectBasePath?: string
		attachmentIndex?: DesignAttachmentIndex | null
	},
): Promise<CanvasFileResourceMeta> {
	const candidates = getResolvedPathCandidates(filePath, options?.designProjectBasePath)
	if (candidates.length === 0) return { status: "unknown" }

	const storeFiles = getStoreFiles(filesList)
	const hasFilesContext = storeFiles.length > 0
	let lookupResult = lookupAttachmentAmongCandidates(
		candidates,
		filePath,
		storeFiles,
		options?.attachmentIndex,
	)

	if (!lookupResult && hasFilesContext) {
		const latestStoreFiles = getStoreFiles(undefined)
		const latestHasFilesContext = latestStoreFiles.length > 0
		if (latestHasFilesContext && latestStoreFiles !== storeFiles) {
			lookupResult = lookupAttachmentAmongCandidates(
				candidates,
				filePath,
				latestStoreFiles,
				options?.attachmentIndex,
			)
		}
	}

	if (!lookupResult) {
		return hasFilesContext ? { status: "deleted" } : { status: "unknown" }
	}

	return buildFileResourceMeta(lookupResult.fileItem)
}

export function setFileInfoCache(
	path: string,
	fileInfo: GetFileInfoResponse,
	filesList?: FileItem[],
	designProjectBasePath?: string,
	designProjectId?: string,
	attachmentIndex?: DesignAttachmentIndex | null,
): void {
	ensureStorageCacheLoaded()
	if (!cacheEnabled) return

	const candidates = getResolvedPathCandidates(path, designProjectBasePath)
	const lookupResult = lookupAttachmentAmongCandidates(
		candidates,
		path,
		getStoreFiles(filesList),
		attachmentIndex,
	)
	const targetCandidate = lookupResult ?? candidates[0]
	if (!targetCandidate) return

	const cacheKey = buildScopedPathKey(targetCandidate.normalizedPath, designProjectId)
	const attachmentsSnapshotKey =
		filesList && getStoreFiles(filesList).length > 0
			? (attachmentIndex?.attachmentsSnapshotKey ?? buildAttachmentsSnapshotKey(filesList))
			: undefined
	setMemoryCache(
		cacheKey,
		fileInfo,
		lookupResult?.fileItem.file_id,
		getPreviewFileUrlWatermarkSignature(),
		attachmentsSnapshotKey,
	)
	persistCacheEntriesToStorage([cacheKey])
}

export function getFileInfoCache(
	path: string,
	designProjectBasePath?: string,
	designProjectId?: string,
): GetFileInfoResponse | undefined {
	ensureStorageCacheLoaded()

	const candidates = getResolvedPathCandidates(path, designProjectBasePath)

	for (const candidate of candidates) {
		const cacheKey = buildScopedPathKey(candidate.normalizedPath, designProjectId)
		const entry = fileInfoCache.get(cacheKey)
		if (!entry) continue

		if (isCachedFileInfoExpired(entry) || isPreviewWatermarkSignatureStale(entry)) {
			deleteMemoryCache(cacheKey)
			continue
		}

		return entry.fileInfo
	}

	return undefined
}

export function clearFileInfoCache(
	path: string,
	designProjectBasePath?: string,
	designProjectId?: string,
): void {
	ensureStorageCacheLoaded()

	const candidates = getResolvedPathCandidates(path, designProjectBasePath)
	if (candidates.length === 0) return

	candidates.forEach((candidate) => {
		deleteMemoryCache(buildScopedPathKey(candidate.normalizedPath, designProjectId))
	})
}

export async function getFileInfoById(
	fileId: string,
	fileName?: string,
	fileSize?: number,
	options?: { useImageProcess?: boolean; filesList?: FileItem[] },
): Promise<GetFileInfoResponseWithFileId> {
	if (!fileId) {
		throw new Error("file_id is required")
	}

	const pendingRequest = fileInfoByIdRequestCache.get(fileId)
	if (pendingRequest) {
		return pendingRequest
	}

	const requestPromise = (async () => {
		try {
			const processOptions =
				options?.useImageProcess === true && shouldUseImageProcess(fileSize)
					? IMAGE_PROCESS_OPTIONS
					: undefined

			const downloadUrls = await getTemporaryDownloadUrl({
				file_ids: [fileId],
				options: processOptions,
			})

			const urlItem = downloadUrls?.[0]
			if (!urlItem?.url) {
				throw new Error(`No URL in response for file_id: ${fileId}`)
			}

			const meta = findFileItemByFileId(fileId, options?.filesList)
			const result: GetFileInfoResponse = mergeFileItemMetaIntoFileInfo(
				{
					src: urlItem.url,
					fileName:
						fileName ||
						meta?.file_name ||
						meta?.display_filename ||
						meta?.filename ||
						"",
					...(urlItem.expires_at ? { expires_at: urlItem.expires_at } : {}),
					...(urlItem.version !== undefined ? { version: urlItem.version } : {}),
					...(urlItem.updated_at ? { updated_at: urlItem.updated_at } : {}),
				},
				meta,
			)

			// 这里只给宿主内部链路使用，返回值保留 file_id，CanvasDesign 本身不消费它。
			const contentLength = result.content_length ?? meta?.file_size ?? fileSize
			const updatedAt = meta?.updated_at ?? result.updated_at ?? urlItem.updated_at
			return {
				...result,
				file_id: fileId,
				resource_version:
					result.resource_version ??
					buildResourceVersion({
						fileId,
						updatedAt,
						fileSize: meta?.file_size ?? fileSize,
					}),
				...(contentLength !== undefined ? { content_length: contentLength } : {}),
			}
		} finally {
			fileInfoByIdRequestCache.delete(fileId)
		}
	})()

	fileInfoByIdRequestCache.set(fileId, requestPromise)
	return requestPromise
}

export function clearAllFileInfoCache(): void {
	ensureStorageCacheLoaded()

	fileInfoCache.clear()
	fileInfoRequestCache.clear()
	fileInfoByIdRequestCache.clear()
	namespaceAttachmentsSnapshotCache.clear()
	batchQueue.length = 0
	if (batchTimer) {
		clearTimeout(batchTimer)
		batchTimer = null
	}
	clearPersistedCache()
}

export async function flushFileInfoCachePersistenceForTests(): Promise<void> {
	await flushDesignFileInfoIndexedDbCacheWrites()
}

export function setCacheEnabled(enabled: boolean): void {
	cacheEnabled = enabled
}

export function isCacheEnabled(): boolean {
	return cacheEnabled
}

export function cleanupFileInfoCache(filesList?: FileItem[], designProjectId?: string): void {
	ensureStorageCacheLoaded()

	const storeFiles = getStoreFiles(filesList)
	if (storeFiles.length === 0) {
		return
	}

	const namespace = buildNamespaceKey(designProjectId)
	const attachmentsSnapshotKey = buildAttachmentsSnapshotKey(storeFiles)
	syncNamespaceAttachmentsSnapshot(namespace, attachmentsSnapshotKey)

	const currentFilePaths = new Set<string>()
	const currentFileIds = new Set<string>()

	storeFiles.forEach((item) => {
		if (!item.is_directory && item.relative_file_path) {
			const normalizedPath = normalizePath(item.relative_file_path)
			if (normalizedPath) {
				currentFilePaths.add(normalizedPath)
			}
			if (item.file_id) {
				currentFileIds.add(item.file_id)
			}
		}
	})

	const keysToDelete: string[] = []

	fileInfoCache.forEach((entry, cacheKey) => {
		const parsedKey = parseScopedPathKey(cacheKey)
		if (parsedKey.namespace !== namespace) return

		if (entry.attachmentsSnapshotKey !== attachmentsSnapshotKey) {
			keysToDelete.push(cacheKey)
			return
		}

		// 附件列表里已经不存在这个相对路径，说明缓存已经脱离当前设计目录状态。
		if (!currentFilePaths.has(parsedKey.normalizedPath)) {
			keysToDelete.push(cacheKey)
			return
		}

		// 路径仍在，但对应 file_id 不在当前附件列表中，视为同路径资源已被替换。
		if (entry.resolvedFileId && !currentFileIds.has(entry.resolvedFileId)) {
			keysToDelete.push(cacheKey)
		}
	})

	keysToDelete.forEach((cacheKey) => {
		deleteMemoryCache(cacheKey)
	})
}
