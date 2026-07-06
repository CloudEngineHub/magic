export interface MediaResourceBody {
	blob: Blob
	ossSrc: string
	cacheKey: string
	byteSize: number
}

export interface MediaResourceBodyCacheEntry {
	sourceUrl: string | null
	resourceVersion: string | null
	sourceUpdatedAt: string | null
	contentLength: number | null
	bodyPromise: Promise<MediaResourceBody | null> | null
	bodyPromiseCacheKey: string | null
	bodyBlob: Blob | null
	bodyOssSrc: string | null
	bodyCacheKey: string | null
	bodyByteSize: number
	bodyLastAccessAt: number
}

export interface MediaResourceBodyCacheState {
	bodyBlob: Blob | null
	bodyOssSrc: string | null
	bodyCacheKey: string | null
	bodyByteSize: number
	bodyLastAccessAt: number
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
	private readonly abortControllers = new Set<AbortController>()
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
		}
	}

	public getInFlight(entry: TEntry, cacheKey: string): Promise<MediaResourceBody | null> | null {
		if (entry.bodyPromiseCacheKey !== cacheKey) return null
		return entry.bodyPromise
	}

	public setInFlight(
		entry: TEntry,
		cacheKey: string,
		promise: Promise<MediaResourceBody | null>,
	): void {
		entry.bodyPromise = promise
		entry.bodyPromiseCacheKey = cacheKey
	}

	public clearInFlightIfCurrent(entry: TEntry, promise: Promise<MediaResourceBody | null>): void {
		if (entry.bodyPromise !== promise) return
		this.clearBodyPromise(entry)
	}

	public storeBody(entry: TEntry, body: MediaResourceBody): void {
		entry.bodyBlob = body.blob
		entry.bodyOssSrc = body.ossSrc
		entry.bodyCacheKey = body.cacheKey
		entry.bodyByteSize = body.byteSize
		entry.bodyLastAccessAt = this.now()
	}

	public clearBody(entry: TEntry): void {
		entry.bodyBlob = null
		entry.bodyOssSrc = null
		entry.bodyCacheKey = null
		entry.bodyByteSize = 0
		entry.bodyLastAccessAt = 0
	}

	public clearBodyPromise(entry: TEntry): void {
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
		}
	}

	public restoreState(entry: TEntry, state: MediaResourceBodyCacheState): void {
		entry.bodyBlob = state.bodyBlob
		entry.bodyOssSrc = state.bodyOssSrc
		entry.bodyCacheKey = state.bodyCacheKey
		entry.bodyByteSize = state.bodyByteSize
		entry.bodyLastAccessAt = state.bodyLastAccessAt
	}

	public createAbortController(): AbortController {
		const controller = new AbortController()
		this.abortControllers.add(controller)
		return controller
	}

	public releaseAbortController(controller: AbortController): void {
		this.abortControllers.delete(controller)
	}

	public abortAll(): void {
		this.abortControllers.forEach((controller) => {
			controller.abort()
		})
		this.abortControllers.clear()
	}
}
