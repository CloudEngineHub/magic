import { makeAutoObservable } from "mobx"
import { SuperMagicApi } from "@/apis"
import type { MicroAppListItem } from "@/apis/modules/superMagic"
import { MentionItemType, type MentionItem, type MicroAppMentionData } from "../../../types"

const MENTION_PAGE_SIZE = 100

function listFromResponse(response: unknown): MicroAppListItem[] {
	if (!response || typeof response !== "object") return []
	const list = (response as { list?: unknown }).list
	return Array.isArray(list) ? (list as MicroAppListItem[]) : []
}

function toMentionItem(item: MicroAppListItem): MentionItem | null {
	if (item.publish_status !== "published") return null
	const appId = String(item.app_id ?? "")
	if (!appId) return null
	return {
		id: appId,
		type: MentionItemType.MICRO_APP,
		name: item.app_name,
		icon: item.cover_url,
		hasChildren: false,
		isFolder: false,
		data: { app_id: appId, app_name: item.app_name } as MicroAppMentionData,
	}
}

function mapMentionItems(response: unknown): MentionItem[] {
	const seen = new Set<string>()
	return listFromResponse(response)
		.map(toMentionItem)
		.filter((item): item is MentionItem => {
			if (!item || seen.has(item.id)) return false
			seen.add(item.id)
			return true
		})
}

export class MentionPanelMicroAppsStore {
	items: MentionItem[] = []
	private loaded = false
	private loading?: Promise<void>

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	async fetchItems() {
		if (this.loaded) return
		if (this.loading) return this.loading
		if (typeof SuperMagicApi?.getMentionMicroApps !== "function") return
		this.loading = (async () => {
			try {
				const response = await SuperMagicApi.getMentionMicroApps({
					page: 1,
					page_size: MENTION_PAGE_SIZE,
				})
				this.items = mapMentionItems(response)
				this.loaded = true
			} catch {
				this.items = []
			}
		})()
		try {
			await this.loading
		} finally {
			this.loading = undefined
		}
	}

	async getItems() {
		await this.fetchItems()
		return this.items
	}

	async searchItems(query: string, matchesQuery: (target: string, query: string) => boolean) {
		if (typeof SuperMagicApi?.getMentionMicroApps !== "function") {
			return this.items.filter((item) => matchesQuery(item.name, query))
		}
		try {
			const response = await SuperMagicApi.getMentionMicroApps({
				page: 1,
				page_size: MENTION_PAGE_SIZE,
				keyword: query,
			})
			return mapMentionItems(response).filter((item) => matchesQuery(item.name, query))
		} catch {
			await this.fetchItems().catch(() => undefined)
			return this.items.filter((item) => matchesQuery(item.name, query))
		}
	}
}
