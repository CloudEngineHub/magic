import type { Canvas } from "../../core/Canvas"
import type {
	AttachmentSourceEnum,
	CanvasFileResourceMeta,
	GetFileInfoResponse,
} from "../../../public/magic-types"
import type {
	CachedMediaResource,
	MediaResourceOfflineCacheMediaType,
} from "./MediaResourceOfflineCacheManager"
import { parseExpiresAt, isOssExpired } from "./ossExpiryUtils"
import { resolveCanonicalResourcePath, normalizePathLocal } from "../../shared/path/pathUtils"
import {
	getFailureReasonFromGetFileInfoError,
	type ResourceLoadFailureReason,
} from "../media-common/resourceLoadFailure"

export interface MediaResourceUrlEntry {
	ossSrc: string | null
	ossSrcFromCachedFallback: boolean
	sourceUrl: string | null
	expiresAt: number | null
	source?: AttachmentSourceEnum
	fileName?: string
	resourceVersion: string | null
	sourceUpdatedAt: string | null
	contentLength: number | null
	exchangePromise: Promise<string | null> | null
	backgroundRefreshPromise: Promise<void> | null
	/** 最近一次后台 metadata 校验调度时间；用于避免缓存命中热路径反复强制换链 */
	lastBackgroundRefreshAt?: number
	lastFailureReason: ResourceLoadFailureReason | null
}

export interface ResolvedMediaResourceOssInfo {
	ossSrc: string
	expiresAt: number | null
}

export interface MediaResourceUrlLifecycleOptions<TEntry extends MediaResourceUrlEntry> {
	canvas: Canvas
	mediaType: MediaResourceOfflineCacheMediaType
	useImageProcess: boolean
	isDestroyed: () => boolean
	onStaleRequestDrop?: () => void
	setFailureReason: (entry: TEntry, reason: ResourceLoadFailureReason | null) => void
	onResourceDeleted: (normalizedPath: string, entry: TEntry) => void
	refreshResource: (path: string) => Promise<boolean>
	onResourceMetadataHydrated?: (normalizedPath: string, entry: TEntry) => void
	incrementDiagnostic: (
		counter:
			| "cachedResourceHitCount"
			| "cachedResourceMissCount"
			| "getFileInfoCount"
			| "getFileInfoForceRefreshCount"
			| "backgroundRefreshQueuedCount"
			| "backgroundRefreshDedupedCount"
			| "backgroundRefreshSkippedCount"
			| "metadataProbeCount"
			| "metadataUnchangedCount"
			| "metadataChangedCount"
			| "metadataUnknownCount"
			| "metadataDeletedCount",
	) => void
}

const BACKGROUND_METADATA_REFRESH_COOLDOWN_MS = 60 * 1000

export class MediaResourceUrlLifecycle<TEntry extends MediaResourceUrlEntry> {
	private readonly pathAliasToCanonical = new Map<string, string>()

	constructor(private readonly options: MediaResourceUrlLifecycleOptions<TEntry>) {}

	public canonicalResourcePath(path: string): string {
		const canonical = resolveCanonicalResourcePath(path, this.getResolveAbsolutePath())
		this.rememberPathAlias(path, canonical)
		return canonical
	}

	public getCanonicalFromAlias(path: string): string {
		const weak = normalizePathLocal(path)
		return this.pathAliasToCanonical.get(weak) ?? weak
	}

	public clearCachedFallbackOssSrc(entry: TEntry): void {
		if (!entry.ossSrcFromCachedFallback) return
		entry.ossSrc = null
		entry.expiresAt = null
		entry.ossSrcFromCachedFallback = false
	}

	public clearExpiredOssSrc(entry: TEntry): void {
		if (entry.ossSrc && isOssExpired(entry.expiresAt)) {
			entry.ossSrc = null
			entry.ossSrcFromCachedFallback = false
			entry.sourceUrl = null
			entry.expiresAt = null
		}
	}

	public applyVirtualResourceBypass(entry: TEntry): void {
		const offlineCache = this.options.canvas.mediaResourceOfflineCacheManager
		if (
			!entry.ossSrc ||
			!offlineCache.shouldBypassVirtualResource() ||
			!offlineCache.isVirtualResourceUrl(entry.ossSrc)
		) {
			return
		}

		entry.ossSrc = entry.sourceUrl && !isOssExpired(entry.expiresAt) ? entry.sourceUrl : null
		if (!entry.ossSrc) {
			entry.ossSrcFromCachedFallback = false
		}
	}

	public applyFileInfoMetadata(entry: TEntry, fileInfo: GetFileInfoResponse): void {
		entry.sourceUrl = fileInfo.src
		entry.expiresAt = parseExpiresAt(fileInfo.expires_at)
		entry.source = fileInfo.source
		entry.fileName = fileInfo.fileName
		entry.resourceVersion = fileInfo.resource_version ?? null
		entry.sourceUpdatedAt = fileInfo.updated_at ?? null
		entry.contentLength = fileInfo.content_length ?? null
	}

	public applyResourceMeta(entry: TEntry, meta: CanvasFileResourceMeta): void {
		entry.source = meta.source
		entry.fileName = meta.fileName
		entry.resourceVersion = meta.resourceVersion ?? null
		entry.sourceUpdatedAt = meta.updatedAt ?? null
		entry.contentLength = meta.contentLength ?? null
	}

	public isSameResourceVersion(
		currentVersion: string | null | undefined,
		latestVersion: string | null | undefined,
	): boolean {
		return !!currentVersion && !!latestVersion && currentVersion === latestVersion
	}

	public async ensureFreshOssInfo(
		path: string,
		entry: TEntry,
		options?: {
			forceRefresh?: boolean
			bypassVirtualResource?: boolean
			allowCachedFallback?: boolean
		},
	): Promise<ResolvedMediaResourceOssInfo | null> {
		if (this.isDestroyed()) return null

		if (options?.forceRefresh) {
			entry.ossSrc = null
			entry.ossSrcFromCachedFallback = false
			entry.expiresAt = null
		} else {
			this.clearExpiredOssSrc(entry)
			this.applyVirtualResourceBypass(entry)
		}
		if (!options?.allowCachedFallback) {
			this.clearCachedFallbackOssSrc(entry)
		}
		if (entry.ossSrc && !isOssExpired(entry.expiresAt)) {
			return {
				ossSrc: entry.ossSrc,
				expiresAt: entry.expiresAt,
			}
		}

		const ossSrc = await this.exchangeOssSrc(path, entry, options)
		if (this.isDestroyed()) return null
		if (!ossSrc) {
			this.options.setFailureReason(entry, entry.lastFailureReason ?? "not-found")
			if (
				!options?.allowCachedFallback ||
				options?.forceRefresh ||
				entry.lastFailureReason === "not-found" ||
				this.options.canvas.mediaResourceOfflineCacheManager.shouldBypassVirtualResource()
			) {
				return null
			}
			const cached = await this.getCachedResource(path, entry)
			if (!cached?.url) return null
			this.options.setFailureReason(entry, null)
			return {
				ossSrc: cached.url,
				expiresAt: entry.expiresAt,
			}
		}

		return {
			ossSrc,
			expiresAt: entry.expiresAt,
		}
	}

	public async exchangeOssSrc(
		path: string,
		entry: TEntry,
		options?: { forceRefresh?: boolean; bypassVirtualResource?: boolean },
	): Promise<string | null> {
		if (this.isDestroyed()) return null
		const getFileInfo = this.options.canvas.magicConfigManager.config?.methods?.getFileInfo
		if (!getFileInfo) {
			this.options.setFailureReason(entry, "load-error")
			return null
		}

		if (entry.exchangePromise && !options?.forceRefresh) {
			return entry.exchangePromise
		}

		const promise = (async () => {
			try {
				this.options.incrementDiagnostic("getFileInfoCount")
				if (options?.forceRefresh) {
					this.options.incrementDiagnostic("getFileInfoForceRefreshCount")
				}
				const fileInfo = await getFileInfo(path, {
					useImageProcess: this.options.useImageProcess,
					forceRefresh: options?.forceRefresh,
				})
				if (this.isDestroyed()) return null
				if (fileInfo?.src) {
					this.options.setFailureReason(entry, null)
					const hadResourceVersion = !!entry.resourceVersion
					this.applyFileInfoMetadata(entry, fileInfo)
					if (!hadResourceVersion) {
						this.options.onResourceMetadataHydrated?.(
							this.canonicalResourcePath(path),
							entry,
						)
					}
					const resourceUrl =
						await this.options.canvas.mediaResourceOfflineCacheManager.resolveResourceUrl(
							{
								path,
								url: fileInfo.src,
								mediaType: this.options.mediaType,
								expiresAt: entry.expiresAt,
								resourceVersion: fileInfo.resource_version,
								sourceUpdatedAt: fileInfo.updated_at,
								contentLength: fileInfo.content_length,
							},
							{
								bypassVirtualResource: options?.bypassVirtualResource,
								preferVirtualResource: !options?.bypassVirtualResource,
							},
						)
					if (this.isDestroyed()) return null
					entry.ossSrc = resourceUrl
					entry.ossSrcFromCachedFallback = false
					return resourceUrl
				}
				this.options.setFailureReason(entry, "load-error")
				return null
			} catch (error) {
				const reason = getFailureReasonFromGetFileInfoError(error)
				this.options.setFailureReason(entry, reason)
				if (reason === "not-found") {
					const cachePath = this.canonicalResourcePath(path)
					this.options.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
						path: cachePath,
						mediaType: this.options.mediaType,
					})
				}
				return null
			}
		})()

		entry.exchangePromise = promise

		try {
			return await promise
		} finally {
			entry.exchangePromise = null
		}
	}

	public triggerBackgroundMetadataRefresh(
		path: string,
		normalizedPath: string,
		entry: TEntry,
	): void {
		if (this.isDestroyed()) return
		if (entry.backgroundRefreshPromise) {
			this.options.incrementDiagnostic("backgroundRefreshDedupedCount")
			return
		}
		const shouldCooldownFallbackRefresh =
			typeof this.options.canvas.magicConfigManager.config?.methods?.getFileResourceMeta !==
			"function"
		const now = Date.now()
		if (shouldCooldownFallbackRefresh) {
			if (
				entry.lastBackgroundRefreshAt !== undefined &&
				now - entry.lastBackgroundRefreshAt < BACKGROUND_METADATA_REFRESH_COOLDOWN_MS
			) {
				this.options.incrementDiagnostic("backgroundRefreshSkippedCount")
				return
			}
			entry.lastBackgroundRefreshAt = now
		}

		this.options.incrementDiagnostic("backgroundRefreshQueuedCount")
		entry.backgroundRefreshPromise = this.refreshResourceMetadata(path, normalizedPath, entry)
			.then(() => undefined)
			.catch(() => undefined)
			.finally(() => {
				entry.backgroundRefreshPromise = null
			})
	}

	public async refreshResourceMetadata(
		path: string,
		normalizedPath: string,
		entry: TEntry,
	): Promise<void> {
		if (this.isDestroyed()) return
		const methods = this.options.canvas.magicConfigManager.config?.methods
		const getFileInfo = methods?.getFileInfo
		if (!getFileInfo) return

		try {
			const getFileResourceMeta = methods?.getFileResourceMeta
			if (getFileResourceMeta) {
				this.options.incrementDiagnostic("metadataProbeCount")
				const currentVersion = entry.resourceVersion
				const meta = await getFileResourceMeta(path, {
					useImageProcess: this.options.useImageProcess,
				})
				if (this.isDestroyed()) return

				if (meta.status === "deleted") {
					this.options.incrementDiagnostic("metadataDeletedCount")
					this.options.setFailureReason(entry, "not-found")
					this.options.onResourceDeleted(normalizedPath, entry)
					return
				}

				if (
					meta.status === "exists" &&
					(!currentVersion ||
						this.isSameResourceVersion(currentVersion, meta.resourceVersion))
				) {
					this.options.incrementDiagnostic("metadataUnchangedCount")
					this.options.setFailureReason(entry, null)
					this.applyResourceMeta(entry, meta)
					if (!currentVersion) {
						this.options.onResourceMetadataHydrated?.(normalizedPath, entry)
					}
					return
				}

				this.options.incrementDiagnostic(
					meta.status === "exists" ? "metadataChangedCount" : "metadataUnknownCount",
				)
				await this.options.refreshResource(path)
				return
			}

			this.options.incrementDiagnostic("getFileInfoForceRefreshCount")
			const fileInfo = await getFileInfo(path, {
				useImageProcess: this.options.useImageProcess,
				forceRefresh: true,
			})
			if (this.isDestroyed()) return
			if (!fileInfo?.src) {
				this.options.setFailureReason(entry, "load-error")
				return
			}

			this.options.setFailureReason(entry, null)
			if (
				!fileInfo.resource_version ||
				!entry.resourceVersion ||
				this.isSameResourceVersion(entry.resourceVersion, fileInfo.resource_version)
			) {
				const hadResourceVersion = !!entry.resourceVersion
				this.applyFileInfoMetadata(entry, fileInfo)
				if (!hadResourceVersion) {
					this.options.onResourceMetadataHydrated?.(normalizedPath, entry)
				}

				await this.options.canvas.mediaResourceOfflineCacheManager.resolveResourceUrl(
					{
						path,
						url: fileInfo.src,
						mediaType: this.options.mediaType,
						expiresAt: entry.expiresAt,
						resourceVersion: fileInfo.resource_version,
						sourceUpdatedAt: fileInfo.updated_at,
						contentLength: fileInfo.content_length,
					},
					{
						registerOfflineResource: true,
					},
				)
				return
			}
			await this.options.refreshResource(path)
		} catch (error) {
			const reason = getFailureReasonFromGetFileInfoError(error)
			this.options.setFailureReason(entry, reason)
			if (reason !== "not-found") return

			this.options.onResourceDeleted(normalizedPath, entry)
		}
	}

	public async getCachedResource(
		path: string,
		entry: TEntry,
	): Promise<CachedMediaResource | null> {
		if (this.isDestroyed()) return null
		try {
			const offlineCache = this.options.canvas.mediaResourceOfflineCacheManager
			if (offlineCache.shouldBypassVirtualResource()) {
				this.options.incrementDiagnostic("cachedResourceMissCount")
				return null
			}
			const cached = await offlineCache.getCachedResource(path, this.options.mediaType)
			if (this.isDestroyed()) return null
			if (!cached?.url) {
				this.options.incrementDiagnostic("cachedResourceMissCount")
				return null
			}

			this.options.incrementDiagnostic("cachedResourceHitCount")
			this.applyCachedResource(entry, cached)
			return cached
		} catch {
			this.options.setFailureReason(entry, "load-error")
			return null
		}
	}

	public applyCachedResource(entry: TEntry, cached: CachedMediaResource): void {
		entry.ossSrc = cached.url
		entry.ossSrcFromCachedFallback = true
		entry.sourceUrl = cached.sourceUrl ?? entry.sourceUrl
		entry.expiresAt = cached.expiresAt ?? entry.expiresAt
		entry.resourceVersion = cached.resourceVersion ?? entry.resourceVersion
		entry.sourceUpdatedAt = cached.sourceUpdatedAt ?? entry.sourceUpdatedAt
		entry.contentLength = cached.contentLength ?? entry.contentLength
	}

	public async resolveVirtualResourceFallbackOssSrc(
		path: string,
		ossSrc: string,
		entry: TEntry,
		retryCount: number,
	): Promise<string | null> {
		if (this.isDestroyed()) return null
		const offlineCache = this.options.canvas.mediaResourceOfflineCacheManager
		if (retryCount > 0 || !offlineCache.isVirtualResourceUrl(ossSrc)) {
			return null
		}

		offlineCache.recordVirtualResourceLoadFailure(ossSrc)
		if (entry.sourceUrl && !isOssExpired(entry.expiresAt)) {
			entry.ossSrc = entry.sourceUrl
			return entry.sourceUrl
		}

		entry.ossSrc = null
		entry.ossSrcFromCachedFallback = false
		entry.expiresAt = null
		return this.exchangeOssSrc(path, entry, {
			forceRefresh: true,
			bypassVirtualResource: true,
		})
	}

	public primeCache(
		path: string,
		entry: TEntry,
		fileInfo: Pick<
			GetFileInfoResponse,
			| "src"
			| "expires_at"
			| "fileName"
			| "source"
			| "resource_version"
			| "updated_at"
			| "content_length"
		>,
	): void {
		this.applyFileInfoMetadata(entry, {
			...fileInfo,
			fileName: fileInfo.fileName ?? "",
		})
		entry.ossSrc = fileInfo.src
		entry.ossSrcFromCachedFallback = false
		this.canonicalResourcePath(path)
	}

	private getResolveAbsolutePath(): ((path: string) => string) | undefined {
		return this.options.canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
	}

	private rememberPathAlias(rawPath: string, canonical: string): void {
		const weak = normalizePathLocal(rawPath)
		this.pathAliasToCanonical.set(weak, canonical)
		this.pathAliasToCanonical.set(canonical, canonical)
	}

	private isDestroyed(): boolean {
		if (!this.options.isDestroyed()) return false
		this.options.onStaleRequestDrop?.()
		return true
	}
}
