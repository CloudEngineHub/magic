// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Logger, LoggerPluginContext } from "@/infrastructure/logger/types"
import {
	createStorageQuotaPlugin,
	formatByteSize,
	formatRatioPercent,
	toReadableHighQuotaData,
} from "../storageQuota"

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
			request.onupgradeneeded?.()
			request.onsuccess?.({ target: request })
		} else request.onsuccess?.({ target: request })
	})
	return request
}

/** Install a fake indexedDB that enumerates named databases and store counts. */
function stubIndexedDB(databases: Array<{ name: string; stores: Record<string, number> }>) {
	const indexedDB = {
		databases: async () => databases.map((database) => ({ name: database.name, version: 1 })),
		open: (name: string) => {
			const database = databases.find((item) => item.name === name)
			const storeNames = Object.keys(database?.stores ?? {})
			const db = {
				objectStoreNames: storeNames,
				close: vi.fn(),
				transaction: (storeName: string) => ({
					objectStore: () => ({
						count: () => fireIdbRequest(database?.stores[storeName] ?? 0),
					}),
				}),
			}
			return fireIdbRequest(db)
		},
	}
	vi.stubGlobal("indexedDB", indexedDB)
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
