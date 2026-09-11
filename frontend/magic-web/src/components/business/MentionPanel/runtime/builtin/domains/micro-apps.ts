import { makeAutoObservable } from "mobx"
import { SuperMagicApi } from "@/apis"
import { MentionItemType, type MentionItem, type MicroAppMentionData } from "../../../types"

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
		if (typeof SuperMagicApi.getMicroApps !== "function") return
		this.loading = (async () => {
			try {
				const response = await SuperMagicApi.getMicroApps({
					page: 1,
					page_size: 100,
					scope: "all",
				})
				const list = Array.isArray(response?.list) ? response.list : []
				this.items = list
					.filter((item) => item.publish_status === "published")
					.map((item) => {
						const appId = String(item.app_id)
						return {
							id: appId,
							type: MentionItemType.MICRO_APP,
							name: item.app_name,
							icon: item.cover_url,
							hasChildren: false,
							isFolder: false,
							data: { app_id: appId, app_name: item.app_name } as MicroAppMentionData,
						}
					})
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
	searchItems(query: string, matchesQuery: (target: string, query: string) => boolean) {
		void this.fetchItems().catch(() => undefined)
		return this.items.filter((item) => matchesQuery(item.name, query))
	}
}
