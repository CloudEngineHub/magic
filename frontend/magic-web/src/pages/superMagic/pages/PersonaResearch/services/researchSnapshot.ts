import { SuperMagicApi } from "@/apis"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"

/** An incomplete page or a changing total is not permission to delete an unknown remainder. */
export async function loadAllResearchTopics(projectId: string): Promise<Topic[]> {
	const result: Topic[] = []
	const seen = new Set<string>()
	let expectedTotal: number | undefined
	for (let page = 1; ; page += 1) {
		const response = await SuperMagicApi.getTopicsByProjectId({
			id: projectId,
			page,
			page_size: 100,
		})
		if (
			!Array.isArray(response?.list) ||
			!Number.isSafeInteger(response.total) ||
			response.total < 0
		)
			throw new Error("research_topic_page_invalid")
		if (expectedTotal !== undefined && response.total !== expectedTotal)
			throw new Error("research_topic_pages_changed")
		expectedTotal = response.total
		for (const topic of response.list) {
			if (!topic.id || seen.has(String(topic.id)))
				throw new Error("research_topic_page_repeated")
			seen.add(String(topic.id))
			result.push(topic)
		}
		if (result.length === expectedTotal) return result
		if (!response.list.length || result.length > expectedTotal)
			throw new Error("research_topic_pages_incomplete")
	}
}

/** Paging drift must not turn a normal page visit into a new hard failure. Never retry auth/network errors here. */
export async function loadResearchTopics(projectId: string): Promise<Topic[]> {
	try {
		return await loadAllResearchTopics(projectId)
	} catch (error) {
		if (!(error instanceof Error) || !error.message.startsWith("research_topic_")) throw error
		const response = await SuperMagicApi.getTopicsByProjectId({
			id: projectId,
			page: 1,
			page_size: 999,
		})
		if (!Array.isArray(response?.list)) throw error
		return response.list
	}
}

/** Normal reads retain shared fallback; mutations must explicitly require completeness. */
export async function loadResearchFiles(projectId: string, requireComplete = false) {
	const result = await loadProjectAttachments({
		projectId,
		temporaryToken: "",
		includeHidden: requireComplete,
	})
	if (
		requireComplete &&
		(result.sourceVersion !== "v2" ||
			result.diagnostics.adapter_warning_codes?.length ||
			result.diagnostics.bfs_warning_codes?.length)
	)
		throw new Error("research_file_snapshot_incomplete")
	return result
}
