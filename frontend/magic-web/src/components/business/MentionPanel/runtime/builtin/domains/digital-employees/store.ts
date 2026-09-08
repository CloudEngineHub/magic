import { makeAutoObservable } from "mobx"
import { SuperMagicApi } from "@/apis"
import type { SuperMagicAgentOrderItem } from "@/apis/modules/superMagic"
import { MentionItemType, type AgentMentionData, type MentionItem } from "../../../../types"

function mapDigitalEmployeeToMention(item: SuperMagicAgentOrderItem): MentionItem {
	const agentId = item.id.trim()
	const avatar = item.icon?.url?.trim() || ""

	return {
		id: agentId,
		type: MentionItemType.AGENT,
		name: item.name || agentId,
		icon: avatar,
		description: item.description,
		hasChildren: false,
		isFolder: false,
		data: {
			agent_id: agentId,
			agent_name: item.name || agentId,
			agent_avatar: avatar,
			agent_description: item.description,
			agent_source: "digital_employee",
		} satisfies AgentMentionData,
	}
}

function mergeDigitalEmployees(
	frequent: SuperMagicAgentOrderItem[],
	all: SuperMagicAgentOrderItem[],
) {
	const seenAgentIds = new Set<string>()

	return [...frequent, ...all].filter((item) => {
		const agentId = item.id.trim()
		if (!agentId || seenAgentIds.has(agentId)) return false

		seenAgentIds.add(agentId)
		return true
	})
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

		this.fetchPromise = SuperMagicApi.getAgentsList()
			.then((response) => {
				this.items = mergeDigitalEmployees(response.frequent ?? [], response.all ?? []).map(
					mapDigitalEmployeeToMention,
				)
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
