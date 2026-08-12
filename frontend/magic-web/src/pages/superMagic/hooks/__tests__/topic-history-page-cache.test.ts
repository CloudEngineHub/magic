import { describe, expect, it } from "vitest"
import { TopicHistoryPageCache } from "../topic-history-page-cache"

function page(id: string) {
	return {
		pulledItems: [{ id }] as never[],
		statusItems: [{ id }] as never[],
		response: { page_token: id, has_more: true },
	}
}

describe("TopicHistoryPageCache", () => {
	it("keeps a bounded LRU and refreshes recency on read", () => {
		const cache = new TopicHistoryPageCache(2)
		cache.set("topic", "a", "desc", 100, page("a"))
		cache.set("topic", "b", "desc", 100, page("b"))
		expect(cache.get("topic", "a", "desc", 100)).toBeDefined()

		cache.set("topic", "c", "desc", 100, page("c"))

		expect(cache.get("topic", "a", "desc", 100)).toBeDefined()
		expect(cache.get("topic", "b", "desc", 100)).toBeUndefined()
		expect(cache.get("topic", "c", "desc", 100)).toBeDefined()
	})

	it("clears only pages owned by the disposed Topic", () => {
		const cache = new TopicHistoryPageCache(4)
		cache.set("topic-a", "", "desc", 100, page("a"))
		cache.set("topic-b", "", "desc", 100, page("b"))

		cache.clearTopic("topic-a")

		expect(cache.get("topic-a", "", "desc", 100)).toBeUndefined()
		expect(cache.get("topic-b", "", "desc", 100)).toBeDefined()
	})
})
