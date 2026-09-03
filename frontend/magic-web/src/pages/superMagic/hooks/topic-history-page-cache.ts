import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"

export interface CachedTopicHistoryPage {
	pulledItems: RawSuperMagicMessageEnvelope[]
	statusItems: RawSuperMagicMessageEnvelope[]
	response?: {
		page_token?: string
		has_more?: boolean
		[key: string]: unknown
	}
}

/**
 * Small LRU for manual history pages. It prevents repeated scroll/retry requests from
 * retaining every historical page while keeping the active pagination path deterministic.
 */
export class TopicHistoryPageCache {
	private readonly pages = new Map<string, CachedTopicHistoryPage>()

	constructor(private readonly maxPages = 16) {}

	private getKey(topicId: string, pageToken: string, order: string, limit: number) {
		return `${topicId}\u0000${order}\u0000${limit}\u0000${pageToken}`
	}

	get(topicId: string, pageToken: string, order: string, limit: number) {
		const key = this.getKey(topicId, pageToken, order, limit)
		const page = this.pages.get(key)
		if (!page) return undefined
		this.pages.delete(key)
		this.pages.set(key, page)
		return page
	}

	set(
		topicId: string,
		pageToken: string,
		order: string,
		limit: number,
		page: CachedTopicHistoryPage,
	) {
		const key = this.getKey(topicId, pageToken, order, limit)
		this.pages.delete(key)
		this.pages.set(key, page)
		while (this.pages.size > this.maxPages) {
			const oldest = this.pages.keys().next().value
			if (!oldest) break
			this.pages.delete(oldest)
		}
	}

	clearTopic(topicId: string) {
		const prefix = `${topicId}\u0000`
		Array.from(this.pages.keys())
			.filter((key) => key.startsWith(prefix))
			.forEach((key) => this.pages.delete(key))
	}
}

export const topicHistoryPageCache = new TopicHistoryPageCache()
