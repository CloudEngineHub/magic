import { useEffect, useState } from "react"

import { SuperMagicApi } from "@/apis"
import { isMicroAppPublished } from "../utils/microAppPublish"

const MAX_DISPLAY_ERROR_LENGTH = 240
// 微应用详情接口以 51202 表示项目访问被拒绝，使用业务码避免依赖多语言错误文案。
const PROJECT_ACCESS_DENIED_CODE = 51202

export interface MicroAppProjectError {
	kind: "load" | "permission"
	message: string
}

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

export function normalizeMicroAppProjectError(error: unknown): MicroAppProjectError {
	const message = readDisplayErrorMessage(error)
	const isTechnicalValue = /^\[object\s.+\]$/i.test(message) || /^</.test(message)
	const code =
		typeof error === "object" &&
		error !== null &&
		typeof (error as { code?: unknown }).code === "number"
			? (error as { code: number }).code
			: null
	const kind = code === PROJECT_ACCESS_DENIED_CODE ? "permission" : "load"

	if (!message || message.length > MAX_DISPLAY_ERROR_LENGTH || isTechnicalValue) {
		return { kind, message: "" }
	}

	return { kind, message }
}

export function useMicroAppProjectResolver(appId: string) {
	const [projectId, setProjectId] = useState("")
	const [isPublished, setIsPublished] = useState(false)
	const [loading, setLoading] = useState(Boolean(appId))
	const [error, setError] = useState<MicroAppProjectError | null>(null)

	useEffect(() => {
		if (!appId) {
			setProjectId("")
			setIsPublished(false)
			setLoading(false)
			return
		}

		let active = true
		setLoading(true)
		setError(null)
		setProjectId("")
		setIsPublished(false)

		SuperMagicApi.getMicroAppProject(appId, { enableErrorMessagePrompt: false })
			.then((result) => {
				if (!active) return
				const nextProjectId = String(result.project_id || result.project?.id || "")
				if (!nextProjectId) throw new Error()
				setProjectId(nextProjectId)
				setIsPublished(isMicroAppPublished(result.publish))
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

	return { projectId, isPublished, setIsPublished, loading, error }
}
