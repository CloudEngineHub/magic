import { useEffect, useRef } from "react"
import magicToast from "@/components/base/MagicToaster/utils"
import { superMagicStore } from "@/pages/superMagic/stores"
import { CREW_EDIT_ERROR } from "../constants/errors"
import type { CrewEditRootStore } from "../store/root-store"
import { resolveCrewEditError } from "../store/shared"

interface UseRefreshCrewDetailOnTopicMessageParams {
	store: CrewEditRootStore
}

const REFRESH_CREW_DETAIL_TOOL_NAMES = new Set(["update_agent", "update_skill"])

function resolveCrewCodeFromToolDetail(detail: unknown): string | null {
	if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null
	const detailRecord = detail as Record<string, unknown>
	if (typeof detailRecord.code === "string" && detailRecord.code) return detailRecord.code
	const data = detailRecord.data
	if (!data || typeof data !== "object" || Array.isArray(data)) return null
	const code = (data as Record<string, unknown>).code
	return typeof code === "string" && code ? code : null
}

export function useRefreshCrewDetailOnTopicMessage({
	store,
}: UseRefreshCrewDetailOnTopicMessageParams): void {
	const refreshTaskRef = useRef<null | Promise<void>>(null)

	useEffect(() => {
		if (!store.crewCode) return

		const unregister = superMagicStore.subscribe("toolCall.settled", ({ payload }) => {
			const crewCode = resolveCrewCodeFromToolDetail(payload.response.detail)
			const isRefreshTool = Boolean(
				payload.toolCall.name && REFRESH_CREW_DETAIL_TOOL_NAMES.has(payload.toolCall.name),
			)
			if (
				payload.strength !== "strong" ||
				payload.response.status !== "finished" ||
				!isRefreshTool ||
				crewCode !== store.crewCode
			)
				return

			if (refreshTaskRef.current) return

			refreshTaskRef.current = store
				.refreshAgentDetail()
				.catch((error) => {
					const { message } = resolveCrewEditError({
						error,
						fallbackKey: CREW_EDIT_ERROR.loadAgentFailed,
					})
					magicToast.error(message)
				})
				.finally(() => {
					refreshTaskRef.current = null
				})
		})

		return unregister
	}, [store, store.crewCode])
}
