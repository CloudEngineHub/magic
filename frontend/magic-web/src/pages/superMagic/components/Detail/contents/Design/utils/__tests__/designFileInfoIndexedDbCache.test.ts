import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	clearDesignFileInfoIndexedDbCache,
	deleteDesignFileInfoCacheEntries,
	flushDesignFileInfoIndexedDbCacheWrites,
	flushDesignFileInfoIndexedDbCachePruneForTests,
	getDesignFileInfoIndexedDbCacheDiagnosticsForTests,
	readDesignFileInfoCacheEntry,
	writeDesignFileInfoCacheEntries,
	type DesignFileInfoIndexedDbEntry,
} from "../designFileInfoIndexedDbCache"

function createEntry(index: number): DesignFileInfoIndexedDbEntry {
	const cacheKey = `project\0images/${index}.png\0raw`
	return {
		cacheKey,
		namespace: "project",
		normalizedPath: `images/${index}.png`,
		fileInfo: {
			src: `https://example.test/${index}.png`,
			fileName: `${index}.png`,
		},
		previewWatermarkSignature: "test",
		cachedAt: Date.now() + index,
	}
}

describe("designFileInfoIndexedDbCache mutation batching", () => {
	beforeEach(async () => {
		await clearDesignFileInfoIndexedDbCache()
		await flushDesignFileInfoIndexedDbCacheWrites()
	})

	afterEach(async () => {
		await flushDesignFileInfoIndexedDbCachePruneForTests()
	})

	it("coalesces same-tick writes and deletes into one transaction each", async () => {
		const entries = Array.from({ length: 100 }, (_, index) => createEntry(index))
		const beforeWrite = getDesignFileInfoIndexedDbCacheDiagnosticsForTests()

		await Promise.all(entries.map((entry) => writeDesignFileInfoCacheEntries([entry])))

		const afterWrite = getDesignFileInfoIndexedDbCacheDiagnosticsForTests()
		expect(afterWrite.mutationBatchCount - beforeWrite.mutationBatchCount).toBe(1)
		expect(afterWrite.lastMutationPutCount).toBe(100)
		expect(afterWrite.lastMutationDeleteCount).toBe(0)

		await Promise.all(
			entries.map((entry) => deleteDesignFileInfoCacheEntries([entry.cacheKey])),
		)

		const afterDelete = getDesignFileInfoIndexedDbCacheDiagnosticsForTests()
		expect(afterDelete.mutationBatchCount - afterWrite.mutationBatchCount).toBe(1)
		expect(afterDelete.lastMutationPutCount).toBe(0)
		expect(afterDelete.lastMutationDeleteCount).toBe(100)
	})

	it("preserves the last same-tick mutation for each cache key", async () => {
		const entry = createEntry(1)

		await Promise.all([
			writeDesignFileInfoCacheEntries([entry]),
			deleteDesignFileInfoCacheEntries([entry.cacheKey]),
		])
		await expect(readDesignFileInfoCacheEntry(entry.cacheKey)).resolves.toBeNull()

		await Promise.all([
			deleteDesignFileInfoCacheEntries([entry.cacheKey]),
			writeDesignFileInfoCacheEntries([entry]),
		])
		await expect(readDesignFileInfoCacheEntry(entry.cacheKey)).resolves.toMatchObject({
			cacheKey: entry.cacheKey,
			fileInfo: entry.fileInfo,
		})
	})

	it("waits for an active mutation before clearing the database", async () => {
		const entry = createEntry(2)
		const writePromise = writeDesignFileInfoCacheEntries([entry])
		await Promise.resolve()

		await Promise.all([writePromise, clearDesignFileInfoIndexedDbCache()])

		await expect(readDesignFileInfoCacheEntry(entry.cacheKey)).resolves.toBeNull()
	})

	it("reads are read-only and do not create another mutation batch", async () => {
		const entry = createEntry(3)
		await writeDesignFileInfoCacheEntries([entry])
		await flushDesignFileInfoIndexedDbCacheWrites()

		const beforeRead = getDesignFileInfoIndexedDbCacheDiagnosticsForTests()
		await expect(readDesignFileInfoCacheEntry(entry.cacheKey)).resolves.toMatchObject(entry)
		const persisted = await readDesignFileInfoCacheEntry(entry.cacheKey)
		expect(persisted).not.toHaveProperty("attachmentsSnapshotKey")
		expect(persisted).not.toHaveProperty("lastAccessedAt")
		expect(persisted).not.toHaveProperty("updatedAt")
		await flushDesignFileInfoIndexedDbCacheWrites()
		const afterRead = getDesignFileInfoIndexedDbCacheDiagnosticsForTests()

		expect(afterRead.mutationBatchCount).toBe(beforeRead.mutationBatchCount)
	})

	it("uses only cacheKey and namespace as IndexedDB indexes", async () => {
		await readDesignFileInfoCacheEntry("missing")
		const request = indexedDB.open("MAGIC:supermagic-design:file-info-cache")
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		const store = database.transaction("entries", "readonly").objectStore("entries")

		expect([...store.indexNames]).toEqual(["namespace"])
		expect(store.keyPath).toBe("cacheKey")
		database.close()
	})

	it("prunes expired entries asynchronously without affecting writes", async () => {
		const expired = createEntry(4)
		expired.cachedAt = Date.now() - 2 * 24 * 60 * 60 * 1000
		const fresh = createEntry(5)

		await writeDesignFileInfoCacheEntries([expired, fresh])
		await flushDesignFileInfoIndexedDbCacheWrites()
		await flushDesignFileInfoIndexedDbCachePruneForTests()

		await expect(readDesignFileInfoCacheEntry(expired.cacheKey)).resolves.toBeNull()
		await expect(readDesignFileInfoCacheEntry(fresh.cacheKey)).resolves.toMatchObject(fresh)
	})
})
