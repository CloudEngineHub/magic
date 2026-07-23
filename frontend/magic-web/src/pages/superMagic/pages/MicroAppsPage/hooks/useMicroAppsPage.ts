import { useCallback, useEffect, useState } from "react"
import { SuperMagicApi } from "@/apis"
import type {
	PublishedMicroAppProjectItem,
	PublishedMicroAppProjectRecord,
} from "@/apis/modules/superMagic"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"

function normalizePublishedMicroAppItem(
	item: PublishedMicroAppProjectItem | PublishedMicroAppProjectRecord,
): PublishedMicroAppProjectItem | null {
	if ("publish" in item || "project" in item) {
		const publish = item.publish
		const project = item.project
		if (!publish && !project?.id) return null

		return {
			app_id: String(publish?.app_id || ""),
			project_id: String(publish?.project_id || project?.id || ""),
			project_name: project?.project_name || publish?.project_name,
			resource_id: publish?.resource_id ? String(publish.resource_id) : undefined,
			share_id: publish?.share_id ? String(publish.share_id) : undefined,
			share_code: publish?.share_code ? String(publish.share_code) : undefined,
			share_type: publish?.share_type ?? 2,
			share_range: publish?.share_range || undefined,
			target_ids: publish?.target_ids || [],
			access_url: publish?.access_url || "",
			published_at: publish?.published_at,
			password: publish?.password,
			publish_status: publish?.publish_status,
		}
	}

	return {
		...item,
		app_id: String(item.app_id || ""),
		project_id: String(item.project_id || ""),
		resource_id: item.resource_id ? String(item.resource_id) : undefined,
		share_id: item.share_id ? String(item.share_id) : undefined,
		share_code: item.share_code ? String(item.share_code) : undefined,
	}
}

export function getPublishedMicroAppList(response: unknown): PublishedMicroAppProjectItem[] {
	if (!response || typeof response !== "object") return []
	let list: Array<PublishedMicroAppProjectItem | PublishedMicroAppProjectRecord> = []

	if (Array.isArray((response as { list?: unknown }).list)) {
		list = (
			response as {
				list: Array<PublishedMicroAppProjectItem | PublishedMicroAppProjectRecord>
			}
		).list
	} else if (
		"data" in response &&
		response.data &&
		typeof response.data === "object" &&
		Array.isArray((response.data as { list?: unknown }).list)
	) {
		list = (
			response.data as {
				list: Array<PublishedMicroAppProjectItem | PublishedMicroAppProjectRecord>
			}
		).list
	}

	return list
		.map((item) => normalizePublishedMicroAppItem(item))
		.filter((item): item is PublishedMicroAppProjectItem => Boolean(item?.app_id))
}

export function useMicroAppsPage() {
	const [workspace, setWorkspace] = useState<Workspace | null>(null)
	const [projects, setProjects] = useState<ProjectListItem[]>([])
	const [publishedProjects, setPublishedProjects] = useState<PublishedMicroAppProjectItem[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<unknown>(null)

	const refresh = useCallback(async () => {
		setLoading(true)
		setError(null)

		try {
			const nextWorkspace = await SuperMagicApi.getMicroAppWorkspace()
			const [projectResponse, publishedResponse] = await Promise.all([
				SuperMagicApi.getProjectsWithCollaboration({
					workspace_id: nextWorkspace.id,
					page: 1,
					page_size: 100,
					show_collaboration: 1,
				}),
				SuperMagicApi.getPublishedMicroAppProjects({
					page: 1,
					page_size: 100,
					keyword: "",
				}),
			])

			setWorkspace(nextWorkspace)
			setProjects(projectResponse.list)
			setPublishedProjects(getPublishedMicroAppList(publishedResponse))
		} catch (nextError) {
			setError(nextError)
			setWorkspace(null)
			setProjects([])
			setPublishedProjects([])
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	return {
		workspace,
		projects,
		publishedProjects,
		loading,
		error,
		refresh,
	}
}
