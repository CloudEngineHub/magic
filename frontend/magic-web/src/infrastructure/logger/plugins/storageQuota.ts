import type { LoggerPlugin } from "../types"
import {
	STORAGE_QUOTA_EXCEEDED_ERROR_KIND,
	STORAGE_QUOTA_EXCEEDED_EVENT_KEY,
	claimStorageQuotaReport,
	isQuotaExceeded,
} from "../storageFailure"

export { isQuotaExceeded } from "../storageFailure"

/** Usage ratio that, together with the 1 GiB floor, marks a high-fill origin. */
const QUOTA_RATIO_THRESHOLD = 0.7
/** Minimum absolute usage required before a high ratio can trigger a report. */
const QUOTA_RATIO_MIN_USAGE_BYTES = 1 * 1024 ** 3
/** Absolute origin usage that reports even when the fill ratio is still low. */
const QUOTA_ABSOLUTE_USAGE_BYTES = 2 * 1024 ** 3
/** Wait this long after a refresh before taking the one-shot snapshot. */
const SNAPSHOT_DELAY_MS = 30 * 1000
/** Counts, bytes, and timings below this are noise and are omitted from cloud logs. */
const MIN_REPORTABLE_NUMBER = 50

export interface CacheBucketCount {
	name: string
	count: number
}

export interface IndexedDBStoreCount {
	storeName: string
	count: number
}

export interface IndexedDBDatabaseCount {
	dbName: string
	stores: IndexedDBStoreCount[]
}

export interface StorageQuotaSnapshot {
	usage: number
	quota: number
	ratio: number
	localStorageBytes: number
	sessionStorageBytes: number
	caches: CacheBucketCount[]
	indexedDB: IndexedDBDatabaseCount[]
	cacheCountDurationMs: number
	indexedDBCountDurationMs: number
}

/** Flattened IndexedDB row used in cloud logs after dropping tiny stores. */
export interface IndexedDBReportCount {
	dbName: string
	storeName: string
	count: number
}

/** Cloud payload for a high-quota snapshot; optional fields are omitted when empty or tiny. */
export interface StorageQuotaHighReportData {
	eventKey: "storage_quota_high"
	usage: string
	quota: string
	ratio: string
	localStorageBytes?: string
	sessionStorageBytes?: string
	caches?: CacheBucketCount[]
	indexedDB?: IndexedDBReportCount[]
	cacheCountDurationMs?: number
	indexedDBCountDurationMs?: number
}

/**
 * Estimate Web Storage size as UTF-16 bytes without enumerating names in the return value.
 * Browsers store DOMString as UTF-16, so (key + value) * 2 is the cheap local estimate.
 */
export function measureWebStorageBytes(
	storage: Storage | undefined,
	noteFault?: () => void,
): number {
	if (!storage) return 0
	try {
		let bytes = 0
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index)
			if (key == null) continue
			const value = storage.getItem(key) ?? ""
			bytes += (key.length + value.length) * 2
		}
		return bytes
	} catch {
		noteFault?.()
		return 0
	}
}

/** Count Cache Storage entries per bucket via cache.keys().length, never reading response bodies. */
export async function countAllCaches(noteFault?: () => void): Promise<CacheBucketCount[]> {
	try {
		if (typeof caches === "undefined") {
			noteFault?.()
			return []
		}
		const names = await caches.keys()
		const buckets: CacheBucketCount[] = []
		for (const name of names) {
			try {
				const cache = await caches.open(name)
				const keys = await cache.keys()
				buckets.push({ name, count: keys.length })
			} catch {
				noteFault?.()
			}
		}
		return buckets
	} catch {
		noteFault?.()
		return []
	}
}

/** Trim one-decimal numbers so 2.0G is written as 2G. */
function trimDecimal(value: number): string {
	const rounded = Math.round(value * 10) / 10
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Format byte counts for cloud logs using B/K/M/G instead of raw integers. */
export function formatByteSize(bytes: number): string {
	const size = Math.max(0, Number(bytes) || 0)
	if (size >= 1024 ** 3) return `${trimDecimal(size / 1024 ** 3)}G`
	if (size >= 1024 ** 2) return `${trimDecimal(size / 1024 ** 2)}M`
	if (size >= 1024) return `${trimDecimal(size / 1024)}K`
	return `${Math.round(size)}B`
}

/** Format a 0-1 ratio as a percent string, e.g. 0.8 → 80%. */
export function formatRatioPercent(ratio: number): string {
	const percent = Math.round((Number(ratio) || 0) * 1000) / 10
	return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
}

/** Resolve an IDBRequest-like object without throwing into the snapshot path. */
function awaitIdbRequest<T>(
	request: IDBRequest<T> | { result: T; onsuccess: unknown; onerror: unknown },
): Promise<T | undefined> {
	return new Promise((resolve) => {
		const idbRequest = request as IDBRequest<T>
		idbRequest.onsuccess = () => resolve(idbRequest.result)
		idbRequest.onerror = () => resolve(undefined)
	})
}

/** Placeholder used before an idle callback exists, and as a silent noteFault default. */
function noop(): void {
	return undefined
}

/** Open an existing database for counting; abort if the open would create or upgrade it. */
function openExistingDatabase(
	name: string,
	noteFault?: () => void,
): Promise<IDBDatabase | undefined> {
	return new Promise((resolve) => {
		let settled = false
		const finish = (database?: IDBDatabase) => {
			if (settled) return
			settled = true
			resolve(database)
		}
		try {
			const request = indexedDB.open(name)
			request.onblocked = () => {
				noteFault?.()
				finish(undefined)
			}
			request.onerror = () => {
				noteFault?.()
				finish(undefined)
			}
			request.onupgradeneeded = () => {
				// Counting must never create a database that disappeared between databases() and open().
				noteFault?.()
				try {
					request.transaction?.abort()
				} catch {
					/* Abort is best-effort; the settled flag still drops this database. */
				}
				finish(undefined)
			}
			request.onsuccess = () => {
				if (settled) {
					try {
						request.result.close()
					} catch {
						/* Ignore close failures after a skipped upgrade. */
					}
					return
				}
				finish(request.result)
			}
		} catch {
			noteFault?.()
			finish(undefined)
		}
	})
}

/** Read one object store's native count() without scanning values. Failure is not zero. */
async function countObjectStore(
	database: IDBDatabase,
	storeName: string,
	noteFault?: () => void,
): Promise<number | undefined> {
	try {
		const transaction = database.transaction(storeName, "readonly")
		const counted = await awaitIdbRequest(transaction.objectStore(storeName).count())
		const count = Number(counted)
		// Failed requests resolve as undefined; do not coerce that into a fake 0 count.
		if (counted === undefined || !Number.isFinite(count)) {
			noteFault?.()
			return undefined
		}
		return count
	} catch {
		noteFault?.()
		return undefined
	}
}

/**
 * Enumerate IndexedDB databases and native store counts.
 * databases() is required; without it we cannot discover names without creating new databases.
 */
export async function countIndexedDBRecords(
	noteFault?: () => void,
): Promise<IndexedDBDatabaseCount[]> {
	if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
		noteFault?.()
		return []
	}
	let infos: IDBDatabaseInfo[] = []
	try {
		infos = await indexedDB.databases()
	} catch {
		noteFault?.()
		return []
	}
	const databases: IndexedDBDatabaseCount[] = []
	for (const info of infos) {
		const dbName = info.name
		if (!dbName) continue
		const database = await openExistingDatabase(dbName, noteFault)
		if (!database) continue
		try {
			const stores: IndexedDBStoreCount[] = []
			for (const storeName of Array.from(database.objectStoreNames)) {
				const count = await countObjectStore(database, storeName, noteFault)
				if (count === undefined) continue
				stores.push({ storeName, count })
			}
			if (stores.length) databases.push({ dbName, stores })
		} catch {
			noteFault?.()
		} finally {
			try {
				database.close()
			} catch {
				/* Close is best-effort so a later database can still be counted. */
			}
		}
	}
	return databases
}

/** Read a Storage object; missing or blocked access is a capability fault, not a thrown error. */
function readWebStorage(getter: () => Storage, noteFault: () => void): Storage | undefined {
	try {
		return getter()
	} catch {
		noteFault()
		return undefined
	}
}

/** Collect one origin snapshot. estimate() is the only hard dependency; other sources degrade. */
export async function collectStorageSnapshot(
	noteFault: () => void = noop,
): Promise<StorageQuotaSnapshot | undefined> {
	const estimate = navigator.storage?.estimate
	if (typeof estimate !== "function") {
		noteFault()
		return undefined
	}
	let usage = 0
	let quota = 0
	try {
		const result = await estimate.call(navigator.storage)
		usage = Number(result.usage) || 0
		quota = Number(result.quota) || 0
	} catch {
		noteFault()
		return undefined
	}
	const localStorageBytes = measureWebStorageBytes(
		readWebStorage(() => localStorage, noteFault),
		noteFault,
	)
	const sessionStorageBytes = measureWebStorageBytes(
		readWebStorage(() => sessionStorage, noteFault),
		noteFault,
	)
	const cacheStartedAt = performance.now()
	const cacheBuckets = await countAllCaches(noteFault)
	const cacheCountDurationMs = Math.round(performance.now() - cacheStartedAt)
	const indexedDBStartedAt = performance.now()
	const indexedDBCounts = await countIndexedDBRecords(noteFault)
	const indexedDBCountDurationMs = Math.round(performance.now() - indexedDBStartedAt)
	return {
		usage,
		quota,
		ratio: quota > 0 ? usage / quota : 0,
		localStorageBytes,
		sessionStorageBytes,
		caches: cacheBuckets,
		indexedDB: indexedDBCounts,
		cacheCountDurationMs,
		indexedDBCountDurationMs,
	}
}

/**
 * Report when the origin is either very large, or already quite full at a meaningful size:
 * (ratio >= 70% and usage >= 1 GiB) OR usage >= 2 GiB.
 */
function isHighQuota(usage: number, quota: number): boolean {
	if (usage >= QUOTA_ABSOLUTE_USAGE_BYTES) return true
	if (quota <= 0) return false
	return usage / quota >= QUOTA_RATIO_THRESHOLD && usage >= QUOTA_RATIO_MIN_USAGE_BYTES
}

/** Schedule work on an idle slice, falling back to a zero-delay timeout when IdleCallback is missing. */
function scheduleIdle(run: () => void): () => void {
	if (typeof requestIdleCallback === "function") {
		const idleId = requestIdleCallback(() => run())
		return () => cancelIdleCallback(idleId)
	}
	const timer = setTimeout(run, 0)
	return () => clearTimeout(timer)
}

/** Keep a numeric log field only when it is large enough to be diagnostically useful. */
function isReportableNumber(value: number): boolean {
	return value >= MIN_REPORTABLE_NUMBER
}

/** Drop cache buckets whose entry count is too small to explain origin usage. */
function pickReportableCaches(caches: CacheBucketCount[]): CacheBucketCount[] {
	return caches.filter((bucket) => isReportableNumber(bucket.count))
}

/** Flatten IndexedDB counts and drop stores whose row count is too small to matter. */
function pickReportableIndexedDB(databases: IndexedDBDatabaseCount[]): IndexedDBReportCount[] {
	const rows: IndexedDBReportCount[] = []
	for (const database of databases) {
		for (const store of database.stores) {
			if (!isReportableNumber(store.count)) continue
			rows.push({
				dbName: database.dbName,
				storeName: store.storeName,
				count: store.count,
			})
		}
	}
	return rows
}

/**
 * Convert a raw snapshot into a compact cloud payload:
 * readable units, no counts/bytes/timings below 50, and no empty arrays.
 */
export function toReadableHighQuotaData(
	snapshot: StorageQuotaSnapshot,
): StorageQuotaHighReportData {
	const data: StorageQuotaHighReportData = {
		eventKey: "storage_quota_high",
		usage: formatByteSize(snapshot.usage),
		quota: formatByteSize(snapshot.quota),
		ratio: formatRatioPercent(snapshot.ratio),
	}
	if (isReportableNumber(snapshot.localStorageBytes)) {
		data.localStorageBytes = formatByteSize(snapshot.localStorageBytes)
	}
	if (isReportableNumber(snapshot.sessionStorageBytes)) {
		data.sessionStorageBytes = formatByteSize(snapshot.sessionStorageBytes)
	}
	const caches = pickReportableCaches(snapshot.caches)
	if (caches.length) data.caches = caches
	const indexedDB = pickReportableIndexedDB(snapshot.indexedDB)
	if (indexedDB.length) data.indexedDB = indexedDB
	if (isReportableNumber(snapshot.cacheCountDurationMs)) {
		data.cacheCountDurationMs = snapshot.cacheCountDurationMs
	}
	if (isReportableNumber(snapshot.indexedDBCountDurationMs)) {
		data.indexedDBCountDurationMs = snapshot.indexedDBCountDurationMs
	}
	return data
}

/** Listen for uncaught quota errors and take one delayed idle snapshot per page lifetime. */
export function createStorageQuotaPlugin(): LoggerPlugin {
	return {
		name: "storageQuota",
		scope: "page",
		setup({ logger, onDispose, signal, reportFault }) {
			const reportedThisPage = new Set<string>()
			let faultReported = false
			let cancelIdle = noop
			const noteFault = () => {
				if (faultReported) return
				faultReported = true
				reportFault()
			}
			const reportQuotaError = (error: unknown) => {
				if (!isQuotaExceeded(error)) return
				if (!claimStorageQuotaReport(STORAGE_QUOTA_EXCEEDED_EVENT_KEY, reportedThisPage))
					return
				logger.report({
					namespace: "storageQuota",
					data: {
						eventKey: STORAGE_QUOTA_EXCEEDED_EVENT_KEY,
						errorKind: STORAGE_QUOTA_EXCEEDED_ERROR_KIND,
					},
				})
			}
			const onWindowError = (event: ErrorEvent) => reportQuotaError(event.error)
			const onUnhandledRejection = (event: PromiseRejectionEvent) =>
				reportQuotaError(event.reason)
			const runSnapshot = async () => {
				if (signal.aborted) return
				const snapshot = await collectStorageSnapshot(noteFault)
				if (signal.aborted || !snapshot || !isHighQuota(snapshot.usage, snapshot.quota))
					return
				if (!claimStorageQuotaReport("storage_quota_high", reportedThisPage)) return
				logger.report({
					namespace: "storageQuota",
					data: toReadableHighQuotaData(snapshot),
				})
			}
			const delayTimer = setTimeout(() => {
				if (signal.aborted) return
				cancelIdle = scheduleIdle(() => {
					void runSnapshot()
				})
			}, SNAPSHOT_DELAY_MS)
			onDispose(() => {
				clearTimeout(delayTimer)
				cancelIdle()
				window.removeEventListener("error", onWindowError)
				window.removeEventListener("unhandledrejection", onUnhandledRejection)
			})
			window.addEventListener("error", onWindowError)
			window.addEventListener("unhandledrejection", onUnhandledRejection)
		},
	}
}
