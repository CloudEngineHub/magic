import { makeAutoObservable } from "mobx"
import { SuperMagicApi } from "@/apis"
import type { CrewItemResponse } from "@/pages/superMagic/pages/Workspace/types"
import { MentionItemType, type AgentMentionData, type MentionItem } from "../../../../types"

function mapDigitalEmployeeToMention(item: CrewItemResponse): MentionItem {
	const agentId = item.mode.id.trim()
	const name = item.mode.name || agentId
	const description = item.mode.description || ""
	const avatar = item.mode.icon_url?.trim() || ""

	return {
		id: agentId,
		type: MentionItemType.AGENT,
		name,
		icon: avatar,
		description,
		hasChildren: false,
		isFolder: false,
		data: {
			agent_id: agentId,
			agent_name: name,
			agent_avatar: avatar,
			agent_description: description,
			agent_source: "digital_employee",
		} satisfies AgentMentionData,
	}
}

export class MentionPanelDigitalEmployeesStore {
	items: MentionItem[] = []

	private fetchPromise: Promise<MentionItem[]> | null = null

	private loaded = false

	constructor() {
		makeAutoObservable<MentionPanelDigitalEmployeesStore, "fetchPromise" | "loaded">(
			this,
			{ fetchPromise: false, loaded: false },
			{ autoBind: true },
		)
	}

	fetchItems({ force = false }: { force?: boolean } = {}) {
		if (!force && this.loaded) return Promise.resolve(this.items)
		if (this.fetchPromise) return this.fetchPromise

		this.fetchPromise = SuperMagicApi.getCrewList()
			.then((response) => {
				this.items = response.list
					.filter((item) => item.agent.is_visible !== false && item.mode.id?.trim())
					.map(mapDigitalEmployeeToMention)
				this.loaded = true
				return this.items
			})
			.finally(() => {
				this.fetchPromise = null
			})

		return this.fetchPromise
	}

	searchItems(normalizedQuery: string, matchesQuery: (target: string, query: string) => boolean) {
		return this.items.filter(
			(item) =>
				matchesQuery(item.name, normalizedQuery) ||
				matchesQuery(item.description ?? "", normalizedQuery),
		)
	}

	hasItem(agentId: string) {
		return this.items.some((item) => item.id === agentId)
	}
}
