import {
	AssetsApi,
	type AssetItem,
	type AssetMediaType,
	type AssetOwnerItem,
	type AssetScope,
} from "@/apis"
import { getSharedMediaResourceScope } from "@/pages/superMagic/services/sharedMediaResourceScope"

export type AssetLibraryScope = Extract<AssetScope, "ALL" | "PERSONAL" | "TEAM">

export interface AssetLibraryQuery {
	mediaTypes: readonly AssetMediaType[]
	scope: AssetLibraryScope
	keyword: string
	ownerUid: string
	requiresCompliance: boolean
	page?: number
	pageSize?: number
}

export interface AssetLibraryQuerySnapshot {
	assets: AssetItem[]
	loading: boolean
	refreshing: boolean
	error: unknown | null
	updatedAt: number | null
}

interface NormalizedAssetLibraryQuery extends AssetLibraryQuery {
	mediaTypes: AssetMediaType[]
	page: number
	pageSize: number
}

interface AssetQueryCacheEntry {
	scope: string
	query: NormalizedAssetLibraryQuery
	snapshot: AssetLibraryQuerySnapshot
	pending: Promise<AssetItem[]> | null
	requestGeneration: number
}

interface OwnersCacheEntry {
	scope: string
	data: AssetOwnerItem[] | null
	pending: Promise<AssetOwnerItem[]> | null
}

interface AssetAgreementCache {
	signed: boolean | null
	pending: Promise<boolean> | null
}

export interface AssetMediaDimensions {
	width: number
	height: number
}

function isPositiveDimension(value: number): boolean {
	return Number.isFinite(value) && value > 0
}

const DEFAULT_MEDIA_TYPES: AssetMediaType[] = ["IMAGE"]
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 200

const EMPTY_QUERY_SNAPSHOT: AssetLibraryQuerySnapshot = {
	assets: [],
	loading: false,
	refreshing: false,
	error: null,
	updatedAt: null,
}

export function normalizeAssetLibraryQuery(query: AssetLibraryQuery): NormalizedAssetLibraryQuery {
	const mediaTypes = Array.from(new Set(query.mediaTypes))
	return {
		mediaTypes: mediaTypes.length > 0 ? mediaTypes : [...DEFAULT_MEDIA_TYPES],
		scope: query.scope,
		keyword: query.keyword.trim(),
		ownerUid: query.ownerUid.trim(),
		requiresCompliance: query.requiresCompliance,
		page: query.page ?? DEFAULT_PAGE,
		pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
	}
}

function getQueryKey(query: NormalizedAssetLibraryQuery, scope: string): string {
	return JSON.stringify([
		scope,
		query.scope,
		[...query.mediaTypes].sort(),
		query.keyword,
		query.ownerUid,
		query.requiresCompliance,
		query.page,
		query.pageSize,
	])
}

/**
 * Page-session cache for the asset picker.
 *
 * Signed file URLs are intentionally kept only in this in-memory cache. The
 * Canvas import path still refreshes the selected asset before downloading it.
 */
export class AssetLibrarySessionStore {
	private readonly assetQueryCache = new Map<string, AssetQueryCacheEntry>()
	private readonly ownersCache = new Map<string, OwnersCacheEntry>()
	private readonly listeners = new Set<() => void>()
	private agreementCache: AssetAgreementCache = { signed: null, pending: null }
	private readonly mediaDimensions = new Map<string, AssetMediaDimensions>()
	private activeScope = getSharedMediaResourceScope()

	public getQueryKey(query: AssetLibraryQuery, scope = getSharedMediaResourceScope()): string {
		return getQueryKey(normalizeAssetLibraryQuery(query), scope)
	}

	public getSnapshotByKey(
		queryKey: string,
		scope = getSharedMediaResourceScope(),
	): AssetLibraryQuerySnapshot {
		this.ensureScope(scope)
		return this.assetQueryCache.get(queryKey)?.snapshot ?? EMPTY_QUERY_SNAPSHOT
	}

	public getCachedAssets(
		query: AssetLibraryQuery,
		scope = getSharedMediaResourceScope(),
	): AssetItem[] | undefined {
		this.ensureScope(scope)
		const queryKey = this.getQueryKey(query, scope)
		const entry = this.assetQueryCache.get(queryKey)
		return entry?.snapshot.updatedAt === null ? undefined : entry?.snapshot.assets
	}

	public queryAssets(
		query: AssetLibraryQuery,
		scope = getSharedMediaResourceScope(),
	): Promise<AssetItem[]> {
		return this.loadAssets(query, scope, false)
	}

	public refreshAssets(
		query: AssetLibraryQuery,
		scope = getSharedMediaResourceScope(),
	): Promise<AssetItem[]> {
		return this.loadAssets(query, scope, true)
	}

	public getOwners(scope = getSharedMediaResourceScope()): Promise<AssetOwnerItem[]> {
		return this.loadOwners(scope, false)
	}

	public getCachedOwners(scope = getSharedMediaResourceScope()): AssetOwnerItem[] | undefined {
		this.ensureScope(scope)
		return this.ownersCache.get(scope)?.data ?? undefined
	}

	public refreshOwners(scope = getSharedMediaResourceScope()): Promise<AssetOwnerItem[]> {
		return this.loadOwners(scope, true)
	}

	/** 当前会话里已经确认的承诺书签署状态；未知时返回 undefined。 */
	public getCachedAssetAgreementSigned(
		scope = getSharedMediaResourceScope(),
	): boolean | undefined {
		this.ensureScope(scope)
		return this.agreementCache.signed ?? undefined
	}

	/**
	 * 查询承诺书是否已签署。同一会话内合并进行中的请求，已知结果直接复用。
	 * 请求失败不写入缓存，下次调用会重新查询。
	 */
	public getAssetAgreementSigned(scope = getSharedMediaResourceScope()): Promise<boolean> {
		this.ensureScope(scope)
		if (this.agreementCache.pending) return this.agreementCache.pending
		if (this.agreementCache.signed !== null) return Promise.resolve(this.agreementCache.signed)

		const request = AssetsApi.getAssetAgreementStatus?.()
		if (!request) return Promise.reject(new Error("Asset agreement status is unavailable"))

		const pending = request.then(
			(status) => {
				if (this.agreementCache.pending !== pending) return status.signed
				this.agreementCache.signed = status.signed
				this.agreementCache.pending = null
				this.notify()
				return status.signed
			},
			(error) => {
				if (this.agreementCache.pending === pending) this.agreementCache.pending = null
				throw error
			},
		)
		this.agreementCache.pending = pending
		return pending
	}

	/** 记住素材预览或导入时量到的原始宽高，供稍后创建画布元素复用。 */
	public rememberAssetMediaDimensions(
		assetId: string,
		dimensions: AssetMediaDimensions,
		scope = getSharedMediaResourceScope(),
	): void {
		this.ensureScope(scope)
		const normalizedAssetId = assetId.trim()
		if (!normalizedAssetId) return
		if (!isPositiveDimension(dimensions.width) || !isPositiveDimension(dimensions.height))
			return
		this.mediaDimensions.set(normalizedAssetId, {
			width: dimensions.width,
			height: dimensions.height,
		})
	}

	public getRememberedAssetMediaDimensions(
		assetId: string,
		scope = getSharedMediaResourceScope(),
	): AssetMediaDimensions | undefined {
		this.ensureScope(scope)
		return this.mediaDimensions.get(assetId.trim())
	}

	/** 用户在当前会话完成签署后，后续认证入口不再重复查询。 */
	public markAssetAgreementSigned(scope = getSharedMediaResourceScope()): void {
		this.ensureScope(scope)
		this.agreementCache = { signed: true, pending: null }
		this.notify()
	}

	/** Invalidate all list queries for the active user and organization. */
	public invalidateCurrentScope(scope = getSharedMediaResourceScope()): void {
		this.ensureScope(scope)
		for (const [queryKey, entry] of this.assetQueryCache) {
			// Remove pending entries too. Their callbacks validate the map entry and
			// therefore cannot repopulate a cache that has already been invalidated.
			if (entry.scope === scope) this.assetQueryCache.delete(queryKey)
		}
		this.notify()
	}

	/** Clear all in-memory data, used on logout and organization/account changes. */
	public clearAll(): void {
		this.assetQueryCache.clear()
		this.ownersCache.clear()
		this.agreementCache = { signed: null, pending: null }
		this.mediaDimensions.clear()
		this.notify()
	}

	public subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	private loadAssets(
		query: AssetLibraryQuery,
		scope: string,
		forceRefresh: boolean,
	): Promise<AssetItem[]> {
		this.ensureScope(scope)
		const normalizedQuery = normalizeAssetLibraryQuery(query)
		const queryKey = getQueryKey(normalizedQuery, scope)
		const existing = this.assetQueryCache.get(queryKey)

		if (existing?.pending) return existing.pending
		if (!forceRefresh && existing?.snapshot.updatedAt !== null && existing) {
			return Promise.resolve(existing.snapshot.assets)
		}

		const entry: AssetQueryCacheEntry = existing ?? {
			scope,
			query: normalizedQuery,
			snapshot: EMPTY_QUERY_SNAPSHOT,
			pending: null,
			requestGeneration: 0,
		}
		const requestGeneration = entry.requestGeneration + 1
		entry.requestGeneration = requestGeneration
		entry.snapshot = {
			assets: entry.snapshot.assets,
			loading: entry.snapshot.updatedAt === null,
			refreshing: entry.snapshot.updatedAt !== null,
			error: null,
			updatedAt: entry.snapshot.updatedAt,
		}
		this.assetQueryCache.set(queryKey, entry)
		this.notify()

		const pending = this.fetchAssets(normalizedQuery)
		entry.pending = pending
		pending.then(
			(assets) => {
				if (!this.isCurrentAssetRequest(queryKey, entry, requestGeneration)) return
				entry.snapshot = {
					assets,
					loading: false,
					refreshing: false,
					error: null,
					updatedAt: Date.now(),
				}
				entry.pending = null
				this.notify()
			},
			(error) => {
				if (!this.isCurrentAssetRequest(queryKey, entry, requestGeneration)) return
				entry.snapshot = {
					assets: entry.snapshot.assets,
					loading: false,
					refreshing: false,
					error: error,
					updatedAt: entry.snapshot.updatedAt,
				}
				entry.pending = null
				this.notify()
			},
		)
		return pending
	}

	private async fetchAssets(query: NormalizedAssetLibraryQuery): Promise<AssetItem[]> {
		const responses = await Promise.all(
			query.mediaTypes.map((mediaType) =>
				AssetsApi.queryAssets({
					scope: query.scope,
					asset_kind: "ASSET",
					asset_media_type: mediaType,
					compliance_status: query.requiresCompliance ? "PASS" : undefined,
					keyword: query.keyword || undefined,
					owner_uids: query.ownerUid ? [query.ownerUid] : undefined,
					page: query.page,
					page_size: query.pageSize,
				}),
			),
		)
		const seenAssetIds = new Set<string>()
		return responses.flatMap((response) =>
			response.list.filter((asset) => {
				if (seenAssetIds.has(asset.asset_id)) return false
				seenAssetIds.add(asset.asset_id)
				return true
			}),
		)
	}

	private loadOwners(scope: string, forceRefresh: boolean): Promise<AssetOwnerItem[]> {
		this.ensureScope(scope)
		const existing = this.ownersCache.get(scope)
		if (existing?.pending) return existing.pending
		if (!forceRefresh && existing?.data) return Promise.resolve(existing.data)

		const entry: OwnersCacheEntry = existing ?? {
			scope,
			data: null,
			pending: null,
		}
		const pending = AssetsApi.getAssetOwners()
		entry.pending = pending
		this.ownersCache.set(scope, entry)
		pending.then(
			(data) => {
				if (this.ownersCache.get(scope) !== entry) return
				entry.data = data
				entry.pending = null
				this.notify()
			},
			() => {
				if (this.ownersCache.get(scope) !== entry) return
				entry.pending = null
				this.notify()
			},
		)
		return pending
	}

	private isCurrentAssetRequest(
		queryKey: string,
		entry: AssetQueryCacheEntry,
		requestGeneration: number,
	): boolean {
		return (
			this.assetQueryCache.get(queryKey) === entry &&
			entry.requestGeneration === requestGeneration &&
			entry.scope === this.activeScope
		)
	}

	private ensureScope(scope: string): void {
		if (scope === this.activeScope) return
		this.activeScope = scope
		this.assetQueryCache.clear()
		this.ownersCache.clear()
		this.agreementCache = { signed: null, pending: null }
		this.mediaDimensions.clear()
	}

	private notify(): void {
		this.listeners.forEach((listener) => listener())
	}
}

export const assetLibrarySessionStore = new AssetLibrarySessionStore()
