import { useCallback, useEffect, useState } from "react"
import { SuperMagicApi } from "@/apis"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"

export function useMicroAppsPage() {
	const [workspace, setWorkspace] = useState<Workspace | null>(null)
	const [projects, setProjects] = useState<ProjectListItem[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<unknown>(null)

	const refresh = useCallback(async () => {
		setLoading(true)
		setError(null)

		try {
			const nextWorkspace = await SuperMagicApi.getMicroAppWorkspace()
			const projectResponse = await SuperMagicApi.getProjectsWithCollaboration({
				workspace_id: nextWorkspace.id,
				page: 1,
				page_size: 100,
				show_collaboration: 1,
			})

			setWorkspace(nextWorkspace)
			setProjects(projectResponse.list)
		} catch (nextError) {
			setError(nextError)
			setWorkspace(null)
			setProjects([])
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
		loading,
		error,
		refresh,
	}
}
