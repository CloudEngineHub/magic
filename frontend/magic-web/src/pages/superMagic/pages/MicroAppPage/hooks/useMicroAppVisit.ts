import { useCallback, useRef } from "react"
import { SuperMagicApi } from "@/apis"

export function useMicroAppVisit(appId: string) {
	const recordedRef = useRef(false)

	return useCallback(() => {
		if (!appId || recordedRef.current) return
		recordedRef.current = true
		void SuperMagicApi.recordMicroAppVisit(appId).catch((error) => {
			console.error("Failed to record micro app visit:", error)
		})
	}, [appId])
}
