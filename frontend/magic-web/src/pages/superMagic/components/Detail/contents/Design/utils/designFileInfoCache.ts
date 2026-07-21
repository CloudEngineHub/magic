import type {
	CanvasFileResourceMeta,
	FileUrlRequestPriority,
	GetFileInfoResponse,
} from "@/components/CanvasDesign/public/magic-types"
import {
	parseExpiresAt,
	isOssExpired,
} from "@/components/CanvasDesign/runtime/resources/offline-cache/ossExpiryUtils"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import projectFilesStore from "@/stores/projectFiles"
import { normalizePath } from "./utils"
import {
	getResolvedPathCandidates,
	resolveDesignPathForOperation,
	resolveDesignAttachmentFromCandidates,
	resolveDesignAttachmentForNormalizedPath,
} from "./designPath"
import { GetFileInfoResponseWithFileId } from "./uploadCallbacks"
import { getPreviewFileUrlWatermarkSignature } from "@/utils/aiWatermarkPreviewFileUrlMode"
import type { ImageProcessOptions } from "@/utils/image-processing"
import {
	buildAttachmentsSnapshotKeyFromFlatFiles,
	type DesignAttachmentIndex,
} from "./designAttachmentIndex"
import {
	clearDesignFileInfoIndexedDbCache,
	cancelPendingDesignFileInfoCacheReads,
	deleteDesignFileInfoCacheEntries,
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
// get-file-url 单次请求上限，避免超大画布一次性提交过大的 file_ids payload
const MAX_GET_FILE_URL_BATCH_SIZE = 100
// identity 级 URL 结果仅保留最近使用的一段工作集，避免跨画布导航后长期累积。
const MAX_FILE_URL_RESULT_CACHE_SIZE = 2048
const MAX_FILE_URL_GENERATION_ENTRIES = 4096
const MAX_FILE_INFO_MEMORY_CACHE_SIZE = 2048
const MAX_PATH_CACHE_GENERATION_ENTRIES = 4096
const MAX_INVALIDATED_PATH_CACHE_KEYS = 4096
// 默认缓存时间 15 分钟
const DEFAULT_TTL_MS = 15 * 60 * 1000
// 上传已保存但附件树尚未刷回时的短期桥接窗口。
const OPTIMISTIC_UPLOAD_CACHE_TTL_MS = 15 * 1000
// 旧 localStorage 存储 key：仅用于一次性迁移到 IndexedDB，后续不再写入这个大 JSON。
const FILE_INFO_STORAGE_KEY = "MAGIC:supermagic-design:file-info-cache:v3"
const LEGACY_FILE_INFO_STORAGE_KEY = "MAGIC:supermagic-design:file-info-cache"
const FILE_INFO_CACHE_PAYLOAD_VERSION = 3 as const

/** 是否启用换链结果缓存：为 false 时不读内存命中、不写内存/持久化，可用于强制每次拉新 URL */
let cacheEnabled = true
/** 旧 localStorage 冷启动数据是否已尝试迁移：只执行一次，避免每次 getFileInfo 都解析持久化 JSON */
let storageCacheLoaded = false
/** IndexedDB 持续异常时停止读持久化缓存，避免失效墓碑集合无限增长。 */
let indexedDbCacheReadsDisabled = false

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
	// 记录当前 path 在最近一次解析时对应的资源版本，用于识别同 file_id 内容更新。
	resolvedResourceVersion?: string
	// 上传完成但附件快照尚未刷新时，允许短暂命中当前 path。
	allowMissingAttachment?: boolean
	optimisticMissingAttachmentAllowedUntil?: number
}

interface PersistedFileInfoCachePayload {
	version: typeof FILE_INFO_CACHE_PAYLOAD_VERSION
	entries: Record<string, CacheEntry>
}

type FileUrlRendition = "raw" | "image-process"

interface FileUrlRequestGroup {
	identityKey: string
	baseIdentityKey: string
	generation: number
	fileId: string
	rendition: FileUrlRendition
	priority: FileUrlRequestPriority
	status: "queued" | "admitted" | "in-flight"
	promise: Promise<GetTemporaryDownloadUrlItem & { url: string }>
	resolve: (value: GetTemporaryDownloadUrlItem & { url: string }) => void
	reject: (error: Error) => void
	settled: boolean
	resultCacheKeys: Set<string>
}

interface FileUrlResultEntry {
	urlItem: GetTemporaryDownloadUrlItem & { url: string }
	cachedAt: number
	previewWatermarkSignature: string
}

interface PendingFileInfoRequest {
	promise: Promise<GetFileInfoResponse>
	fileId: string
	rendition: FileUrlRendition
	token: symbol
	resourceVersion?: string
}

// 主缓存：key = designProjectId + normalizedRelativePath
const fileInfoRequestCache = new Map<string, PendingFileInfoRequest>()
const fileInfoCache = new Map<string, CacheEntry>()
const invalidatedPathCacheKeys = new Set<string>()
const pathCacheGenerationByKey = new Map<string, number>()
const pendingPathCacheReads = new Set<string>()
// URL 请求只按项目、file_id 与实际 rendition 去重；path 仅作为结果订阅方保留自己的元数据缓存。
const fileUrlRequestGroups = new Map<string, FileUrlRequestGroup>()
const activeFileUrlRequestGroups = new Set<FileUrlRequestGroup>()
const fileUrlGenerationByIdentity = new Map<string, number>()
const fileUrlResultCache = new Map<string, FileUrlResultEntry>()
const forceRefreshRequestTokens = new Map<string, symbol>()
let fileUrlFlushTimer: ReturnType<typeof setTimeout> | null = null
let fileUrlFlushAt: number | null = null
let fileUrlFlushScheduleVersion = 0

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

// 画布内只认相对路径；缓存额外按项目和实际 rendition 隔离，避免 raw/WebP URL 互相覆盖。
function buildScopedPathKey(
	normalizedPath: string,
	designProjectId?: string,
	rendition: FileUrlRendition = "raw",
): string {
	const namespace = designProjectId || "__global__"
	return `${namespace}\0${normalizedPath}\0${rendition}`
}

function hasScopedPathRendition(cacheKey: string): boolean {
	return cacheKey.endsWith("\0raw") || cacheKey.endsWith("\0image-process")
}

function resolveFileUrlRendition(
	useImageProcess: boolean | undefined,
	fileSize: number | undefined,
): FileUrlRendition {
	return useImageProcess === true && shouldUseImageProcess(fileSize) ? "image-process" : "raw"
}

function buildRequestCacheKey(cacheKey: string, rendition: FileUrlRendition): string {
	return `${cacheKey}\0${rendition}`
}

function getPathCacheKeyFromRequestCacheKey(requestCacheKey: string): string {
	const separatorIndex = requestCacheKey.lastIndexOf("\0")
	return separatorIndex < 0 ? requestCacheKey : requestCacheKey.slice(0, separatorIndex)
}

function deletePathRequestCache(cacheKey: string): void {
	fileInfoRequestCache.delete(buildRequestCacheKey(cacheKey, "raw"))
	fileInfoRequestCache.delete(buildRequestCacheKey(cacheKey, "image-process"))
}

function clearPendingPathRequest(requestCacheKey: string, requestToken: symbol): void {
	const pending = fileInfoRequestCache.get(requestCacheKey)
	if (pending?.token === requestToken) {
		fileInfoRequestCache.delete(requestCacheKey)
	}
}

function buildNamespaceKey(designProjectId?: string): string {
	return designProjectId || "__global__"
}

function parseScopedPathKey(scopedPathKey: string): {
	namespace: string
	normalizedPath: string
	rendition: FileUrlRendition
} {
	const parts = scopedPathKey.split("\0")
	if (parts.length < 2) {
		return {
			namespace: "__global__",
			normalizedPath: scopedPathKey,
			rendition: "raw",
		}
	}
	const possibleRendition = parts.at(-1)
	const hasRendition = possibleRendition === "raw" || possibleRendition === "image-process"
	return {
		namespace: parts[0] || "__global__",
		normalizedPath: parts.slice(1, hasRendition ? -1 : undefined).join("\0"),
		rendition: hasRendition ? possibleRendition : "raw",
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

function isOptimisticMissingAttachmentAllowed(entry: CacheEntry): boolean {
	return (
		entry.allowMissingAttachment === true &&
		typeof entry.optimisticMissingAttachmentAllowedUntil === "number" &&
		Date.now() < entry.optimisticMissingAttachmentAllowedUntil
	)
}

function isOptimisticMissingAttachmentExpired(
	entry: CacheEntry,
	fileItem: FileItem | null,
): boolean {
	if (fileItem) return false
	if (entry.allowMissingAttachment !== true) return false
	return !isOptimisticMissingAttachmentAllowed(entry)
}

function isPreviewWatermarkSignatureStale(entry: CacheEntry): boolean {
	return entry.previewWatermarkSignature !== getPreviewFileUrlWatermarkSignature()
}

function buildAttachmentsSnapshotKey(filesList?: FileItem[]): string {
	return buildAttachmentsSnapshotKeyFromFlatFiles(getStoreFiles(filesList))
}

function setMemoryCache(
	cacheKey: string,
	fileInfo: GetFileInfoResponse,
	resolvedFileId?: string,
	previewWatermarkSignature: string = getPreviewFileUrlWatermarkSignature(),
	attachmentsSnapshotKey?: string,
	options?: { allowMissingAttachment?: boolean },
): void {
	const now = Date.now()
	const allowMissingAttachment = options?.allowMissingAttachment === true
	fileInfoCache.delete(cacheKey)
	fileInfoCache.set(cacheKey, {
		fileInfo,
		previewWatermarkSignature,
		attachmentsSnapshotKey,
		resolvedFileId,
		...(fileInfo.resource_version
			? { resolvedResourceVersion: fileInfo.resource_version }
			: {}),
		...(allowMissingAttachment
			? {
					allowMissingAttachment: true,
					optimisticMissingAttachmentAllowedUntil: now + OPTIMISTIC_UPLOAD_CACHE_TTL_MS,
				}
			: {}),
		...(fileInfo.expires_at ? {} : { cachedAt: now }),
	})
	invalidatedPathCacheKeys.delete(cacheKey)
	trimFileInfoMemoryCache()
	trimPathCacheGenerations()
}

function deleteMemoryCache(cacheKey: string): void {
	const generation = (pathCacheGenerationByKey.get(cacheKey) ?? 0) + 1
	pathCacheGenerationByKey.delete(cacheKey)
	pathCacheGenerationByKey.set(cacheKey, generation)
	if (!indexedDbCacheReadsDisabled) {
		invalidatedPathCacheKeys.add(cacheKey)
		if (invalidatedPathCacheKeys.size > MAX_INVALIDATED_PATH_CACHE_KEYS) {
			indexedDbCacheReadsDisabled = true
			cancelPendingDesignFileInfoCacheReads()
			invalidatedPathCacheKeys.clear()
			pathCacheGenerationByKey.clear()
			void clearDesignFileInfoIndexedDbCache().then(
				() => {
					indexedDbCacheReadsDisabled = false
				},
				() => undefined,
			)
		}
	}
	fileInfoCache.delete(cacheKey)
	deletePathRequestCache(cacheKey)
	void deleteDesignFileInfoCacheEntries([cacheKey]).then(
		() => {
			if (
				pathCacheGenerationByKey.get(cacheKey) === generation &&
				!fileInfoCache.has(cacheKey)
			) {
				invalidatedPathCacheKeys.delete(cacheKey)
				trimPathCacheGenerations()
			}
		},
		() => undefined,
	)
	trimPathCacheGenerations()
}

function trimFileInfoMemoryCache(): void {
	while (fileInfoCache.size > MAX_FILE_INFO_MEMORY_CACHE_SIZE) {
		const oldestKey = fileInfoCache.keys().next().value
		if (typeof oldestKey !== "string") break
		fileInfoCache.delete(oldestKey)
	}
}

function trimPathCacheGenerations(): void {
	if (pathCacheGenerationByKey.size <= MAX_PATH_CACHE_GENERATION_ENTRIES) return
	for (const cacheKey of pathCacheGenerationByKey.keys()) {
		if (pathCacheGenerationByKey.size <= MAX_PATH_CACHE_GENERATION_ENTRIES) break
		if (pendingPathCacheReads.has(cacheKey) || invalidatedPathCacheKeys.has(cacheKey)) continue
		pathCacheGenerationByKey.delete(cacheKey)
	}
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
		...(entry.resolvedResourceVersion
			? { resolvedResourceVersion: entry.resolvedResourceVersion }
			: {}),
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
		...(entry.resolvedResourceVersion
			? { resolvedResourceVersion: entry.resolvedResourceVersion }
			: {}),
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
		.then(() => {
			indexedDbCacheReadsDisabled = false
		})
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

			if (!hasScopedPathRendition(cacheKey)) {
				// 旧 key 无法证明 URL 属于 raw 还是 image-process；丢弃后由统一批处理冷启动回填。
				shouldSyncStorage = true
				continue
			}
			fileInfoCache.set(cacheKey, entry as CacheEntry)
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
		trimFileInfoMemoryCache()
		trimPathCacheGenerations()
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

function getOptimisticFileResourceMeta(
	candidates: ReturnType<typeof getResolvedPathCandidates>,
	designProjectId?: string,
): CanvasFileResourceMeta | null {
	for (const candidate of candidates) {
		const cacheKey = buildScopedPathKey(candidate.normalizedPath, designProjectId)
		const entry = fileInfoCache.get(cacheKey)
		if (!entry) continue
		if (
			isOptimisticMissingAttachmentExpired(entry, null) ||
			isCachedFileInfoExpired(entry) ||
			isPreviewWatermarkSignatureStale(entry)
		) {
			deleteMemoryCache(cacheKey)
			continue
		}
		if (!isOptimisticMissingAttachmentAllowed(entry)) continue

		fileInfoCache.delete(cacheKey)
		fileInfoCache.set(cacheKey, entry)
		return {
			status: "exists",
			fileName: entry.fileInfo.fileName,
			...(entry.fileInfo.source !== undefined ? { source: entry.fileInfo.source } : {}),
			resourceVersion: entry.fileInfo.resource_version ?? null,
			updatedAt: entry.fileInfo.updated_at ?? null,
			contentLength: entry.fileInfo.content_length ?? null,
		}
	}

	return null
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
		return !isOptimisticMissingAttachmentAllowed(entry)
	}
	// 同一路径解析出了新的 file_id，说明发生了同名替换，旧 URL 必须丢弃。
	if (entry.resolvedFileId && entry.resolvedFileId !== fileItem.file_id) {
		return true
	}
	const cachedResourceVersion =
		entry.resolvedResourceVersion ??
		normalizeStrongResourceVersion(entry.fileInfo.resource_version)
	if (cachedResourceVersion && cachedResourceVersion !== buildFileResourceVersion(fileItem)) {
		return true
	}
	return false
}

function getCachedEntryStaleReasons(
	entry: CacheEntry,
	fileItem: FileItem | null,
	hasFilesContext: boolean,
): string[] {
	return [
		isCachedFileInfoExpired(entry) ? "expired" : null,
		isPreviewWatermarkSignatureStale(entry) ? "preview-watermark" : null,
		isOptimisticMissingAttachmentExpired(entry, fileItem) ? "optimistic-upload-window" : null,
		shouldInvalidateCachedEntry(entry, fileItem, hasFilesContext)
			? "attachment-mismatch"
			: null,
	].filter((reason): reason is string => Boolean(reason))
}

const FILE_URL_PRIORITY_RANK: Record<FileUrlRequestPriority, number> = {
	critical: 0,
	visible: 1,
	near: 2,
	background: 3,
}

const FILE_URL_FLUSH_DELAY_MS: Record<FileUrlRequestPriority, number> = {
	critical: 0,
	visible: 24,
	near: 120,
	background: 250,
}

function buildFileUrlIdentityKey(
	fileId: string,
	rendition: FileUrlRendition,
	designProjectId?: string,
): string {
	return `${buildNamespaceKey(designProjectId)}\0${fileId}\0${rendition}`
}

function normalizeFileUrlResourceVersionKey(resourceVersion?: string): string {
	return normalizeStrongResourceVersion(resourceVersion) ?? "__unversioned__"
}

function buildFileUrlResultCacheKey(identityKey: string, resourceVersion?: string): string {
	return `${identityKey}\0${normalizeFileUrlResourceVersionKey(resourceVersion)}`
}

function invalidateFileUrlResultCache(identityKey: string): void {
	const prefix = `${identityKey}\0`
	fileUrlResultCache.forEach((_, cacheKey) => {
		if (cacheKey.startsWith(prefix)) fileUrlResultCache.delete(cacheKey)
	})
}

function invalidateFileUrlResultsForFileId(fileId: string, designProjectId?: string): void {
	if (!fileId) return
	invalidateFileUrlResultCache(buildFileUrlIdentityKey(fileId, "raw", designProjectId))
	invalidateFileUrlResultCache(buildFileUrlIdentityKey(fileId, "image-process", designProjectId))
}

function supersedeFileUrlRequestsForFileId(fileId: string, designProjectId?: string): void {
	if (!fileId) return
	;(["raw", "image-process"] as FileUrlRendition[]).forEach((rendition) => {
		const identityKey = buildFileUrlIdentityKey(fileId, rendition, designProjectId)
		const nextGeneration = (fileUrlGenerationByIdentity.get(identityKey) ?? 0) + 1
		setFileUrlGeneration(identityKey, nextGeneration)
		invalidateFileUrlResultCache(identityKey)
		const group = fileUrlRequestGroups.get(identityKey)
		if (!group) return
		group.resultCacheKeys.clear()
		if (group.status !== "in-flight") {
			// 请求尚未发出，可沿用这一批，但其结果不再代表 prime 前的 path cache generation。
			group.generation = nextGeneration
			return
		}
		// 已发出的旧请求继续服务原调用方，但不能再被新调用方加入或写 completed cache。
		fileUrlRequestGroups.delete(identityKey)
	})
}

function setFileUrlGeneration(identityKey: string, generation: number): void {
	fileUrlGenerationByIdentity.delete(identityKey)
	fileUrlGenerationByIdentity.set(identityKey, generation)
	while (fileUrlGenerationByIdentity.size > MAX_FILE_URL_GENERATION_ENTRIES) {
		let removableKey: string | undefined
		for (const key of fileUrlGenerationByIdentity.keys()) {
			if (fileUrlRequestGroups.has(key)) continue
			removableKey = key
			break
		}
		if (!removableKey) break
		fileUrlGenerationByIdentity.delete(removableKey)
	}
}

function getHighestQueuedFileUrlPriority(): FileUrlRequestPriority | null {
	let highestPriority: FileUrlRequestPriority | null = null
	fileUrlRequestGroups.forEach((group) => {
		if (group.status !== "queued") return
		if (
			!highestPriority ||
			FILE_URL_PRIORITY_RANK[group.priority] < FILE_URL_PRIORITY_RANK[highestPriority]
		) {
			highestPriority = group.priority
		}
	})
	return highestPriority
}

function clearFileUrlFlushSchedule(): void {
	fileUrlFlushScheduleVersion += 1
	if (fileUrlFlushTimer) {
		clearTimeout(fileUrlFlushTimer)
		fileUrlFlushTimer = null
	}
	fileUrlFlushAt = null
}

function scheduleFileUrlFlush(): void {
	const highestPriority = getHighestQueuedFileUrlPriority()
	if (!highestPriority) return

	const delay = FILE_URL_FLUSH_DELAY_MS[highestPriority]
	const targetAt = Date.now() + delay
	if (fileUrlFlushAt !== null && fileUrlFlushAt <= targetAt) return

	clearFileUrlFlushSchedule()
	fileUrlFlushAt = targetAt
	const scheduleVersion = fileUrlFlushScheduleVersion
	if (delay === 0) {
		queueMicrotask(() => {
			if (scheduleVersion !== fileUrlFlushScheduleVersion) return
			fileUrlFlushAt = null
			void executeFileUrlBatch()
		})
		return
	}

	fileUrlFlushTimer = setTimeout(() => {
		if (scheduleVersion !== fileUrlFlushScheduleVersion) return
		fileUrlFlushTimer = null
		fileUrlFlushAt = null
		void executeFileUrlBatch()
	}, delay)
}

function settleFileUrlRequestGroup(
	group: FileUrlRequestGroup,
	result: (GetTemporaryDownloadUrlItem & { url: string }) | Error,
): void {
	if (group.settled) return
	group.settled = true
	activeFileUrlRequestGroups.delete(group)
	if (fileUrlRequestGroups.get(group.baseIdentityKey) === group) {
		fileUrlRequestGroups.delete(group.baseIdentityKey)
	}
	if (result instanceof Error) {
		group.reject(result)
	} else {
		if (
			cacheEnabled &&
			fileUrlGenerationByIdentity.get(group.baseIdentityKey) === group.generation
		) {
			group.resultCacheKeys.forEach((cacheKey) => {
				fileUrlResultCache.delete(cacheKey)
				fileUrlResultCache.set(cacheKey, {
					urlItem: result,
					cachedAt: Date.now(),
					previewWatermarkSignature: getPreviewFileUrlWatermarkSignature(),
				})
			})
			while (fileUrlResultCache.size > MAX_FILE_URL_RESULT_CACHE_SIZE) {
				const oldestKey = fileUrlResultCache.keys().next().value
				if (typeof oldestKey !== "string") break
				fileUrlResultCache.delete(oldestKey)
			}
		}
		group.resolve(result)
	}
}

async function requestFileUrlChunk(
	groups: FileUrlRequestGroup[],
	rendition: FileUrlRendition,
): Promise<void> {
	try {
		const downloadUrls = await getTemporaryDownloadUrl({
			file_ids: [...new Set(groups.map((group) => group.fileId))],
			...(rendition === "image-process" ? { options: IMAGE_PROCESS_OPTIONS } : {}),
			enableErrorMessagePrompt: false,
		})
		const urlItemByFileId = new Map<string, GetTemporaryDownloadUrlItem & { url: string }>()
		downloadUrls?.forEach((urlItem) => {
			if (urlItem.file_id && urlItem.url) {
				urlItemByFileId.set(urlItem.file_id, { ...urlItem, url: urlItem.url })
			}
		})
		groups.forEach((group) => {
			const urlItem = urlItemByFileId.get(group.fileId)
			settleFileUrlRequestGroup(
				group,
				urlItem ?? new Error(`无法获取文件下载地址: ${group.fileId}`),
			)
		})
	} catch (error) {
		const normalizedError = error instanceof Error ? error : new Error(String(error))
		groups.forEach((group) => settleFileUrlRequestGroup(group, normalizedError))
	}
}

async function requestFileUrlGroups(
	groups: FileUrlRequestGroup[],
	rendition: FileUrlRendition,
): Promise<void> {
	const remainingGroups = new Set(groups)
	while (remainingGroups.size > 0) {
		const orderedGroups = [...remainingGroups]
			.filter((group) => group.status === "admitted" && !group.settled)
			.sort(
				(left, right) =>
					FILE_URL_PRIORITY_RANK[left.priority] - FILE_URL_PRIORITY_RANK[right.priority],
			)
		if (orderedGroups.length === 0) return

		const currentChunk: FileUrlRequestGroup[] = []
		const chunkFileIds = new Set<string>()
		orderedGroups.forEach((group) => {
			if (
				!chunkFileIds.has(group.fileId) &&
				chunkFileIds.size >= MAX_GET_FILE_URL_BATCH_SIZE
			) {
				return
			}
			currentChunk.push(group)
			chunkFileIds.add(group.fileId)
		})
		currentChunk.forEach((group) => {
			remainingGroups.delete(group)
			group.status = "in-flight"
		})
		await requestFileUrlChunk(currentChunk, rendition)
	}
}

async function executeFileUrlBatch(): Promise<void> {
	clearFileUrlFlushSchedule()
	const queuedGroups = [...fileUrlRequestGroups.values()]
		.filter((group) => group.status === "queued")
		.sort(
			(left, right) =>
				FILE_URL_PRIORITY_RANK[left.priority] - FILE_URL_PRIORITY_RANK[right.priority],
		)
	if (queuedGroups.length === 0) return
	queuedGroups.forEach((group) => {
		group.status = "admitted"
	})

	const rawGroups = queuedGroups.filter((group) => group.rendition === "raw")
	const imageProcessGroups = queuedGroups.filter((group) => group.rendition === "image-process")
	await Promise.all([
		requestFileUrlGroups(rawGroups, "raw"),
		requestFileUrlGroups(imageProcessGroups, "image-process"),
	])

	if (getHighestQueuedFileUrlPriority()) {
		scheduleFileUrlFlush()
	}
}

function promoteFileUrlRequest(
	fileId: string,
	rendition: FileUrlRendition,
	priority: FileUrlRequestPriority,
	designProjectId?: string,
): void {
	const group = fileUrlRequestGroups.get(
		buildFileUrlIdentityKey(fileId, rendition, designProjectId),
	)
	if (!group || group.status === "in-flight") return
	if (FILE_URL_PRIORITY_RANK[priority] >= FILE_URL_PRIORITY_RANK[group.priority]) return
	group.priority = priority
	if (group.status === "queued") scheduleFileUrlFlush()
}

function requestFileUrl(options: {
	fileId: string
	rendition: FileUrlRendition
	priority?: FileUrlRequestPriority
	designProjectId?: string
	forceRefresh?: boolean
	resourceVersion?: string
}): Promise<GetTemporaryDownloadUrlItem & { url: string }> {
	const priority = options.priority ?? "visible"
	const baseIdentityKey = buildFileUrlIdentityKey(
		options.fileId,
		options.rendition,
		options.designProjectId,
	)
	const resultCacheKey = buildFileUrlResultCacheKey(baseIdentityKey, options.resourceVersion)
	let generation = fileUrlGenerationByIdentity.get(baseIdentityKey) ?? 0
	const existingGroup = fileUrlRequestGroups.get(baseIdentityKey)

	if (options.forceRefresh) {
		generation += 1
		setFileUrlGeneration(baseIdentityKey, generation)
		invalidateFileUrlResultCache(baseIdentityKey)
		if (existingGroup && existingGroup.status !== "in-flight") {
			existingGroup.generation = generation
			existingGroup.resultCacheKeys.clear()
			existingGroup.resultCacheKeys.add(resultCacheKey)
			promoteFileUrlRequest(
				options.fileId,
				options.rendition,
				priority,
				options.designProjectId,
			)
			return existingGroup.promise
		}
	} else if (existingGroup) {
		existingGroup.resultCacheKeys.add(resultCacheKey)
		promoteFileUrlRequest(options.fileId, options.rendition, priority, options.designProjectId)
		return existingGroup.promise
	}

	if (!options.forceRefresh && cacheEnabled) {
		const cachedResultKey = resultCacheKey
		const cachedResult = fileUrlResultCache.get(resultCacheKey)
		if (cachedResult) {
			const expiresAt = parseExpiresAt(cachedResult.urlItem.expires_at)
			const expired =
				expiresAt !== null
					? isOssExpired(expiresAt)
					: Date.now() - cachedResult.cachedAt >= DEFAULT_TTL_MS
			if (
				!expired &&
				cachedResult.previewWatermarkSignature === getPreviewFileUrlWatermarkSignature()
			) {
				fileUrlResultCache.delete(cachedResultKey)
				fileUrlResultCache.set(cachedResultKey, cachedResult)
				return Promise.resolve(cachedResult.urlItem)
			}
			fileUrlResultCache.delete(cachedResultKey)
		}
	}
	if (!fileUrlGenerationByIdentity.has(baseIdentityKey)) {
		setFileUrlGeneration(baseIdentityKey, generation)
	}

	let resolveRequest!: (value: GetTemporaryDownloadUrlItem & { url: string }) => void
	let rejectRequest!: (error: Error) => void
	const promise = new Promise<GetTemporaryDownloadUrlItem & { url: string }>(
		(resolve, reject) => {
			resolveRequest = resolve
			rejectRequest = reject
		},
	)
	const identityKey = `${baseIdentityKey}\0generation:${generation}`
	const group: FileUrlRequestGroup = {
		identityKey,
		baseIdentityKey,
		generation,
		fileId: options.fileId,
		rendition: options.rendition,
		priority,
		status: "queued",
		promise,
		resolve: resolveRequest,
		reject: rejectRequest,
		settled: false,
		resultCacheKeys: new Set([resultCacheKey]),
	}
	fileUrlRequestGroups.set(baseIdentityKey, group)
	activeFileUrlRequestGroups.add(group)
	scheduleFileUrlFlush()
	return promise
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
		hasAttachmentSnapshot?: boolean
		priority?: FileUrlRequestPriority
	},
): Promise<GetFileInfoResponse | null> {
	ensureStorageCacheLoaded()

	const operationResolution = resolveDesignPathForOperation(filePath, {
		designProjectBasePath: options?.designProjectBasePath,
		flatAttachments: getStoreFiles(filesList),
		attachmentIndex: options?.attachmentIndex,
		attachmentsReady: options?.hasAttachmentSnapshot === true,
	})
	// 历史裸路径同时命中工作区根和当前画布时，不能命中任一侧的缓存或发请求。
	if (operationResolution.status === "ambiguous") return null
	const candidates =
		operationResolution.status === "found"
			? [
					{
						resolvedPath: operationResolution.resolvedPath,
						normalizedPath: operationResolution.normalizedPath,
					},
				]
			: operationResolution.candidates
	const fallbackCandidate = candidates[0]
	if (!fallbackCandidate) {
		return null
	}

	const storeFiles = getStoreFiles(filesList)
	const hasFilesContext = storeFiles.length > 0
	const hasAttachmentSnapshot = hasFilesContext || options?.hasAttachmentSnapshot === true
	const attachmentsSnapshotKey = hasAttachmentSnapshot
		? (options?.attachmentsSnapshotKeyOverride ?? buildAttachmentsSnapshotKey(filesList))
		: undefined
	const shouldBypassCache = options?.forceRefresh === true
	const forceRefreshToken = shouldBypassCache ? Symbol(`force-refresh:${filePath}`) : undefined
	const forceRefreshCacheKeys = new Set<string>()
	const clearForceRefreshTokens = () => {
		if (!forceRefreshToken) return
		forceRefreshCacheKeys.forEach((cacheKey) => {
			if (forceRefreshRequestTokens.get(cacheKey) === forceRefreshToken) {
				forceRefreshRequestTokens.delete(cacheKey)
			}
		})
	}
	if (forceRefreshToken) {
		candidates.forEach((candidate) => {
			const currentFileItem = resolveDesignAttachmentForNormalizedPath(
				candidate.normalizedPath,
				filePath,
				{
					flatAttachments: storeFiles,
					attachmentIndex: options?.attachmentIndex,
				},
			)
			const renditions: FileUrlRendition[] = currentFileItem
				? [resolveFileUrlRendition(options?.useImageProcess, currentFileItem.file_size)]
				: ["raw", "image-process"]
			renditions.forEach((rendition) => {
				const cacheKey = buildScopedPathKey(
					candidate.normalizedPath,
					options?.designProjectId,
					rendition,
				)
				const cachedEntry = fileInfoCache.get(cacheKey)
				if (cachedEntry?.resolvedFileId) {
					invalidateFileUrlResultsForFileId(
						cachedEntry.resolvedFileId,
						options?.designProjectId,
					)
				}
				forceRefreshRequestTokens.set(cacheKey, forceRefreshToken)
				forceRefreshCacheKeys.add(cacheKey)
				deleteMemoryCache(cacheKey)
			})
		})
	}

	if (!shouldBypassCache && cacheEnabled) {
		for (const candidate of candidates) {
			const cachedFileItem = resolveDesignAttachmentForNormalizedPath(
				candidate.normalizedPath,
				filePath,
				{
					flatAttachments: getStoreFiles(filesList),
					attachmentIndex: options?.attachmentIndex,
				},
			)
			const rendition = resolveFileUrlRendition(
				options?.useImageProcess,
				cachedFileItem?.file_size,
			)
			const cacheKey = buildScopedPathKey(
				candidate.normalizedPath,
				options?.designProjectId,
				rendition,
			)
			const cachedEntry = fileInfoCache.get(cacheKey)
			if (!cachedEntry) continue
			const staleReasons = getCachedEntryStaleReasons(
				cachedEntry,
				cachedFileItem,
				hasAttachmentSnapshot,
			)
			if (staleReasons.length > 0) {
				invalidateFileUrlResultsForFileId(
					cachedEntry.resolvedFileId ?? "",
					options?.designProjectId,
				)
				deleteMemoryCache(cacheKey)
				continue
			}

			fileInfoCache.delete(cacheKey)
			fileInfoCache.set(cacheKey, cachedEntry)
			return mergeFileItemMetaIntoFileInfo(cachedEntry.fileInfo, cachedFileItem)
		}
	}

	if (!shouldBypassCache) {
		for (const candidate of candidates) {
			const currentFileItem = resolveDesignAttachmentForNormalizedPath(
				candidate.normalizedPath,
				filePath,
				{
					flatAttachments: getStoreFiles(filesList),
					attachmentIndex: options?.attachmentIndex,
				},
			)
			const rendition = resolveFileUrlRendition(
				options?.useImageProcess,
				currentFileItem?.file_size,
			)
			const cacheKey = buildScopedPathKey(
				candidate.normalizedPath,
				options?.designProjectId,
				rendition,
			)
			const requestCacheKey = buildRequestCacheKey(cacheKey, rendition)
			const cachedRequest = fileInfoRequestCache.get(requestCacheKey)
			if (!cachedRequest) continue
			if (hasAttachmentSnapshot && !currentFileItem) {
				fileInfoRequestCache.delete(requestCacheKey)
				continue
			}
			if (currentFileItem && cachedRequest.fileId !== currentFileItem.file_id) {
				fileInfoRequestCache.delete(requestCacheKey)
				continue
			}
			if (
				currentFileItem &&
				cachedRequest.resourceVersion &&
				cachedRequest.resourceVersion !== buildFileResourceVersion(currentFileItem)
			) {
				fileInfoRequestCache.delete(requestCacheKey)
				continue
			}
			promoteFileUrlRequest(
				cachedRequest.fileId,
				cachedRequest.rendition,
				options?.priority ?? "visible",
				options?.designProjectId,
			)

			return cachedRequest.promise.then((result) =>
				mergeFileItemMetaIntoFileInfo(result, currentFileItem),
			)
		}
	}

	if (!shouldBypassCache && cacheEnabled && !indexedDbCacheReadsDisabled) {
		const persistedCandidates = candidates
			.map((candidate) => {
				const cachedFileItem = resolveDesignAttachmentForNormalizedPath(
					candidate.normalizedPath,
					filePath,
					{
						flatAttachments: getStoreFiles(filesList),
						attachmentIndex: options?.attachmentIndex,
					},
				)
				const rendition = resolveFileUrlRendition(
					options?.useImageProcess,
					cachedFileItem?.file_size,
				)
				const cacheKey = buildScopedPathKey(
					candidate.normalizedPath,
					options?.designProjectId,
					rendition,
				)
				return {
					cachedFileItem,
					cacheGeneration: pathCacheGenerationByKey.get(cacheKey) ?? 0,
					cacheKey,
				}
			})
			.filter(({ cacheKey }) => !invalidatedPathCacheKeys.has(cacheKey))
		try {
			persistedCandidates.forEach(({ cacheKey }) => pendingPathCacheReads.add(cacheKey))
			const persistedEntries = await Promise.all(
				persistedCandidates.map(({ cacheKey }) => readDesignFileInfoCacheEntry(cacheKey)),
			)
			for (let index = 0; index < persistedCandidates.length; index += 1) {
				const persistedEntry = persistedEntries[index]
				if (!persistedEntry) continue
				const { cacheKey, cachedFileItem, cacheGeneration } = persistedCandidates[index]
				if ((pathCacheGenerationByKey.get(cacheKey) ?? 0) !== cacheGeneration) {
					continue
				}
				const cachedEntry = toMemoryCacheEntry(persistedEntry)
				fileInfoCache.set(cacheKey, cachedEntry)
				trimFileInfoMemoryCache()
				const staleReasons = getCachedEntryStaleReasons(
					cachedEntry,
					cachedFileItem,
					hasAttachmentSnapshot,
				)
				if (staleReasons.length > 0) {
					invalidateFileUrlResultsForFileId(
						cachedEntry.resolvedFileId ?? "",
						options?.designProjectId,
					)
					deleteMemoryCache(cacheKey)
					continue
				}

				return mergeFileItemMetaIntoFileInfo(cachedEntry.fileInfo, cachedFileItem)
			}
		} catch {
			// IndexedDB 不可用或读取已被清理操作取消时，继续走附件解析与 URL 请求。
		} finally {
			persistedCandidates.forEach(({ cacheKey }) => pendingPathCacheReads.delete(cacheKey))
			trimPathCacheGenerations()
		}
	}

	let lookupResult = resolveDesignAttachmentFromCandidates(candidates, filePath, {
		flatAttachments: getStoreFiles(filesList),
		attachmentIndex: options?.attachmentIndex,
	})
	if (!lookupResult) {
		if (hasAttachmentSnapshot) {
			const latestStoreFiles = getStoreFiles(undefined)
			const latestHasFilesContext = latestStoreFiles.length > 0
			const latestSnapshotKey = latestHasFilesContext
				? buildAttachmentsSnapshotKey(latestStoreFiles)
				: undefined
			if (latestHasFilesContext && latestSnapshotKey !== attachmentsSnapshotKey) {
				lookupResult = resolveDesignAttachmentFromCandidates(candidates, filePath, {
					flatAttachments: latestStoreFiles,
					attachmentIndex: options?.attachmentIndex,
				})
			}
			if (!lookupResult) {
				// 附件列表已有快照：当前 path 在列表中不存在即视为不存在，不再阻塞等待
				clearForceRefreshTokens()
				return null
			}
		}

		// 列表尚未就绪（本地仍为空）：上传/重命名与 workspaceFilesList 填充存在时序，仅在此场景重试
		for (let i = 0; i < 2; i++) {
			await new Promise((resolve) => setTimeout(resolve, 3000))
			lookupResult = resolveDesignAttachmentFromCandidates(candidates, filePath, {
				flatAttachments: getStoreFiles(undefined),
				attachmentIndex: options?.attachmentIndex,
			})
			if (lookupResult) break
		}
		if (!lookupResult) {
			clearForceRefreshTokens()
			return null
		}
	}

	const { fileItem, normalizedPath } = lookupResult
	const rendition = resolveFileUrlRendition(options?.useImageProcess, fileItem.file_size)
	const cacheKey = buildScopedPathKey(normalizedPath, options?.designProjectId, rendition)
	const requestCacheKey = buildRequestCacheKey(cacheKey, rendition)
	const requestToken = forceRefreshToken ?? Symbol(requestCacheKey)
	if (forceRefreshToken && !forceRefreshCacheKeys.has(cacheKey)) {
		forceRefreshRequestTokens.set(cacheKey, requestToken)
		forceRefreshCacheKeys.add(cacheKey)
		deleteMemoryCache(cacheKey)
	}
	const resourceVersion = buildFileResourceVersion(fileItem)
	const requestPromise = requestFileUrl({
		fileId: fileItem.file_id,
		rendition,
		priority: options?.priority,
		designProjectId: options?.designProjectId,
		forceRefresh: shouldBypassCache,
		resourceVersion,
	}).then(
		(urlItem): GetFileInfoResponse => {
			const result: GetFileInfoResponse = {
				src: urlItem.url,
				fileName:
					fileItem.file_name || fileItem.display_filename || fileItem.filename || "",
				...(urlItem.expires_at ? { expires_at: urlItem.expires_at } : {}),
				...(fileItem.source !== undefined ? { source: fileItem.source } : {}),
				...(urlItem.version !== undefined ? { version: urlItem.version } : {}),
				resource_version: buildResourceVersion({
					resourceVersion: getFileItemStrongResourceVersion(fileItem),
					fileId: fileItem.file_id,
					updatedAt: fileItem.updated_at ?? urlItem.updated_at,
					fileSize: fileItem.file_size,
				}),
				...(fileItem.updated_at !== undefined || urlItem.updated_at !== undefined
					? { updated_at: fileItem.updated_at ?? urlItem.updated_at }
					: {}),
				...(fileItem.file_size !== undefined ? { content_length: fileItem.file_size } : {}),
			}

			const isCurrentRequest = shouldBypassCache
				? forceRefreshRequestTokens.get(cacheKey) === requestToken
				: fileInfoRequestCache.get(requestCacheKey)?.token === requestToken
			if (cacheEnabled && isCurrentRequest) {
				setMemoryCache(
					cacheKey,
					result,
					fileItem.file_id,
					getPreviewFileUrlWatermarkSignature(),
					attachmentsSnapshotKey,
				)
				persistCacheEntriesToStorage([cacheKey])
			}
			if (!shouldBypassCache) {
				clearPendingPathRequest(requestCacheKey, requestToken)
			} else {
				clearForceRefreshTokens()
			}
			return result
		},
		(error) => {
			if (!shouldBypassCache) {
				clearPendingPathRequest(requestCacheKey, requestToken)
			} else {
				clearForceRefreshTokens()
			}
			throw error
		},
	)

	if (!shouldBypassCache) {
		fileInfoRequestCache.set(requestCacheKey, {
			promise: requestPromise,
			fileId: fileItem.file_id,
			rendition,
			token: requestToken,
			resourceVersion,
		})
	}
	return requestPromise
}

export async function getFileResourceMetaByPath(
	filePath: string,
	filesList?: FileItem[],
	options?: {
		designProjectBasePath?: string
		designProjectId?: string
		attachmentIndex?: DesignAttachmentIndex | null
		hasAttachmentSnapshot?: boolean
	},
): Promise<CanvasFileResourceMeta> {
	ensureStorageCacheLoaded()
	const operationResolution = resolveDesignPathForOperation(filePath, {
		designProjectBasePath: options?.designProjectBasePath,
		flatAttachments: getStoreFiles(filesList),
		attachmentIndex: options?.attachmentIndex,
		attachmentsReady: options?.hasAttachmentSnapshot === true,
	})
	if (operationResolution.status === "ambiguous") return { status: "unknown" }
	const candidates =
		operationResolution.status === "found"
			? [
					{
						resolvedPath: operationResolution.resolvedPath,
						normalizedPath: operationResolution.normalizedPath,
					},
				]
			: operationResolution.candidates
	if (candidates.length === 0) return { status: "unknown" }

	const storeFiles = getStoreFiles(filesList)
	const hasFilesContext = storeFiles.length > 0
	const hasAttachmentSnapshot = hasFilesContext || options?.hasAttachmentSnapshot === true
	let lookupResult = resolveDesignAttachmentFromCandidates(candidates, filePath, {
		flatAttachments: storeFiles,
		attachmentIndex: options?.attachmentIndex,
	})

	if (!lookupResult && hasAttachmentSnapshot) {
		const latestStoreFiles = getStoreFiles(undefined)
		const latestHasFilesContext = latestStoreFiles.length > 0
		if (latestHasFilesContext && latestStoreFiles !== storeFiles) {
			lookupResult = resolveDesignAttachmentFromCandidates(candidates, filePath, {
				flatAttachments: latestStoreFiles,
				attachmentIndex: options?.attachmentIndex,
			})
		}
	}

	if (!lookupResult) {
		const optimisticMeta = getOptimisticFileResourceMeta(candidates, options?.designProjectId)
		if (optimisticMeta) return optimisticMeta
		return hasAttachmentSnapshot ? { status: "deleted" } : { status: "unknown" }
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
	options?: { allowMissingAttachment?: boolean },
): void {
	ensureStorageCacheLoaded()
	if (!cacheEnabled) return

	const candidates = getResolvedPathCandidates(path, designProjectBasePath)
	const lookupResult = resolveDesignAttachmentFromCandidates(candidates, path, {
		flatAttachments: getStoreFiles(filesList),
		attachmentIndex,
	})
	const targetCandidate = lookupResult ?? candidates[0]
	if (!targetCandidate) return

	const cacheKey = buildScopedPathKey(targetCandidate.normalizedPath, designProjectId)
	const fileInfoFileId = (fileInfo as { file_id?: unknown }).file_id
	const resolvedFileId =
		lookupResult?.fileItem.file_id ??
		(typeof fileInfoFileId === "string"
			? fileInfoFileId
			: typeof fileInfoFileId === "number"
				? String(fileInfoFileId)
				: undefined)
	// 手动 prime 代表当前 path 的新一代结果；先使两个 rendition 的旧 path 请求、
	// completed identity URL 和持久化条目失效，避免旧 in-flight response 回写覆盖新 URL。
	;(["raw", "image-process"] as FileUrlRendition[]).forEach((rendition) => {
		const renditionCacheKey = buildScopedPathKey(
			targetCandidate.normalizedPath,
			designProjectId,
			rendition,
		)
		const cachedEntry = fileInfoCache.get(renditionCacheKey)
		supersedeFileUrlRequestsForFileId(
			cachedEntry?.resolvedFileId ?? resolvedFileId ?? "",
			designProjectId,
		)
		deleteMemoryCache(renditionCacheKey)
	})
	const attachmentsSnapshotKey =
		filesList && getStoreFiles(filesList).length > 0
			? (attachmentIndex?.attachmentsSnapshotKey ?? buildAttachmentsSnapshotKey(filesList))
			: undefined
	setMemoryCache(
		cacheKey,
		mergeFileItemMetaIntoFileInfo(fileInfo, lookupResult?.fileItem ?? null),
		resolvedFileId,
		getPreviewFileUrlWatermarkSignature(),
		attachmentsSnapshotKey,
		{ allowMissingAttachment: options?.allowMissingAttachment },
	)
	if (!options?.allowMissingAttachment) {
		persistCacheEntriesToStorage([cacheKey])
	}
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

		fileInfoCache.delete(cacheKey)
		fileInfoCache.set(cacheKey, entry)
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
		deleteMemoryCache(buildScopedPathKey(candidate.normalizedPath, designProjectId, "raw"))
		deleteMemoryCache(
			buildScopedPathKey(candidate.normalizedPath, designProjectId, "image-process"),
		)
	})
}

export async function getFileInfoById(
	fileId: string,
	fileName?: string,
	fileSize?: number,
	options?: {
		useImageProcess?: boolean
		filesList?: FileItem[]
		priority?: FileUrlRequestPriority
		designProjectId?: string
	},
): Promise<GetFileInfoResponseWithFileId> {
	if (!fileId) {
		throw new Error("file_id is required")
	}

	const meta = findFileItemByFileId(fileId, options?.filesList)
	const effectiveFileSize = meta?.file_size ?? fileSize
	const rendition = resolveFileUrlRendition(options?.useImageProcess, effectiveFileSize)
	const resourceVersion = meta
		? buildFileResourceVersion(meta)
		: effectiveFileSize !== undefined
			? buildResourceVersion({ fileId, fileSize: effectiveFileSize })
			: undefined
	const urlItem = await requestFileUrl({
		fileId,
		rendition,
		priority: options?.priority ?? "critical",
		designProjectId: options?.designProjectId,
		resourceVersion,
	})
	const result: GetFileInfoResponse = mergeFileItemMetaIntoFileInfo(
		{
			src: urlItem.url,
			fileName: fileName || meta?.file_name || meta?.display_filename || meta?.filename || "",
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
}

export function clearAllFileInfoCache(): void {
	ensureStorageCacheLoaded()

	cancelPendingDesignFileInfoCacheReads()
	fileInfoCache.clear()
	invalidatedPathCacheKeys.clear()
	pathCacheGenerationByKey.clear()
	pendingPathCacheReads.clear()
	fileInfoRequestCache.clear()
	fileUrlResultCache.clear()
	fileUrlGenerationByIdentity.clear()
	forceRefreshRequestTokens.clear()
	indexedDbCacheReadsDisabled = true
	clearFileUrlFlushSchedule()
	activeFileUrlRequestGroups.forEach((group) => {
		settleFileUrlRequestGroup(group, new Error("File URL request cancelled"))
	})
	fileUrlRequestGroups.clear()
	activeFileUrlRequestGroups.clear()
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

export function cleanupFileInfoCache(
	filesList?: FileItem[],
	designProjectId?: string,
	options?: { hasAttachmentSnapshot?: boolean },
): void {
	ensureStorageCacheLoaded()

	const storeFiles = getStoreFiles(filesList)
	const hasAttachmentSnapshot = storeFiles.length > 0 || options?.hasAttachmentSnapshot === true
	if (!hasAttachmentSnapshot) {
		return
	}

	const namespace = buildNamespaceKey(designProjectId)

	const currentFilePaths = new Set<string>()
	const currentFileIdByPath = new Map<string, string>()
	const currentResourceVersionByPath = new Map<string, string>()

	storeFiles.forEach((item) => {
		if (!item.is_directory && item.relative_file_path) {
			const normalizedPath = normalizePath(item.relative_file_path)
			if (normalizedPath) {
				currentFilePaths.add(normalizedPath)
				if (item.file_id) {
					currentFileIdByPath.set(normalizedPath, item.file_id)
					currentResourceVersionByPath.set(normalizedPath, buildFileResourceVersion(item))
				}
			}
		}
	})

	const keysToDelete: string[] = []
	fileInfoRequestCache.forEach((pending, requestCacheKey) => {
		const cacheKey = getPathCacheKeyFromRequestCacheKey(requestCacheKey)
		const parsedKey = parseScopedPathKey(cacheKey)
		if (parsedKey.namespace !== namespace) return
		if (
			currentFileIdByPath.get(parsedKey.normalizedPath) !== pending.fileId ||
			(pending.resourceVersion &&
				currentResourceVersionByPath.get(parsedKey.normalizedPath) !==
					pending.resourceVersion)
		) {
			fileInfoRequestCache.delete(requestCacheKey)
		}
	})

	fileInfoCache.forEach((entry, cacheKey) => {
		const parsedKey = parseScopedPathKey(cacheKey)
		if (parsedKey.namespace !== namespace) return

		// 附件列表里已经不存在这个相对路径，说明缓存已经脱离当前设计目录状态。
		if (!currentFilePaths.has(parsedKey.normalizedPath)) {
			if (isOptimisticMissingAttachmentAllowed(entry)) {
				return
			}
			invalidateFileUrlResultsForFileId(entry.resolvedFileId ?? "", designProjectId)
			keysToDelete.push(cacheKey)
			return
		}

		// 路径仍在，但当前 path 对应的 file_id 已变化，视为同路径资源被替换。
		if (
			entry.resolvedFileId &&
			currentFileIdByPath.get(parsedKey.normalizedPath) !== entry.resolvedFileId
		) {
			invalidateFileUrlResultsForFileId(entry.resolvedFileId, designProjectId)
			keysToDelete.push(cacheKey)
			return
		}
		if (
			currentResourceVersionByPath.has(parsedKey.normalizedPath) &&
			entry.resolvedResourceVersion &&
			entry.resolvedResourceVersion !==
				currentResourceVersionByPath.get(parsedKey.normalizedPath)
		) {
			invalidateFileUrlResultsForFileId(entry.resolvedFileId ?? "", designProjectId)
			keysToDelete.push(cacheKey)
		}
	})

	keysToDelete.forEach((cacheKey) => {
		deleteMemoryCache(cacheKey)
	})
}
