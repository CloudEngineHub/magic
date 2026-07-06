import type { ImageInfo } from "./ImageResourceManager"
import type { MediaDisplayResourceVariant } from "../visibility/CanvasMediaViewingPolicy"

export type PersistentImageDisplayVariant = MediaDisplayResourceVariant

export interface PersistentImageDisplayCacheRecord {
	key: string
	lookupKey: string
	path: string
	variant: PersistentImageDisplayVariant
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
	createdAt: number
	lastAccessAt: number
}

export interface PersistentImageDisplayCachePutOptions {
	path: string
	variant: PersistentImageDisplayVariant
	blob: Blob
	width: number
	height: number
	imageInfo: ImageInfo
	resourceVersion: string | null
	sourceUpdatedAt: string | null
	contentLength: number | null
	sourceUrl: string | null
	maxEdge?: number
}

export interface PersistentImageDisplayCacheGetOptions {
	path: string
	variant: PersistentImageDisplayVariant
}

const DB_NAME = "canvas-design-image-display-variant-cache-v1"
const DB_VERSION = 1
const STORE_NAME = "resources"
const LOOKUP_INDEX = "lookupKey"
const LAST_ACCESS_INDEX = "lastAccessAt"
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024
const CODEC_VERSION = 1

function isIndexedDbSupported(): boolean {
	return typeof indexedDB !== "undefined"
}

function normalizeKeyPart(value: string): string {
	return encodeURIComponent(value)
}

function createLookupKey(path: string, variant: PersistentImageDisplayVariant): string {
	return `${path}::${variant}`
}

function hasComparableVersion(
	record: Pick<PersistentImageDisplayCacheRecord, "resourceVersion">,
): boolean {
	return record.resourceVersion.trim().length > 0
}

export class ImageDisplayVariantPersistentCache {
	private dbPromise: Promise<IDBDatabase | null> | null = null
	private readonly maxBytes: number
	private readonly now: () => number

	constructor(options?: { maxBytes?: number; now?: () => number }) {
		this.maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
		this.now = options?.now ?? Date.now
	}

	public async getLatest(
		options: PersistentImageDisplayCacheGetOptions,
	): Promise<PersistentImageDisplayCacheRecord | null> {
		const db = await this.getDb()
		if (!db) return null

		const lookupKey = createLookupKey(options.path, options.variant)
		const records = await this.readRecordsByLookupKey(db, lookupKey)
		const record =
			records
				.filter(hasComparableVersion)
				.sort((a, b) => b.lastAccessAt - a.lastAccessAt)[0] ?? null
		if (!record) return null

		const touched = { ...record, lastAccessAt: this.now() }
		await this.putRecord(db, touched)
		return touched
	}

	public async put(options: PersistentImageDisplayCachePutOptions): Promise<void> {
		if (!options.resourceVersion) return
		const db = await this.getDb()
		if (!db) return

		const lookupKey = createLookupKey(options.path, options.variant)
		const createdAt = this.now()
		const key = [
			"canvas-display-image",
			`v${DB_VERSION}`,
			normalizeKeyPart(options.path),
			options.variant,
			normalizeKeyPart(options.resourceVersion),
			options.maxEdge ?? "original",
			`codec${CODEC_VERSION}`,
		].join(":")
		const record: PersistentImageDisplayCacheRecord = {
			key,
			lookupKey,
			path: options.path,
			variant: options.variant,
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
			createdAt,
			lastAccessAt: createdAt,
		}

		await this.putRecord(db, record)
		await this.removeOlderLookupRecords(db, record)
		await this.prune(db)
	}

	public async removeByPath(path: string): Promise<void> {
		const db = await this.getDb()
		if (!db) return
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const records = await this.readAllRecords(store)
		records.forEach((record) => {
			if (record.path === path) {
				store.delete(record.key)
			}
		})
		await this.awaitTransaction(tx)
	}

	private async getDb(): Promise<IDBDatabase | null> {
		if (!isIndexedDbSupported()) return null
		if (this.dbPromise) return this.dbPromise

		this.dbPromise = new Promise((resolve) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION)
			request.onupgradeneeded = () => {
				const db = request.result
				const store = db.objectStoreNames.contains(STORE_NAME)
					? request.transaction?.objectStore(STORE_NAME)
					: db.createObjectStore(STORE_NAME, { keyPath: "key" })
				if (!store) return
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

	private readRecordsByLookupKey(
		db: IDBDatabase,
		lookupKey: string,
	): Promise<PersistentImageDisplayCacheRecord[]> {
		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readonly")
			const index = tx.objectStore(STORE_NAME).index(LOOKUP_INDEX)
			const request = index.getAll(lookupKey)
			request.onsuccess = () =>
				resolve((request.result ?? []) as PersistentImageDisplayCacheRecord[])
			request.onerror = () => resolve([])
		})
	}

	private putRecord(db: IDBDatabase, record: PersistentImageDisplayCacheRecord): Promise<void> {
		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite")
			tx.objectStore(STORE_NAME).put(record)
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
			tx.onabort = () => resolve()
		})
	}

	private async removeOlderLookupRecords(
		db: IDBDatabase,
		current: PersistentImageDisplayCacheRecord,
	): Promise<void> {
		const tx = db.transaction(STORE_NAME, "readwrite")
		const store = tx.objectStore(STORE_NAME)
		const records = await this.readRecordsByLookupKeyFromStore(store, current.lookupKey)
		records.forEach((record) => {
			if (record.key !== current.key) {
				store.delete(record.key)
			}
		})
		await this.awaitTransaction(tx)
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

	private readRecordsByLookupKeyFromStore(
		store: IDBObjectStore,
		lookupKey: string,
	): Promise<PersistentImageDisplayCacheRecord[]> {
		return new Promise((resolve) => {
			const request = store.index(LOOKUP_INDEX).getAll(lookupKey)
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
