import type { ImageInfo } from "./ImageResourceManager"
import type { MediaDisplayResourceVariant } from "../visibility/CanvasMediaViewingPolicy"

export type PersistentImageDisplayVariant = Extract<MediaDisplayResourceVariant, "low">

export type PersistentImageDisplayRendition = string

export interface PersistentImageDisplayCacheRecord {
	key: string
	lookupKey: string
	scope: string
	path: string
	variant: PersistentImageDisplayVariant
	rendition: PersistentImageDisplayRendition
	blob: Blob
	mimeType: string
	width: number
	height: number
	byteSize: number
	imageInfo: ImageInfo
	resourceVersion: string
	sourceUpdatedAt: string | null
	contentLength: number | null
	sourceUrl: string | null
	maxEdge: number | null
	codecVersion: number
	writeOrder: string
	createdAt: number
	lastAccessAt: number
}

export interface PersistentImageDisplayCachePutOptions {
	scope: string
	path: string
	variant: PersistentImageDisplayVariant
	rendition: PersistentImageDisplayRendition
	blob: Blob
	width: number
	height: number
	imageInfo: ImageInfo
	resourceVersion: string | null
	sourceUpdatedAt: string | null
	contentLength: number | null
	sourceUrl: string | null
	maxEdge?: number
	writeOrder: string
}

export interface PersistentImageDisplayCacheGetOptions {
	scope: string
	path: string
	variant: PersistentImageDisplayVariant
	rendition: PersistentImageDisplayRendition
	/** 已知时只返回该资源版本；未知时允许返回最新可用版本作为 stale 占位。 */
	resourceVersion?: string | null
}

const DB_NAME = "canvas-design-image-display-variant-cache-v1"
const DB_VERSION = 3
const STORE_NAME = "resources"
const LOOKUP_INDEX = "lookupKey"
const LAST_ACCESS_INDEX = "lastAccessAt"
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024
const CODEC_VERSION = 3
const PRUNE_IDLE_DELAY_MS = 1000

interface PendingGetRequest {
	resolve: (record: PersistentImageDisplayCacheRecord | null) => void
	resourceVersion?: string | null
}

interface PersistentImageDisplayCacheTouch {
	key: string
	lastAccessAt: number
}

function isIndexedDbSupported(): boolean {
	return typeof indexedDB !== "undefined"
}

function normalizeKeyPart(value: string): string {
	return encodeURIComponent(value)
}

function createLookupKey(options: PersistentImageDisplayCacheGetOptions): string {
	return JSON.stringify([options.scope, options.rendition, options.path, options.variant])
}

function hasComparableVersion(
	record: Pick<PersistentImageDisplayCacheRecord, "resourceVersion">,
): boolean {
	return record.resourceVersion.trim().length > 0
}

function getRecordWriteOrder(record: PersistentImageDisplayCacheRecord): string {
	return record.writeOrder || String(record.createdAt).padStart(16, "0")
}

function compareSourceFreshness(
	left: Pick<PersistentImageDisplayCacheRecord, "sourceUpdatedAt">,
	right: Pick<PersistentImageDisplayCacheRecord, "sourceUpdatedAt">,
): number {
	if (!left.sourceUpdatedAt || !right.sourceUpdatedAt) return 0
	const leftTime = Date.parse(left.sourceUpdatedAt)
	const rightTime = Date.parse(right.sourceUpdatedAt)
	if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime) || leftTime === rightTime) {
		return 0
	}
	return leftTime > rightTime ? 1 : -1
}

export class ImageDisplayVariantPersistentCache {
	private dbPromise: Promise<IDBDatabase | null> | null = null
	private pendingGets = new Map<string, PendingGetRequest[]>()
	private getFlushScheduled = false
	private pruneTimerId: ReturnType<typeof setTimeout> | null = null
	private readonly maxBytes: number
	private readonly now: () => number

	constructor(options?: { maxBytes?: number; now?: () => number }) {
		this.maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
		this.now = options?.now ?? Date.now
	}

	public destroy(): void {
		if (this.pruneTimerId !== null) {
			clearTimeout(this.pruneTimerId)
			this.pruneTimerId = null
		}
		this.pendingGets.forEach((requests) => requests.forEach(({ resolve }) => resolve(null)))
		this.pendingGets.clear()
	}

	public async getLatest(
		options: PersistentImageDisplayCacheGetOptions,
	): Promise<PersistentImageDisplayCacheRecord | null> {
		const lookupKey = createLookupKey(options)
		return new Promise((resolve) => {
			const requests = this.pendingGets.get(lookupKey) ?? []
			requests.push({ resolve, resourceVersion: options.resourceVersion })
			this.pendingGets.set(lookupKey, requests)
			this.scheduleGetFlush()
		})
	}

	public async put(options: PersistentImageDisplayCachePutOptions): Promise<boolean> {
		if (!options.resourceVersion) return false
		const db = await this.getDb()
		if (!db) return false

		const lookupKey = createLookupKey(options)
		const createdAt = this.now()
		const key = [
			"canvas-display-image",
			`v${DB_VERSION}`,
			normalizeKeyPart(options.scope),
			normalizeKeyPart(options.rendition),
			normalizeKeyPart(options.path),
			options.variant,
			normalizeKeyPart(options.resourceVersion),
			options.maxEdge ?? "original",
			normalizeKeyPart(options.writeOrder),
			`codec${CODEC_VERSION}`,
		].join(":")
		const record: PersistentImageDisplayCacheRecord = {
			key,
			lookupKey,
			scope: options.scope,
			path: options.path,
			variant: options.variant,
			rendition: options.rendition,
			blob: options.blob,
			mimeType: options.blob.type || "image/webp",
			width: options.width,
			height: options.height,
			byteSize: options.blob.size,
			imageInfo: options.imageInfo,
			resourceVersion: options.resourceVersion,
			sourceUpdatedAt: options.sourceUpdatedAt,
			contentLength: options.contentLength,
			sourceUrl: options.sourceUrl,
			maxEdge: options.maxEdge ?? null,
			codecVersion: CODEC_VERSION,
			writeOrder: options.writeOrder,
			createdAt,
			lastAccessAt: createdAt,
		}

		const accepted = await this.putLatestRecord(db, record)
		if (accepted) this.schedulePrune()
		return accepted
	}

	public async removeByPath(scope: string, path: string, maxWriteOrder?: string): Promise<void> {
		const db = await this.getDb()
		if (!db) return
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const records = await this.readAllRecords(store)
		records.forEach((record) => {
			if (
				record.scope === scope &&
				record.path === path &&
				(!maxWriteOrder || getRecordWriteOrder(record) <= maxWriteOrder)
			) {
				store.delete(record.key)
			}
		})
		await this.awaitTransaction(tx)
	}

	public async removeVersion(
		scope: string,
		path: string,
		rendition: PersistentImageDisplayRendition,
		resourceVersion: string,
		maxWriteOrder?: string,
	): Promise<void> {
		const db = await this.getDb()
		if (!db) return
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const records = await this.readAllRecords(store)
		records.forEach((record) => {
			if (
				record.scope === scope &&
				record.path === path &&
				record.rendition === rendition &&
				record.resourceVersion === resourceVersion &&
				(!maxWriteOrder || getRecordWriteOrder(record) <= maxWriteOrder)
			) {
				store.delete(record.key)
			}
		})
		await this.awaitTransaction(tx)
	}

	public async removeWriteOrder(
		scope: string,
		path: string,
		rendition: PersistentImageDisplayRendition,
		resourceVersion: string,
		writeOrder: string,
	): Promise<void> {
		const db = await this.getDb()
		if (!db) return
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const records = await this.readAllRecords(store)
		records.forEach((record) => {
			if (
				record.scope === scope &&
				record.path === path &&
				record.rendition === rendition &&
				record.resourceVersion === resourceVersion &&
				record.writeOrder === writeOrder
			) {
				store.delete(record.key)
			}
		})
		await this.awaitTransaction(tx)
	}

	private scheduleGetFlush(): void {
		if (this.getFlushScheduled) return
		this.getFlushScheduled = true
		queueMicrotask(() => {
			this.getFlushScheduled = false
			void this.flushPendingGets()
		})
	}

	private async flushPendingGets(): Promise<void> {
		const pendingGets = this.pendingGets
		this.pendingGets = new Map()
		if (pendingGets.size === 0) return

		const db = await this.getDb()
		if (!db) {
			pendingGets.forEach((requests) => requests.forEach(({ resolve }) => resolve(null)))
			return
		}

		const lookupKeys = Array.from(pendingGets.keys())
		const recordsByLookupKey = await this.readRecordsByLookupKeys(db, lookupKeys)
		const touchesByKey = new Map<string, PersistentImageDisplayCacheTouch>()
		pendingGets.forEach((requests, lookupKey) => {
			const records = (recordsByLookupKey.get(lookupKey) ?? []).filter(hasComparableVersion)
			requests.forEach(({ resolve, resourceVersion }) => {
				const record =
					records
						.filter(
							(candidate) =>
								!resourceVersion || candidate.resourceVersion === resourceVersion,
						)
						.sort((a, b) =>
							getRecordWriteOrder(b).localeCompare(getRecordWriteOrder(a)),
						)[0] ?? null
				if (!record) {
					resolve(null)
					return
				}

				const lastAccessAt = this.now()
				touchesByKey.set(record.key, { key: record.key, lastAccessAt })
				resolve({ ...record, lastAccessAt })
			})
		})

		// 启动显示不应等待 lastAccessAt 写回；同批命中使用一个 readwrite transaction 更新。
		if (touchesByKey.size > 0) {
			void this.touchRecords(db, Array.from(touchesByKey.values()))
		}
	}

	private async getDb(): Promise<IDBDatabase | null> {
		if (!isIndexedDbSupported()) return null
		if (this.dbPromise) return this.dbPromise

		this.dbPromise = new Promise((resolve) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION)
			request.onupgradeneeded = (event) => {
				const db = request.result
				const store = db.objectStoreNames.contains(STORE_NAME)
					? request.transaction?.objectStore(STORE_NAME)
					: db.createObjectStore(STORE_NAME, { keyPath: "key" })
				if (!store) return
				if ((event as IDBVersionChangeEvent).oldVersion < DB_VERSION) {
					store.clear()
				}
				if (!store.indexNames.contains(LOOKUP_INDEX)) {
					store.createIndex(LOOKUP_INDEX, LOOKUP_INDEX, { unique: false })
				}
				if (!store.indexNames.contains(LAST_ACCESS_INDEX)) {
					store.createIndex(LAST_ACCESS_INDEX, LAST_ACCESS_INDEX, { unique: false })
				}
			}
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => resolve(null)
			request.onblocked = () => resolve(null)
		})
		return this.dbPromise
	}

	private readRecordsByLookupKeys(
		db: IDBDatabase,
		lookupKeys: string[],
	): Promise<Map<string, PersistentImageDisplayCacheRecord[]>> {
		const tx = db.transaction(STORE_NAME, "readonly")
		const index = tx.objectStore(STORE_NAME).index(LOOKUP_INDEX)
		const reads = lookupKeys.map(
			(lookupKey) =>
				new Promise<[string, PersistentImageDisplayCacheRecord[]]>((resolve) => {
					const request = index.getAll(lookupKey)
					request.onsuccess = () =>
						resolve([
							lookupKey,
							(request.result ?? []) as PersistentImageDisplayCacheRecord[],
						])
					request.onerror = () => resolve([lookupKey, []])
				}),
		)
		return Promise.all(reads).then((entries) => new Map(entries))
	}

	private putLatestRecord(
		db: IDBDatabase,
		current: PersistentImageDisplayCacheRecord,
	): Promise<boolean> {
		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite")
			const store = tx.objectStore(STORE_NAME)
			const request = store.index(LOOKUP_INDEX).getAll(current.lookupKey)
			let accepted = false
			request.onsuccess = () => {
				const records = (request.result ?? []) as PersistentImageDisplayCacheRecord[]
				const currentWriteOrder = getRecordWriteOrder(current)
				if (
					records.some((record) => compareSourceFreshness(record, current) > 0) ||
					records.some(
						(record) =>
							compareSourceFreshness(record, current) === 0 &&
							getRecordWriteOrder(record) > currentWriteOrder,
					)
				) {
					return
				}

				accepted = true
				store.put(current)
				const currentIsNewerThanAllExisting = records.every(
					(record) => compareSourceFreshness(current, record) > 0,
				)
				records.forEach((record) => {
					if (
						record.key !== current.key &&
						(currentIsNewerThanAllExisting ||
							getRecordWriteOrder(record) <= currentWriteOrder)
					) {
						store.delete(record.key)
					}
				})
			}
			tx.oncomplete = () => resolve(accepted)
			tx.onerror = () => resolve(false)
			tx.onabort = () => resolve(false)
		})
	}

	private schedulePrune(): void {
		if (this.pruneTimerId !== null) return
		this.pruneTimerId = setTimeout(() => {
			this.pruneTimerId = null
			void this.getDb()
				.then((db) => (db ? this.prune(db) : undefined))
				.catch(() => undefined)
		}, PRUNE_IDLE_DELAY_MS)
	}

	private touchRecords(
		db: IDBDatabase,
		touches: PersistentImageDisplayCacheTouch[],
	): Promise<void> {
		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite")
			const store = tx.objectStore(STORE_NAME)
			touches.forEach((accessUpdate) => {
				const request = store.get(accessUpdate.key)
				request.onsuccess = () => {
					const current = request.result as PersistentImageDisplayCacheRecord | undefined
					if (!current) return
					store.put({ ...current, lastAccessAt: accessUpdate.lastAccessAt })
				}
			})
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
			tx.onabort = () => resolve()
		})
	}

	private async prune(db: IDBDatabase): Promise<void> {
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const records = await this.readAllRecords(store)
		let totalBytes = records.reduce((sum, record) => sum + record.byteSize, 0)
		if (totalBytes <= this.maxBytes) {
			await this.awaitTransaction(tx)
			return
		}

		records.sort((a, b) => a.lastAccessAt - b.lastAccessAt)
		for (const record of records) {
			if (totalBytes <= this.maxBytes) break
			store.delete(record.key)
			totalBytes -= record.byteSize
		}
		await this.awaitTransaction(tx)
	}

	private readAllRecords(store: IDBObjectStore): Promise<PersistentImageDisplayCacheRecord[]> {
		return new Promise((resolve) => {
			const request = store.getAll()
			request.onsuccess = () =>
				resolve((request.result ?? []) as PersistentImageDisplayCacheRecord[])
			request.onerror = () => resolve([])
		})
	}

	private awaitTransaction(tx: IDBTransaction): Promise<void> {
		return new Promise((resolve) => {
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
			tx.onabort = () => resolve()
		})
	}
}
