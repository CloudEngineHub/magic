import { useEffect, useState } from "react"

import { SuperMagicApi } from "@/apis"

export function useMicroAppProjectResolver(appId: string) {
	const [projectId, setProjectId] = useState("")
	const [loading, setLoading] = useState(Boolean(appId))
	const [error, setError] = useState<Error | null>(null)

	useEffect(() => {
		if (!appId) {
			setProjectId("")
			setLoading(false)
			return
		}

		let active = true
		setLoading(true)
		setError(null)
		setProjectId("")

		SuperMagicApi.getMicroAppProject(appId)
			.then((result) => {
				if (!active) return
				const nextProjectId = String(result.project_id || result.project?.id || "")
				if (!nextProjectId) throw new Error("Micro app project mapping is missing")
				setProjectId(nextProjectId)
			})
			.catch((nextError) => {
				if (!active) return
				setError(nextError instanceof Error ? nextError : new Error(String(nextError)))
			})
			.finally(() => {
				if (active) setLoading(false)
			})

		return () => {
			active = false
		}
	}, [appId])

	return { projectId, loading, error }
}
