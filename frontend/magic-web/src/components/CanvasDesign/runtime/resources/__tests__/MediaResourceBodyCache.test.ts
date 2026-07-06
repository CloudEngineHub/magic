import { describe, expect, it } from "vitest"
import {
	MediaResourceBodyCache,
	type MediaResourceBodyCacheEntry,
} from "../offline-cache/MediaResourceBodyCache"

function createEntry(
	overrides: Partial<MediaResourceBodyCacheEntry> = {},
): MediaResourceBodyCacheEntry {
	return {
		sourceUrl: null,
		resourceVersion: null,
		sourceUpdatedAt: null,
		contentLength: null,
		bodyPromise: null,
		bodyPromiseCacheKey: null,
		bodyBlob: null,
		bodyOssSrc: null,
		bodyCacheKey: null,
		bodyByteSize: 0,
		bodyLastAccessAt: 0,
		...overrides,
	}
}

function createBlob(size: number): Blob {
	return new Blob([new Uint8Array(size)])
}

describe("MediaResourceBodyCache", () => {
	it("builds cache keys from stable resource metadata before URL", () => {
		const cache = new MediaResourceBodyCache({ ttlMs: 1000, maxBytes: 1000 })
		const entry = createEntry({
			resourceVersion: "v1",
			sourceUpdatedAt: "updated",
			contentLength: 12,
			sourceUrl: "https://source.test/a.png",
		})

		expect(cache.getCacheKey("./a.png", "https://oss.test/a.png", entry)).toBe("./a.png::v1")

		entry.resourceVersion = null
		expect(cache.getCacheKey("./a.png", "https://oss.test/a.png", entry)).toBe(
			"./a.png::updated",
		)

		entry.sourceUpdatedAt = null
		expect(cache.getCacheKey("./a.png", "https://oss.test/a.png", entry)).toBe("./a.png::12")
	})

	it("returns cached body before ttl and clears expired body", () => {
		let now = 100
		const cache = new MediaResourceBodyCache({ ttlMs: 50, maxBytes: 1000, now: () => now })
		const entry = createEntry()
		const body = {
			blob: createBlob(10),
			ossSrc: "https://oss.test/a.png",
			cacheKey: "a::v1",
			byteSize: 10,
		}

		cache.storeBody(entry, body)
		expect(cache.getReusableBody(entry, "fallback", "a::v1")).toEqual(body)

		now = 200
		expect(cache.getReusableBody(entry, "fallback", "a::v1")).toBeNull()
		expect(cache.hasBody(entry)).toBe(false)
	})

	it("evicts least-recent bodies over budget while preserving the exempt entry", () => {
		const cache = new MediaResourceBodyCache({ ttlMs: 1000, maxBytes: 15 })
		const older = createEntry()
		const newer = createEntry()
		const exempt = createEntry()
		cache.storeBody(older, {
			blob: createBlob(10),
			ossSrc: "older",
			cacheKey: "older",
			byteSize: 10,
		})
		cache.storeBody(newer, {
			blob: createBlob(10),
			ossSrc: "newer",
			cacheKey: "newer",
			byteSize: 10,
		})
		cache.storeBody(exempt, {
			blob: createBlob(10),
			ossSrc: "exempt",
			cacheKey: "exempt",
			byteSize: 10,
		})
		older.bodyLastAccessAt = 1
		newer.bodyLastAccessAt = 2
		exempt.bodyLastAccessAt = 0

		cache.evictBudget([older, newer, exempt], exempt)

		expect(cache.hasBody(older)).toBe(false)
		expect(cache.hasBody(newer)).toBe(false)
		expect(cache.hasBody(exempt)).toBe(true)
		expect(cache.getSnapshot([older, newer, exempt])).toEqual({
			bodyCacheCount: 1,
			bodyCacheBytes: 10,
			bodyFetchInFlightCount: 0,
		})
	})
})
