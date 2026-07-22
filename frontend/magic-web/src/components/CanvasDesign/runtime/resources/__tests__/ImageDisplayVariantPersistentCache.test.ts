import { beforeEach, describe, expect, it, vi } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import {
	ImageDisplayVariantPersistentCache,
	type PersistentImageDisplayCacheRecord,
} from "../image/ImageDisplayVariantPersistentCache"

function createRecord(
	lookupKey: string,
	overrides: Partial<PersistentImageDisplayCacheRecord> = {},
): PersistentImageDisplayCacheRecord {
	return {
		key: `record:${lookupKey}`,
		lookupKey,
		scope: "scope-a",
		path: "images/a.png",
		variant: "low",
		rendition: "image-process",
		blob: new Blob(["low"], { type: "image/webp" }),
		mimeType: "image/webp",
		width: 384,
		height: 216,
		byteSize: 3,
		imageInfo: {
			naturalWidth: 1920,
			naturalHeight: 1080,
			fileSize: 3,
			mimeType: "image/png",
			filename: "a.png",
		},
		resourceVersion: "version-a",
		sourceUpdatedAt: null,
		contentLength: 3,
		sourceUrl: null,
		maxEdge: 384,
		codecVersion: 3,
		writeOrder: "0000000000000001:test:00000001",
		createdAt: 1,
		lastAccessAt: 1,
		...overrides,
	}
}

describe("ImageDisplayVariantPersistentCache", () => {
	beforeEach(() => {
		vi.stubGlobal("indexedDB", new IDBFactory())
	})

	it("coalesces same-tick low reads into one IndexedDB batch", async () => {
		const cache = new ImageDisplayVariantPersistentCache({ now: () => 10 })
		const internals = cache as unknown as {
			getDb: ReturnType<typeof vi.fn>
			readRecordsByLookupKeys: ReturnType<typeof vi.fn>
			touchRecords: ReturnType<typeof vi.fn>
		}
		internals.getDb = vi.fn(async () => ({}) as IDBDatabase)
		internals.readRecordsByLookupKeys = vi.fn(async (_db, lookupKeys: string[]) => {
			return new Map(lookupKeys.map((lookupKey) => [lookupKey, [createRecord(lookupKey)]]))
		})
		internals.touchRecords = vi.fn(async () => undefined)

		const results = await Promise.all(
			Array.from({ length: 100 }, (_, index) =>
				cache.getLatest({
					scope: "scope-a",
					path: `images/${index}.png`,
					variant: "low",
					rendition: "image-process",
				}),
			),
		)

		expect(results).toHaveLength(100)
		expect(internals.readRecordsByLookupKeys).toHaveBeenCalledTimes(1)
		expect(internals.readRecordsByLookupKeys.mock.calls[0]?.[1]).toHaveLength(100)
		expect(internals.touchRecords).toHaveBeenCalledTimes(1)
	})

	it("does not block low restore on the batched lastAccessAt update", async () => {
		const cache = new ImageDisplayVariantPersistentCache({ now: () => 20 })
		let resolvePut!: () => void
		const putPending = new Promise<void>((resolve) => {
			resolvePut = resolve
		})
		const internals = cache as unknown as {
			getDb: ReturnType<typeof vi.fn>
			readRecordsByLookupKeys: ReturnType<typeof vi.fn>
			touchRecords: ReturnType<typeof vi.fn>
		}
		internals.getDb = vi.fn(async () => ({}) as IDBDatabase)
		internals.readRecordsByLookupKeys = vi.fn(async (_db, lookupKeys: string[]) => {
			const lookupKey = lookupKeys[0] ?? ""
			return new Map([[lookupKey, [createRecord(lookupKey)]]])
		})
		internals.touchRecords = vi.fn(() => putPending)

		const record = await cache.getLatest({
			scope: "scope-a",
			path: "images/a.png",
			variant: "low",
			rendition: "image-process",
		})

		expect(record?.lastAccessAt).toBe(20)
		expect(internals.touchRecords).toHaveBeenCalledTimes(1)
		resolvePut()
		await putPending
	})

	it("coalesces low cache pruning after a write burst", async () => {
		vi.useFakeTimers()
		try {
			const cache = new ImageDisplayVariantPersistentCache()
			const internals = cache as unknown as {
				getDb: ReturnType<typeof vi.fn>
				putLatestRecord: ReturnType<typeof vi.fn>
				prune: ReturnType<typeof vi.fn>
			}
			internals.getDb = vi.fn(async () => ({}) as IDBDatabase)
			internals.putLatestRecord = vi.fn(async () => true)
			internals.prune = vi.fn(async () => undefined)
			const options = {
				scope: "scope-a",
				path: "images/a.png",
				variant: "low" as const,
				rendition: "image-process",
				blob: new Blob(["low"], { type: "image/webp" }),
				width: 384,
				height: 216,
				imageInfo: createRecord("unused").imageInfo,
				resourceVersion: "version-a",
				sourceUpdatedAt: null,
				contentLength: 3,
				sourceUrl: null,
				maxEdge: 384,
			}

			await Promise.all([
				cache.put({ ...options, writeOrder: "0000000000000001:test:00000001" }),
				cache.put({ ...options, writeOrder: "0000000000000002:test:00000002" }),
			])

			expect(internals.prune).not.toHaveBeenCalled()
			await vi.advanceTimersByTimeAsync(1000)
			expect(internals.prune).toHaveBeenCalledTimes(1)
		} finally {
			vi.useRealTimers()
		}
	})

	it("returns whether the low write was accepted", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const internals = cache as unknown as {
			getDb: ReturnType<typeof vi.fn>
			putLatestRecord: ReturnType<typeof vi.fn>
		}
		internals.getDb = vi.fn(async () => ({}) as IDBDatabase)
		internals.putLatestRecord = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
		const options = {
			scope: "scope-a",
			path: "images/a.png",
			variant: "low" as const,
			rendition: "image-process",
			blob: new Blob(["low"], { type: "image/webp" }),
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			resourceVersion: "version-a",
			sourceUpdatedAt: null,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
		}

		await expect(
			cache.put({ ...options, writeOrder: "0000000000000001:test:00000001" }),
		).resolves.toBe(true)
		await expect(
			cache.put({ ...options, writeOrder: "0000000000000000:test:00000000" }),
		).resolves.toBe(false)
	})

	it("keeps identical paths isolated by persistent resource scope", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const internals = cache as unknown as {
			getDb: ReturnType<typeof vi.fn>
			readRecordsByLookupKeys: ReturnType<typeof vi.fn>
			touchRecords: ReturnType<typeof vi.fn>
		}
		internals.getDb = vi.fn(async () => ({}) as IDBDatabase)
		internals.readRecordsByLookupKeys = vi.fn(async (_db, lookupKeys: string[]) => {
			return new Map(
				lookupKeys.map((lookupKey, index) => [
					lookupKey,
					[
						createRecord(lookupKey, {
							scope: index === 0 ? "scope-a" : "scope-b",
							resourceVersion: index === 0 ? "version-a" : "version-b",
						}),
					],
				]),
			)
		})
		internals.touchRecords = vi.fn(async () => undefined)

		const [recordA, recordB] = await Promise.all([
			cache.getLatest({
				scope: "scope-a",
				path: "images/shared.png",
				variant: "low",
				rendition: "image-process",
			}),
			cache.getLatest({
				scope: "scope-b",
				path: "images/shared.png",
				variant: "low",
				rendition: "image-process",
			}),
		])

		expect(recordA?.resourceVersion).toBe("version-a")
		expect(recordB?.resourceVersion).toBe("version-b")
	})

	it("returns only the requested version while preserving an older stale fallback", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const baseOptions = {
			scope: "scope-a",
			path: "images/versioned.png",
			variant: "low" as const,
			rendition: "image-process",
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			sourceUpdatedAt: null,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
		}

		await cache.put({
			...baseOptions,
			blob: new Blob(["v1"], { type: "image/webp" }),
			resourceVersion: "version-1",
			writeOrder: "0000000000000001:test:00000001",
		})

		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/versioned.png",
				variant: "low",
				rendition: "image-process",
				resourceVersion: "version-2",
			}),
		).resolves.toBeNull()
		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/versioned.png",
				variant: "low",
				rendition: "image-process",
			}),
		).resolves.toEqual(expect.objectContaining({ resourceVersion: "version-1" }))

		await cache.put({
			...baseOptions,
			blob: new Blob(["v2"], { type: "image/webp" }),
			resourceVersion: "version-2",
			writeOrder: "0000000000000002:test:00000002",
		})

		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/versioned.png",
				variant: "low",
				rendition: "image-process",
				resourceVersion: "version-2",
			}),
		).resolves.toEqual(expect.objectContaining({ resourceVersion: "version-2" }))
		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/versioned.png",
				variant: "low",
				rendition: "image-process",
				resourceVersion: "version-1",
			}),
		).resolves.toBeNull()
	})

	it("does not recreate a removed version when a delayed access touch runs", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		await cache.put({
			scope: "scope-a",
			path: "images/a.png",
			variant: "low",
			rendition: "image-process",
			blob: new Blob(["low"], { type: "image/webp" }),
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			resourceVersion: "version-a",
			sourceUpdatedAt: null,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
			writeOrder: "0000000000000001:test:00000001",
		})
		const internals = cache as unknown as {
			getDb: () => Promise<IDBDatabase | null>
			touchRecords: (
				db: IDBDatabase,
				touches: Array<{ key: string; lastAccessAt: number }>,
			) => Promise<void>
		}
		const db = await internals.getDb()
		if (!db) throw new Error("Expected IndexedDB")
		const key = [
			"canvas-display-image",
			"v3",
			encodeURIComponent("scope-a"),
			encodeURIComponent("image-process"),
			encodeURIComponent("images/a.png"),
			"low",
			encodeURIComponent("version-a"),
			384,
			encodeURIComponent("0000000000000001:test:00000001"),
			"codec3",
		].join(":")

		await cache.removeVersion("scope-a", "images/a.png", "image-process", "version-a")
		await internals.touchRecords(db, [{ key, lastAccessAt: 100 }])

		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/a.png",
				variant: "low",
				rendition: "image-process",
			}),
		).resolves.toBeNull()
	})

	it("keeps a newer write when an older generation finishes late", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const baseOptions = {
			scope: "scope-a",
			path: "images/race.png",
			variant: "low" as const,
			rendition: "image-process",
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			resourceVersion: "version-a",
			sourceUpdatedAt: null,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
		}

		await cache.put({
			...baseOptions,
			blob: new Blob(["new"], { type: "image/webp" }),
			writeOrder: "0000000000000002:test:00000002",
		})
		await cache.put({
			...baseOptions,
			blob: new Blob(["old"], { type: "image/webp" }),
			writeOrder: "0000000000000001:test:00000001",
		})

		const latest = await cache.getLatest({
			scope: "scope-a",
			path: "images/race.png",
			variant: "low",
			rendition: "image-process",
		})

		expect(latest?.writeOrder).toBe("0000000000000002:test:00000002")

		await cache.removeWriteOrder(
			"scope-a",
			"images/race.png",
			"image-process",
			"version-a",
			"0000000000000002:test:00000002",
		)
		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/race.png",
				variant: "low",
				rendition: "image-process",
			}),
		).resolves.toBeNull()
	})

	it("does not let an older source timestamp overwrite a newer resource version", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const baseOptions = {
			scope: "scope-a",
			path: "images/replaced.png",
			variant: "low" as const,
			rendition: "image-process",
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
		}

		await cache.put({
			...baseOptions,
			blob: new Blob(["new"], { type: "image/webp" }),
			resourceVersion: "version-2",
			sourceUpdatedAt: "2026-07-21T10:00:00.000Z",
			writeOrder: "0000000000000001:test:00000001",
		})
		await expect(
			cache.put({
				...baseOptions,
				blob: new Blob(["old"], { type: "image/webp" }),
				resourceVersion: "version-1",
				sourceUpdatedAt: "2026-07-21T09:00:00.000Z",
				writeOrder: "0000000000000002:test:00000002",
			}),
		).resolves.toBe(false)

		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/replaced.png",
				variant: "low",
				rendition: "image-process",
			}),
		).resolves.toEqual(expect.objectContaining({ resourceVersion: "version-2" }))
	})

	it("accepts a newer source timestamp even when its write order is lower", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const baseOptions = {
			scope: "scope-a",
			path: "images/delayed-new-version.png",
			variant: "low" as const,
			rendition: "image-process",
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
		}

		await cache.put({
			...baseOptions,
			blob: new Blob(["old"], { type: "image/webp" }),
			resourceVersion: "version-1",
			sourceUpdatedAt: "2026-07-21T09:00:00.000Z",
			writeOrder: "0000000000000002:test:00000002",
		})
		await expect(
			cache.put({
				...baseOptions,
				blob: new Blob(["new"], { type: "image/webp" }),
				resourceVersion: "version-2",
				sourceUpdatedAt: "2026-07-21T10:00:00.000Z",
				writeOrder: "0000000000000001:test:00000001",
			}),
		).resolves.toBe(true)

		await expect(
			cache.getLatest({
				scope: "scope-a",
				path: "images/delayed-new-version.png",
				variant: "low",
				rendition: "image-process",
			}),
		).resolves.toEqual(expect.objectContaining({ resourceVersion: "version-2" }))
	})

	it("does not delete a same-version write created after invalidation", async () => {
		const cache = new ImageDisplayVariantPersistentCache()
		const baseOptions = {
			scope: "scope-a",
			path: "images/race.png",
			variant: "low" as const,
			rendition: "image-process",
			width: 384,
			height: 216,
			imageInfo: createRecord("unused").imageInfo,
			resourceVersion: "version-a",
			sourceUpdatedAt: null,
			contentLength: 3,
			sourceUrl: null,
			maxEdge: 384,
		}

		await cache.put({
			...baseOptions,
			blob: new Blob(["old"], { type: "image/webp" }),
			writeOrder: "0000000000000001:test:00000001",
		})
		await cache.put({
			...baseOptions,
			blob: new Blob(["new"], { type: "image/webp" }),
			writeOrder: "0000000000000003:test:00000003",
		})
		await cache.removeVersion(
			"scope-a",
			"images/race.png",
			"image-process",
			"version-a",
			"0000000000000002:test:00000002",
		)

		const latest = await cache.getLatest({
			scope: "scope-a",
			path: "images/race.png",
			variant: "low",
			rendition: "image-process",
		})

		expect(latest?.writeOrder).toBe("0000000000000003:test:00000003")
	})
})
