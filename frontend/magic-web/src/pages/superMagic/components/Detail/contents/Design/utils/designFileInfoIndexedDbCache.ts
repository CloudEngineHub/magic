import Dexie, { type Table } from "dexie"
import type { GetFileInfoResponse } from "@/components/CanvasDesign/public/magic-types"

/**
 * Persist only path/resource metadata. Signed OSS URLs are short-lived and
 * belong to the shared in-memory URL cache, not the durable design cache.
 * `src` remains optional here so legacy IndexedDB rows can be sanitized on
 * their next read.
 */
export type DesignFileInfoPersisted = Omit<GetFileInfoResponse, "src"> & {
	src?: string
}

export interface DesignFileInfoIndexedDbEntry {
	cacheKey: string
	namespace: string
	normalizedPath: string
	fileInfo: DesignFileInfoPersisted
	previewWatermarkSignature: string
	cachedAt: number
	resolvedFileId?: string
	resolvedResourceVersion?: string
}

class DesignFileInfoCacheDatabase extends Dexie {
	entries!: Table<DesignFileInfoIndexedDbEntry, string>

	constructor() {
		super("MAGIC:supermagic-design:file-info-cache")
		this.version(1).stores({
			entries:
				"cacheKey, namespace, normalizedPath, attachmentsSnapshotKey, resolvedFileId, updatedAt, lastAccessedAt",
		})
		this.version(2).stores({
			entries:
				"cacheKey, namespace, normalizedPath, attachmentsSnapshotKey, resolvedFileId, updatedAt, lastAccessedAt",
		})
		this.version(3).stores({ entries: "cacheKey, namespace" })
		// Keep old values in place during schema migration. New writes omit the
		// legacy fields, while old entries are tolerated and can be removed by prune.
	}
}

let dbPromise: Promise<DesignFileInfoCacheDatabase> | null = null
const pendingWrites = new Set<Promise<unknown>>()
interface PendingRead {
	resolve: (entry: DesignFileInfoIndexedDbEntry | null) => void
	reject: (error: unknown) => void
}
const pendingReads = new Map<string, PendingRead[]>()
let pendingReadFlushScheduled = false
let pendingReadGeneration = 0
const MAX_PERSISTENT_ENTRIES = 4096
const PRUNE_TARGET_ENTRIES = 3072
const MAX_PERSISTENT_ENTRY_AGE_MS = 24 * 60 * 60 * 1000
const MAX_PERSISTENT_BYTES = 32 * 1024 * 1024
const MAX_PERSISTENT_ENTRY_BYTES = 64 * 1024
const PRUNE_IDLE_DELAY_MS = 1000
let pruneTimer: ReturnType<typeof setTimeout> | null = null
let pruneInFlight: Promise<void> | null = null
type PendingMutation = { kind: "put"; entry: DesignFileInfoIndexedDbEntry } | { kind: "delete" }
const pendingMutations = new Map<string, PendingMutation>()
const pendingMutationWaiters: Array<{
	resolve: () => void
	reject: (error: unknown) => void
}> = []
let pendingMutationFlushScheduled = false
let activeMutationFlush: Promise<void> | null = null
let mutationBatchCount = 0
let lastMutationPutCount = 0
let lastMutationDeleteCount = 0

export interface DesignFileInfoIndexedDbCacheDiagnostics {
	mutationBatchCount: number
	lastMutationPutCount: number
	lastMutationDeleteCount: number
}

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
	return new Promise((resolve, reject) => {
		const readers = pendingReads.get(cacheKey)
		if (readers) readers.push({ resolve, reject })
		else pendingReads.set(cacheKey, [{ resolve, reject }])
		if (pendingReadFlushScheduled) return
		pendingReadFlushScheduled = true
		queueMicrotask(() => {
			pendingReadFlushScheduled = false
			void flushPendingReads()
		})
	})
}

async function flushPendingReads(): Promise<void> {
	const batches = new Map(pendingReads)
	pendingReads.clear()
	if (batches.size === 0) return
	const generation = pendingReadGeneration
	try {
		const db = await getDatabase()
		const keys = [...batches.keys()]
		const entries = await db.entries.bulkGet(keys)
		if (generation !== pendingReadGeneration) {
			throw new Error("Design file info cache read cancelled")
		}
		entries.forEach((entry, index) => {
			batches.get(keys[index])?.forEach(({ resolve }) => resolve(entry ?? null))
		})
	} catch (error) {
		batches.forEach((readers) => readers.forEach(({ reject }) => reject(error)))
	}
}

function estimateEntryBytes(entry: DesignFileInfoIndexedDbEntry): number {
	try {
		return JSON.stringify(entry).length * 2
	} catch {
		return 0
	}
}

function stripSignedUrl(entry: DesignFileInfoIndexedDbEntry): DesignFileInfoIndexedDbEntry {
	if (entry.fileInfo.src === undefined) return entry
	const fileInfo = { ...entry.fileInfo }
	delete fileInfo.src
	return { ...entry, fileInfo }
}

function schedulePrune(): void {
	if (pruneTimer !== null || pruneInFlight !== null) return
	pruneTimer = setTimeout(() => {
		pruneTimer = null
		pruneInFlight = prunePersistentEntries().finally(() => {
			pruneInFlight = null
		})
	}, PRUNE_IDLE_DELAY_MS)
}

function cancelScheduledPrune(): void {
	if (pruneTimer === null) return
	clearTimeout(pruneTimer)
	pruneTimer = null
}

async function prunePersistentEntries(): Promise<void> {
	try {
		const db = await getDatabase()
		const count = await db.entries.count()
		if (count === 0) return
		const entries = await db.entries.toArray()
		const now = Date.now()
		const deleteKeys = new Set<string>()
		let totalBytes = 0

		entries.forEach((entry) => {
			const isTooOld =
				typeof entry.cachedAt !== "number" ||
				now - entry.cachedAt >= MAX_PERSISTENT_ENTRY_AGE_MS
			if (isTooOld) deleteKeys.add(entry.cacheKey)
			else {
				const entryBytes = estimateEntryBytes(entry)
				if (entryBytes > MAX_PERSISTENT_ENTRY_BYTES) deleteKeys.add(entry.cacheKey)
				else totalBytes += entryBytes
			}
		})

		const candidates = entries
			.filter((entry) => !deleteKeys.has(entry.cacheKey))
			.sort((left, right) => left.cachedAt - right.cachedAt)
		const needsCountPrune = count > MAX_PERSISTENT_ENTRIES
		let remainingCount = candidates.length
		for (const entry of candidates) {
			if (!needsCountPrune && totalBytes <= MAX_PERSISTENT_BYTES) break
			if (
				needsCountPrune &&
				remainingCount <= PRUNE_TARGET_ENTRIES &&
				totalBytes <= MAX_PERSISTENT_BYTES
			)
				break
			if (
				(needsCountPrune && remainingCount > PRUNE_TARGET_ENTRIES) ||
				totalBytes > MAX_PERSISTENT_BYTES
			) {
				deleteKeys.add(entry.cacheKey)
				remainingCount -= 1
				totalBytes -= estimateEntryBytes(entry)
			}
		}

		if (deleteKeys.size > 0) {
			await db.entries.bulkDelete([...deleteKeys])
		}
	} catch {
		// Cache pruning is best effort and must never affect Canvas resource loading.
	}
}

/** Flushes the best-effort prune for deterministic regression tests. */
export async function flushDesignFileInfoIndexedDbCachePruneForTests(): Promise<void> {
	cancelScheduledPrune()
	if (pruneInFlight) await pruneInFlight
	await prunePersistentEntries()
}

function schedulePendingMutationFlush(): void {
	if (pendingMutationFlushScheduled) return
	pendingMutationFlushScheduled = true
	queueMicrotask(() => {
		pendingMutationFlushScheduled = false
		void flushPendingMutations()
	})
}

function enqueueMutations(mutations: Map<string, PendingMutation>): Promise<void> {
	mutations.forEach((mutation, cacheKey) => {
		pendingMutations.set(cacheKey, mutation)
	})
	const promise = new Promise<void>((resolve, reject) => {
		pendingMutationWaiters.push({ resolve, reject })
	})
	schedulePendingMutationFlush()
	return promise
}

async function flushPendingMutations(): Promise<void> {
	const mutations = new Map(pendingMutations)
	pendingMutations.clear()
	if (mutations.size === 0) return

	const waiters = pendingMutationWaiters.splice(0)
	const promise = (async () => {
		const db = await getDatabase()
		const entriesToPut: DesignFileInfoIndexedDbEntry[] = []
		const keysToDelete: string[] = []
		mutations.forEach((mutation, cacheKey) => {
			if (mutation.kind === "put") entriesToPut.push(mutation.entry)
			else keysToDelete.push(cacheKey)
		})
		mutationBatchCount += 1
		lastMutationPutCount = entriesToPut.length
		lastMutationDeleteCount = keysToDelete.length
		await db.transaction("rw", db.entries, async () => {
			if (keysToDelete.length > 0) await db.entries.bulkDelete(keysToDelete)
			if (entriesToPut.length > 0) await db.entries.bulkPut(entriesToPut)
		})
		if (entriesToPut.length > 0) schedulePrune()
	})()
	activeMutationFlush = promise

	void trackWrite(promise)
		.then(
			() => waiters.forEach(({ resolve }) => resolve()),
			(error) => waiters.forEach(({ reject }) => reject(error)),
		)
		.finally(() => {
			if (activeMutationFlush === promise) activeMutationFlush = null
		})
}

async function flushPendingMutationQueue(): Promise<void> {
	while (pendingMutationFlushScheduled || pendingMutations.size > 0 || activeMutationFlush) {
		if (pendingMutationFlushScheduled || pendingMutations.size > 0) {
			await Promise.resolve()
			continue
		}
		await activeMutationFlush
	}
}

async function flushPendingWritesBeforeMutation(
	writesToWaitFor: Promise<unknown>[],
): Promise<void> {
	await flushPendingMutationQueue()
	if (writesToWaitFor.length > 0) await Promise.allSettled(writesToWaitFor)
	await flushPendingMutationQueue()
}

export function writeDesignFileInfoCacheEntries(
	entries: DesignFileInfoIndexedDbEntry[],
): Promise<void> {
	if (entries.length === 0) return Promise.resolve()
	const mutations = new Map<string, PendingMutation>()
	entries.forEach((entry) => {
		mutations.set(entry.cacheKey, { kind: "put", entry: stripSignedUrl(entry) })
	})
	return enqueueMutations(mutations)
}

export function deleteDesignFileInfoCacheEntries(cacheKeys: string[]): Promise<void> {
	if (cacheKeys.length === 0) return Promise.resolve()
	const mutations = new Map<string, PendingMutation>()
	cacheKeys.forEach((cacheKey) => mutations.set(cacheKey, { kind: "delete" }))
	return enqueueMutations(mutations)
}

export function deleteDesignFileInfoCacheNamespace(namespace: string): Promise<void> {
	const writesToWaitFor = [...pendingWrites]
	return trackWrite(
		(async () => {
			await flushPendingWritesBeforeMutation(writesToWaitFor)
			const db = await getDatabase()
			const keys = await db.entries.where("namespace").equals(namespace).primaryKeys()
			if (keys.length === 0) return
			await db.entries.bulkDelete(keys as string[])
		})(),
	)
}

export function clearDesignFileInfoIndexedDbCache(): Promise<void> {
	cancelScheduledPrune()
	const writesToWaitFor = [...pendingWrites]
	return trackWrite(
		(async () => {
			await flushPendingWritesBeforeMutation(writesToWaitFor)
			const db = await getDatabase()
			await db.entries.clear()
		})(),
	)
}

export async function flushDesignFileInfoIndexedDbCacheWrites(): Promise<void> {
	while (pendingMutationFlushScheduled || pendingMutations.size > 0 || pendingWrites.size > 0) {
		await flushPendingMutationQueue()
		const writes = [...pendingWrites]
		if (writes.length > 0) await Promise.allSettled(writes)
		else await Promise.resolve()
	}
}

export function cancelPendingDesignFileInfoCacheReads(): void {
	const error = new Error("Design file info cache read cancelled")
	pendingReadGeneration += 1
	pendingReads.forEach((readers) => readers.forEach(({ reject }) => reject(error)))
	pendingReads.clear()
}

export function getDesignFileInfoIndexedDbCacheDiagnosticsForTests(): DesignFileInfoIndexedDbCacheDiagnostics {
	return {
		mutationBatchCount,
		lastMutationPutCount,
		lastMutationDeleteCount,
	}
}
