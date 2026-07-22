import { SharedAbortableRequest } from "./SharedAbortableRequest"

export interface MediaResourceBody {
	blob: Blob
	ossSrc: string
	cacheKey: string
	byteSize: number
	/** 资源 URL/metadata 代际；用于阻止旧 body 在版本变化后继续进入 decode。 */
	resourceGeneration?: number
}

export interface MediaResourceBodyCacheEntry {
	sourceUrl: string | null
	resourceVersion: string | null
	sourceUpdatedAt: string | null
	contentLength: number | null
	bodyPromise: SharedAbortableRequest<MediaResourceBody | null> | null
	bodyPromiseCacheKey: string | null
	bodyBlob: Blob | null
	bodyOssSrc: string | null
	bodyCacheKey: string | null
	bodyByteSize: number
	bodyLastAccessAt: number
	bodyResourceGeneration?: number | null
}

export interface MediaResourceBodyCacheState {
	bodyBlob: Blob | null
	bodyOssSrc: string | null
	bodyCacheKey: string | null
	bodyByteSize: number
	bodyLastAccessAt: number
	bodyResourceGeneration?: number | null
}

export interface MediaResourceBodyCacheSnapshot {
	bodyCacheCount: number
	bodyCacheBytes: number
	bodyFetchInFlightCount: number
}

export interface MediaResourceBodyCacheOptions {
	ttlMs: number
	maxBytes: number
	now?: () => number
}

export class MediaResourceBodyCache<TEntry extends MediaResourceBodyCacheEntry> {
	private readonly inFlightRequests = new Set<SharedAbortableRequest<MediaResourceBody | null>>()
	private readonly now: () => number

	constructor(private readonly options: MediaResourceBodyCacheOptions) {
		this.now = options.now ?? Date.now
	}

	public getCacheKey(path: string, ossSrc: string, entry: TEntry): string {
		const version =
			entry.resourceVersion ??
			entry.sourceUpdatedAt ??
			(entry.contentLength ? String(entry.contentLength) : null) ??
			entry.sourceUrl ??
			ossSrc
		return `${path}::${version}`
	}

	public getCachedOssSrc(entry: TEntry): string | null {
		return entry.bodyBlob && entry.bodyOssSrc ? entry.bodyOssSrc : null
	}

	public hasBody(entry: TEntry): boolean {
		return !!entry.bodyBlob
	}

	public getReusableBody(
		entry: TEntry,
		ossSrc: string,
		cacheKey: string,
	): MediaResourceBody | null {
		if (!entry.bodyBlob || entry.bodyCacheKey !== cacheKey) return null

		if (this.now() - entry.bodyLastAccessAt > this.options.ttlMs) {
			this.clearBody(entry)
			return null
		}

		entry.bodyLastAccessAt = this.now()
		return {
			blob: entry.bodyBlob,
			ossSrc: entry.bodyOssSrc ?? ossSrc,
			cacheKey,
			byteSize: entry.bodyByteSize,
			...(typeof entry.bodyResourceGeneration === "number"
				? { resourceGeneration: entry.bodyResourceGeneration }
				: {}),
		}
	}

	public getInFlight(
		entry: TEntry,
		cacheKey: string,
	): SharedAbortableRequest<MediaResourceBody | null> | null {
		if (entry.bodyPromiseCacheKey !== cacheKey) return null
		if (entry.bodyPromise?.isAborted) return null
		return entry.bodyPromise
	}

	public setInFlight(
		entry: TEntry,
		cacheKey: string,
		request: SharedAbortableRequest<MediaResourceBody | null>,
	): void {
		entry.bodyPromise = request
		entry.bodyPromiseCacheKey = cacheKey
		this.inFlightRequests.add(request)
	}

	public clearInFlightIfCurrent(
		entry: TEntry,
		request: SharedAbortableRequest<MediaResourceBody | null>,
	): void {
		this.inFlightRequests.delete(request)
		if (entry.bodyPromise !== request) return
		entry.bodyPromise = null
		entry.bodyPromiseCacheKey = null
	}

	public storeBody(entry: TEntry, body: MediaResourceBody): void {
		entry.bodyBlob = body.blob
		entry.bodyOssSrc = body.ossSrc
		entry.bodyCacheKey = body.cacheKey
		entry.bodyByteSize = body.byteSize
		entry.bodyLastAccessAt = this.now()
		entry.bodyResourceGeneration = body.resourceGeneration ?? null
	}

	public clearBody(entry: TEntry): void {
		entry.bodyBlob = null
		entry.bodyOssSrc = null
		entry.bodyCacheKey = null
		entry.bodyByteSize = 0
		entry.bodyLastAccessAt = 0
		entry.bodyResourceGeneration = null
	}

	public clearBodyPromise(entry: TEntry): void {
		entry.bodyPromise?.abort()
		if (entry.bodyPromise) this.inFlightRequests.delete(entry.bodyPromise)
		entry.bodyPromise = null
		entry.bodyPromiseCacheKey = null
	}

	public clearEntry(entry: TEntry): void {
		this.clearBody(entry)
		this.clearBodyPromise(entry)
	}

	public evictBudget(entries: Iterable<TEntry>, exemptEntry?: TEntry): void {
		const cachedEntries: TEntry[] = []
		let totalBytes = 0
		for (const entry of entries) {
			if (!entry.bodyBlob) continue
			totalBytes += entry.bodyByteSize
			if (entry !== exemptEntry) cachedEntries.push(entry)
		}
		if (totalBytes <= this.options.maxBytes) return

		cachedEntries.sort((a, b) => a.bodyLastAccessAt - b.bodyLastAccessAt)
		for (const entry of cachedEntries) {
			if (totalBytes <= this.options.maxBytes) break
			totalBytes -= entry.bodyByteSize
			this.clearBody(entry)
		}
	}

	public getSnapshot(entries: Iterable<TEntry>): MediaResourceBodyCacheSnapshot {
		let bodyCacheCount = 0
		let bodyCacheBytes = 0
		let bodyFetchInFlightCount = 0
		for (const entry of entries) {
			if (entry.bodyBlob) {
				bodyCacheCount += 1
				bodyCacheBytes += entry.bodyByteSize
			}
			if (entry.bodyPromise) bodyFetchInFlightCount += 1
		}
		return { bodyCacheCount, bodyCacheBytes, bodyFetchInFlightCount }
	}

	public captureState(entry: TEntry): MediaResourceBodyCacheState {
		return {
			bodyBlob: entry.bodyBlob,
			bodyOssSrc: entry.bodyOssSrc,
			bodyCacheKey: entry.bodyCacheKey,
			bodyByteSize: entry.bodyByteSize,
			bodyLastAccessAt: entry.bodyLastAccessAt,
			bodyResourceGeneration: entry.bodyResourceGeneration ?? null,
		}
	}

	public restoreState(entry: TEntry, state: MediaResourceBodyCacheState): void {
		entry.bodyBlob = state.bodyBlob
		entry.bodyOssSrc = state.bodyOssSrc
		entry.bodyCacheKey = state.bodyCacheKey
		entry.bodyByteSize = state.bodyByteSize
		entry.bodyLastAccessAt = state.bodyLastAccessAt
		entry.bodyResourceGeneration = state.bodyResourceGeneration ?? null
	}

	public abortAll(): void {
		this.inFlightRequests.forEach((request) => request.abort())
		this.inFlightRequests.clear()
	}
}
