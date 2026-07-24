import { useEffect, useState } from "react"

import { SuperMagicApi } from "@/apis"

const MAX_DISPLAY_ERROR_LENGTH = 240

function readDisplayErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message.trim()
	if (typeof error === "string") return error.trim()
	if (!error || typeof error !== "object") return ""

	const record = error as Record<string, unknown>
	for (const key of ["message", "error", "detail"] as const) {
		const value = record[key]
		if (typeof value === "string" && value.trim()) return value.trim()
	}

	return ""
}

export function normalizeMicroAppProjectError(error: unknown): Error {
	const message = readDisplayErrorMessage(error)
	const isTechnicalValue = /^\[object\s.+\]$/i.test(message) || /^</.test(message)

	if (!message || message.length > MAX_DISPLAY_ERROR_LENGTH || isTechnicalValue) {
		return new Error()
	}

	return new Error(message)
}

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
				if (!nextProjectId) throw new Error()
				setProjectId(nextProjectId)
			})
			.catch((nextError) => {
				if (!active) return
				setError(normalizeMicroAppProjectError(nextError))
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
