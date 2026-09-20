// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Logger, LoggerPluginContext } from "../types"
import {
	countAllCaches,
	countIndexedDBRecords,
	createStorageQuotaPlugin,
	formatByteSize,
	formatRatioPercent,
	isQuotaExceeded,
	measureWebStorageBytes,
	toReadableHighQuotaData,
} from "../plugins/storageQuota"

const ONE_GIB = 1024 ** 3
const TWO_GIB = 2 * 1024 ** 3
const REPORT_COOLDOWN_MS = 3 * 60 * 60 * 1000

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	localStorage.clear()
	sessionStorage.clear()
})

/** Build a Storage-like object from in-memory entries without touching real Web Storage. */
function createFakeStorage(entries: Record<string, string>): Storage {
	const keys = Object.keys(entries)
	return {
		get length() {
			return keys.length
		},
		key(index: number) {
			return keys[index] ?? null
		},
		getItem(key: string) {
			return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null
		},
		setItem() {
			return undefined
		},
		removeItem() {
			return undefined
		},
		clear() {
			return undefined
		},
	}
}

/** Fire an IDBRequest-style success/error/blocked/upgrade callback on a microtask. */
function fireIdbRequest<T>(
	result: T,
	mode: "success" | "error" | "blocked" | "upgrade" = "success",
) {
	const request: {
		result: T
		onsuccess: ((event: { target: unknown }) => void) | null
		onerror: (() => void) | null
		onblocked: (() => void) | null
		onupgradeneeded: (() => void) | null
		transaction?: { abort: () => void }
	} = {
		result,
		onsuccess: null,
		onerror: null,
		onblocked: null,
		onupgradeneeded: null,
		transaction: { abort: vi.fn() },
	}
	queueMicrotask(() => {
		if (mode === "blocked") request.onblocked?.()
		else if (mode === "error") request.onerror?.()
		else if (mode === "upgrade") {
			// Real IDB may still fire onsuccess after abort; exercise that close path.
			request.onupgradeneeded?.()
			request.onsuccess?.({ target: request })
		} else request.onsuccess?.({ target: request })
	})
	return request
}

/** Install a fake indexedDB that enumerates named databases and store counts. */
function stubIndexedDB(
	databases: Array<{ name: string; stores: Record<string, number> }>,
	options: {
		missingDatabasesApi?: boolean
		openMode?: "success" | "error" | "blocked" | "upgrade"
		countMode?: "success" | "error"
	} = {},
) {
	const abort = vi.fn()
	const close = vi.fn()
	const indexedDB = {
		databases: options.missingDatabasesApi
			? undefined
			: async () => databases.map((database) => ({ name: database.name, version: 1 })),
		open: (name: string) => {
			const database = databases.find((item) => item.name === name)
			const storeNames = Object.keys(database?.stores ?? {})
			const db = {
				objectStoreNames: storeNames,
				close,
				transaction: (storeName: string) => ({
					objectStore: () => ({
						count: () =>
							fireIdbRequest(
								database?.stores[storeName] ?? 0,
								options.countMode ?? "success",
							),
					}),
				}),
			}
			const request = fireIdbRequest(db, options.openMode)
			request.transaction = { abort }
			return request
		},
	}
	vi.stubGlobal("indexedDB", indexedDB)
	return { abort, close }
}

/** Install a fake Cache Storage whose keys() length matches the provided bucket sizes. */
function stubCaches(buckets: Record<string, number>) {
	vi.stubGlobal("caches", {
		keys: async () => Object.keys(buckets),
		open: async (name: string) => ({
			keys: async () =>
				Array.from(
					{ length: buckets[name] ?? 0 },
					() => new Request("https://example.test/item"),
				),
		}),
	})
}

/** Install navigator.storage.estimate with the given origin usage numbers. */
function stubEstimate(usage: number, quota: number) {
	vi.stubGlobal("navigator", {
		...navigator,
		storage: {
			estimate: async () => ({ usage, quota }),
		},
	})
}

/** Install the plugin with a fake logger so tests can inspect report/reportFault. */
function installPlugin() {
	const report = vi.fn()
	const reportFault = vi.fn()
	const disposers: Array<() => void> = []
	const controller = new AbortController()
	const logger = {
		report,
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		createLogger: vi.fn(),
	} as unknown as Logger
	const context: LoggerPluginContext = {
		logger,
		createLogger: logger.createLogger,
		signal: controller.signal,
		onDispose: (cleanup) => disposers.push(cleanup),
		reportFault,
		flushHidden: vi.fn(),
	}
	createStorageQuotaPlugin().setup(context)
	return {
		report,
		reportFault,
		dispose: () => {
			controller.abort()
			disposers.forEach((cleanup) => cleanup())
		},
	}
}

/** Drain the delayed idle snapshot, including nested idle timeouts created while ticking. */
async function flushSnapshot() {
	await vi.runAllTimersAsync()
}

describe("isQuotaExceeded", () => {
	it("recognizes QuotaExceededError by DOMException name", () => {
		expect(isQuotaExceeded(new DOMException("quota exceeded", "QuotaExceededError"))).toBe(true)
	})

	it("recognizes the legacy DOMException code 22", () => {
		expect(isQuotaExceeded({ name: "Error", code: 22 })).toBe(true)
	})

	it("recognizes Firefox NS_ERROR_DOM_QUOTA_REACHED", () => {
		expect(isQuotaExceeded({ name: "NS_ERROR_DOM_QUOTA_REACHED", code: 1014 })).toBe(true)
	})

	it("rejects unrelated errors and empty values", () => {
		expect(isQuotaExceeded(new TypeError("boom"))).toBe(false)
		expect(isQuotaExceeded(null)).toBe(false)
		expect(isQuotaExceeded("QuotaExceededError")).toBe(false)
	})
})

describe("measureWebStorageBytes", () => {
	it("sums UTF-16 bytes of keys and values", () => {
		const storage = createFakeStorage({ ab: "cd", e: "fgh" })
		// ("ab"+"cd")*2 + ("e"+"fgh")*2 = 8 + 8 = 16
		expect(measureWebStorageBytes(storage)).toBe(16)
	})

	it("returns 0 when storage access throws", () => {
		const storage = createFakeStorage({ ab: "cd" })
		vi.spyOn(storage, "key").mockImplementation(() => {
			throw new Error("storage denied")
		})
		expect(measureWebStorageBytes(storage)).toBe(0)
	})
})

describe("countAllCaches", () => {
	it("aggregates entry counts across cache buckets", async () => {
		stubCaches({ "bucket-alpha": 2, "bucket-beta": 3 })
		await expect(countAllCaches()).resolves.toEqual([
			{ name: "bucket-alpha", count: 2 },
			{ name: "bucket-beta", count: 3 },
		])
	})

	it("returns an empty array when Cache Storage enumeration fails", async () => {
		vi.stubGlobal("caches", {
			keys: async () => {
				throw new Error("caches denied")
			},
			open: async () => ({ keys: async () => [] }),
		})
		await expect(countAllCaches()).resolves.toEqual([])
	})
})

describe("countIndexedDBRecords", () => {
	it("aggregates native count() results per database and store", async () => {
		stubIndexedDB([
			{ name: "db-alpha", stores: { "store-records": 4, "store-meta": 1 } },
			{ name: "db-beta", stores: { "store-items": 7 } },
		])
		await expect(countIndexedDBRecords()).resolves.toEqual([
			{
				dbName: "db-alpha",
				stores: [
					{ storeName: "store-records", count: 4 },
					{ storeName: "store-meta", count: 1 },
				],
			},
			{ dbName: "db-beta", stores: [{ storeName: "store-items", count: 7 }] },
		])
	})

	it("skips a database when open fails or is blocked", async () => {
		stubIndexedDB([{ name: "db-blocked", stores: { "store-records": 3 } }], {
			openMode: "blocked",
		})
		await expect(countIndexedDBRecords()).resolves.toEqual([])
	})

	it("returns an empty array when databases() is unavailable", async () => {
		stubIndexedDB([{ name: "db-alpha", stores: { "store-records": 1 } }], {
			missingDatabasesApi: true,
		})
		await expect(countIndexedDBRecords()).resolves.toEqual([])
	})

	it("aborts an upgrade open and closes the result if onsuccess still fires", async () => {
		const { abort, close } = stubIndexedDB(
			[{ name: "db-ghost", stores: { "store-records": 3 } }],
			{ openMode: "upgrade" },
		)
		await expect(countIndexedDBRecords()).resolves.toEqual([])
		expect(abort).toHaveBeenCalledTimes(1)
		expect(close).toHaveBeenCalledTimes(1)
	})

	it("skips a store when count() fails instead of reporting 0", async () => {
		const noteFault = vi.fn()
		stubIndexedDB([{ name: "db-alpha", stores: { "store-records": 4 } }], {
			countMode: "error",
		})
		await expect(countIndexedDBRecords(noteFault)).resolves.toEqual([])
		expect(noteFault).toHaveBeenCalled()
	})
})

describe("formatByteSize and formatRatioPercent", () => {
	it("renders sizes as B/K/M/G and ratios as percents", () => {
		expect(formatByteSize(28)).toBe("28B")
		expect(formatByteSize(1536)).toBe("1.5K")
		expect(formatByteSize(2 * 1024 ** 2)).toBe("2M")
		expect(formatByteSize(ONE_GIB)).toBe("1G")
		expect(formatRatioPercent(0.8)).toBe("80%")
		expect(formatRatioPercent(0.705)).toBe("70.5%")
	})
})

describe("toReadableHighQuotaData", () => {
	it("omits counts, bytes, and timings below 50 and flattens remaining IndexedDB rows", () => {
		expect(
			toReadableHighQuotaData({
				usage: TWO_GIB,
				quota: TWO_GIB / 0.8,
				ratio: 0.8,
				localStorageBytes: 28,
				sessionStorageBytes: 18,
				caches: [
					{ name: "bucket-tiny", count: 49 },
					{ name: "bucket-alpha", count: 50 },
				],
				indexedDB: [
					{
						dbName: "db-alpha",
						stores: [
							{ storeName: "store-meta", count: 3 },
							{ storeName: "store-records", count: 80 },
						],
					},
					{ dbName: "db-beta", stores: [{ storeName: "store-items", count: 1 }] },
				],
				cacheCountDurationMs: 12,
				indexedDBCountDurationMs: 50,
			}),
		).toEqual({
			eventKey: "storage_quota_high",
			usage: "2G",
			quota: "2.5G",
			ratio: "80%",
			caches: [{ name: "bucket-alpha", count: 50 }],
			indexedDB: [{ dbName: "db-alpha", storeName: "store-records", count: 80 }],
			indexedDBCountDurationMs: 50,
		})
	})

	it("keeps only usage quota and ratio when every diagnostic number is below 50", () => {
		expect(
			toReadableHighQuotaData({
				usage: TWO_GIB,
				quota: TWO_GIB / 0.5,
				ratio: 0.5,
				localStorageBytes: 0,
				sessionStorageBytes: 0,
				caches: [{ name: "bucket-alpha", count: 2 }],
				indexedDB: [
					{ dbName: "db-alpha", stores: [{ storeName: "store-records", count: 3 }] },
				],
				cacheCountDurationMs: 0,
				indexedDBCountDurationMs: 0,
			}),
		).toEqual({
			eventKey: "storage_quota_high",
			usage: "2G",
			quota: "4G",
			ratio: "50%",
		})
	})
})

describe("createStorageQuotaPlugin", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		// jsdom's IdleCallback is not driven by fake timers; route it through setTimeout.
		vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) =>
			setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 0),
		)
		vi.stubGlobal("cancelIdleCallback", (idleId: number) => clearTimeout(idleId))
		stubCaches({ "bucket-alpha": 2 })
		stubIndexedDB([{ name: "db-alpha", stores: { "store-records": 3 } }])
		localStorage.setItem("pref-theme", "dark")
		sessionStorage.setItem("tmp-flag", "1")
	})

	it("reports storage_quota_high when ratio and absolute usage both exceed thresholds", async () => {
		const usage = TWO_GIB + 1
		const quota = usage / 0.8
		stubEstimate(usage, quota)
		const { report, dispose } = installPlugin()
		await flushSnapshot()
		expect(report).toHaveBeenCalledTimes(1)
		const payload = report.mock.calls[0][0]
		expect(payload).toEqual({
			namespace: "storageQuota",
			data: {
				eventKey: "storage_quota_high",
				usage: "2G",
				quota: "2.5G",
				ratio: "80%",
			},
		})
		expect(JSON.stringify(payload)).not.toContain("pref-theme")
		expect(JSON.stringify(payload)).not.toContain("tmp-flag")
		expect(JSON.stringify(payload)).not.toContain("bucket-alpha")
		expect(JSON.stringify(payload)).not.toContain("store-records")
		dispose()
	})

	it("includes cache and IndexedDB rows whose counts are at least 50", async () => {
		stubCaches({ "bucket-alpha": 50, "bucket-tiny": 2 })
		stubIndexedDB([
			{
				name: "db-alpha",
				stores: { "store-records": 80, "store-meta": 1 },
			},
		])
		stubEstimate(TWO_GIB + 1, (TWO_GIB + 1) / 0.8)
		const { report, dispose } = installPlugin()
		await flushSnapshot()
		expect(report.mock.calls[0][0].data).toMatchObject({
			eventKey: "storage_quota_high",
			caches: [{ name: "bucket-alpha", count: 50 }],
			indexedDB: [{ dbName: "db-alpha", storeName: "store-records", count: 80 }],
		})
		expect(JSON.stringify(report.mock.calls[0][0])).not.toContain("bucket-tiny")
		expect(JSON.stringify(report.mock.calls[0][0])).not.toContain("store-meta")
		dispose()
	})

	it("reports storage_quota_high when ratio is high and usage is at least 1 GiB", async () => {
		const usage = ONE_GIB
		const quota = usage / 0.8
		stubEstimate(usage, quota)
		const { report, dispose } = installPlugin()
		await flushSnapshot()
		expect(report).toHaveBeenCalledTimes(1)
		expect(report.mock.calls[0][0].data.eventKey).toBe("storage_quota_high")
		dispose()
	})

	it("reports storage_quota_high when usage reaches 2 GiB even if the ratio is low", async () => {
		stubEstimate(TWO_GIB, TWO_GIB / 0.5)
		const { report, dispose } = installPlugin()
		await flushSnapshot()
		expect(report).toHaveBeenCalledTimes(1)
		expect(report.mock.calls[0][0].data.eventKey).toBe("storage_quota_high")
		dispose()
	})

	it("does not report when the ratio is high but usage is under 1 GiB", async () => {
		const usage = ONE_GIB - 1
		stubEstimate(usage, usage / 0.9)
		const { report, dispose } = installPlugin()
		await flushSnapshot()
		expect(report).not.toHaveBeenCalled()
		dispose()
	})

	it("does not report when usage is between 1 GiB and 2 GiB but the ratio is low", async () => {
		const usage = ONE_GIB + 1
		stubEstimate(usage, usage / 0.5)
		const { report, dispose } = installPlugin()
		await flushSnapshot()
		expect(report).not.toHaveBeenCalled()
		dispose()
	})

	it("records a single capability fault and skips the cloud report when estimate is unavailable", async () => {
		vi.stubGlobal("navigator", { ...navigator, storage: {} })
		const { report, reportFault, dispose } = installPlugin()
		await flushSnapshot()
		expect(report).not.toHaveBeenCalled()
		expect(reportFault).toHaveBeenCalledTimes(1)
		dispose()
	})

	it("does not snapshot after dispose cancels the delayed idle callback", async () => {
		stubEstimate(TWO_GIB + 1, (TWO_GIB + 1) / 0.8)
		const { report, dispose } = installPlugin()
		dispose()
		await flushSnapshot()
		expect(report).not.toHaveBeenCalled()
	})

	it("reports storage_quota_high at most once per tab within 3 hours, then again after a later refresh", async () => {
		const usage = TWO_GIB + 1
		const quota = usage / 0.8
		stubEstimate(usage, quota)
		const first = installPlugin()
		await flushSnapshot()
		expect(first.report).toHaveBeenCalledTimes(1)
		first.dispose()

		const withinWindow = installPlugin()
		await flushSnapshot()
		expect(withinWindow.report).not.toHaveBeenCalled()
		withinWindow.dispose()

		vi.advanceTimersByTime(REPORT_COOLDOWN_MS)
		const afterCooldown = installPlugin()
		await flushSnapshot()
		expect(afterCooldown.report).toHaveBeenCalledTimes(1)
		afterCooldown.dispose()
	})

	it("reports quota exceeded once per page and not again until a refresh after 3 hours", () => {
		stubEstimate(1, 100)
		const quotaError = new DOMException("quota exceeded", "QuotaExceededError")
		const first = installPlugin()
		window.dispatchEvent(new ErrorEvent("error", { error: quotaError }))
		window.dispatchEvent(new ErrorEvent("error", { error: quotaError }))
		expect(first.report).toHaveBeenCalledTimes(1)
		expect(first.report.mock.calls[0][0]).toEqual({
			namespace: "storageQuota",
			data: {
				eventKey: "storage_quota_exceeded",
				errorKind: "quota",
			},
		})
		vi.advanceTimersByTime(REPORT_COOLDOWN_MS)
		window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: quotaError }))
		expect(first.report).toHaveBeenCalledTimes(1)
		first.dispose()

		const afterRefresh = installPlugin()
		window.dispatchEvent(new ErrorEvent("error", { error: quotaError }))
		expect(afterRefresh.report).toHaveBeenCalledTimes(1)
		afterRefresh.dispose()
	})

	it("does not re-report quota exceeded after a refresh inside 3 hours", () => {
		stubEstimate(1, 100)
		const quotaError = new DOMException("quota exceeded", "QuotaExceededError")
		const first = installPlugin()
		window.dispatchEvent(new ErrorEvent("error", { error: quotaError }))
		expect(first.report).toHaveBeenCalledTimes(1)
		first.dispose()

		const refreshInsideWindow = installPlugin()
		window.dispatchEvent(new ErrorEvent("error", { error: quotaError }))
		expect(refreshInsideWindow.report).not.toHaveBeenCalled()
		refreshInsideWindow.dispose()
	})
})
