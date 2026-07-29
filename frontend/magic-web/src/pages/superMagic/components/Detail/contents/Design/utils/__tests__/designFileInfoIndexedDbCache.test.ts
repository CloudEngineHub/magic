import { beforeEach, describe, expect, it } from "vitest"
import {
	clearDesignFileInfoIndexedDbCache,
	deleteDesignFileInfoCacheEntries,
	flushDesignFileInfoIndexedDbCacheWrites,
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
		updatedAt: index,
		lastAccessedAt: index,
	}
}

describe("designFileInfoIndexedDbCache mutation batching", () => {
	beforeEach(async () => {
		await clearDesignFileInfoIndexedDbCache()
		await flushDesignFileInfoIndexedDbCacheWrites()
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
})
