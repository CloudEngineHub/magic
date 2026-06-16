import Dexie, { type Table } from "dexie"
import type { GetFileInfoResponse } from "@/components/CanvasDesign/types.magic"

export interface DesignFileInfoIndexedDbEntry {
	cacheKey: string
	namespace: string
	normalizedPath: string
	fileInfo: GetFileInfoResponse
	previewWatermarkSignature: string
	attachmentsSnapshotKey?: string
	cachedAt?: number
	resolvedFileId?: string
	updatedAt: number
	lastAccessedAt: number
}

class DesignFileInfoCacheDatabase extends Dexie {
	entries!: Table<DesignFileInfoIndexedDbEntry, string>

	constructor() {
		super("MAGIC:supermagic-design:file-info-cache")
		this.version(1).stores({
			entries:
				"cacheKey, namespace, normalizedPath, attachmentsSnapshotKey, resolvedFileId, updatedAt, lastAccessedAt",
		})
	}
}

let dbPromise: Promise<DesignFileInfoCacheDatabase> | null = null
const pendingWrites = new Set<Promise<unknown>>()

function canUseIndexedDb(): boolean {
	return typeof indexedDB !== "undefined"
}

async function getDatabase(): Promise<DesignFileInfoCacheDatabase> {
	if (!canUseIndexedDb()) {
		throw new Error("IndexedDB is unavailable")
	}
	if (dbPromise) return dbPromise
	dbPromise = (async () => {
		const db = new DesignFileInfoCacheDatabase()
		await db.open()
		return db
	})().catch((error) => {
		dbPromise = null
		throw error
	})
	return dbPromise
}

function trackWrite<T>(promise: Promise<T>): Promise<T> {
	pendingWrites.add(promise)
	promise.then(
		() => {
			pendingWrites.delete(promise)
		},
		() => {
			pendingWrites.delete(promise)
		},
	)
	return promise
}

export async function readDesignFileInfoCacheEntry(
	cacheKey: string,
): Promise<DesignFileInfoIndexedDbEntry | null> {
	const db = await getDatabase()
	const entry = await db.entries.get(cacheKey)
	if (!entry) return null
	const lastAccessedAt = Date.now()
	await db.entries.update(cacheKey, { lastAccessedAt }).catch(() => undefined)
	return {
		...entry,
		lastAccessedAt,
	}
}

export function writeDesignFileInfoCacheEntries(
	entries: DesignFileInfoIndexedDbEntry[],
): Promise<void> {
	if (entries.length === 0) return Promise.resolve()
	return trackWrite(
		(async () => {
			const db = await getDatabase()
			await db.entries.bulkPut(entries)
		})(),
	)
}

export function deleteDesignFileInfoCacheEntries(cacheKeys: string[]): Promise<void> {
	if (cacheKeys.length === 0) return Promise.resolve()
	return trackWrite(
		(async () => {
			const db = await getDatabase()
			await db.entries.bulkDelete(cacheKeys)
		})(),
	)
}

export function deleteDesignFileInfoCacheNamespace(namespace: string): Promise<void> {
	return trackWrite(
		(async () => {
			const db = await getDatabase()
			const keys = await db.entries.where("namespace").equals(namespace).primaryKeys()
			if (keys.length === 0) return
			await db.entries.bulkDelete(keys as string[])
		})(),
	)
}

export function clearDesignFileInfoIndexedDbCache(): Promise<void> {
	return trackWrite(
		(async () => {
			const db = await getDatabase()
			await db.entries.clear()
		})(),
	)
}

export async function flushDesignFileInfoIndexedDbCacheWrites(): Promise<void> {
	const writes: Promise<unknown>[] = []
	pendingWrites.forEach((write) => {
		writes.push(write)
	})
	await Promise.allSettled(writes)
}
