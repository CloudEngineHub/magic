import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SelfMediaOpsOverview } from "../services/selfMediaOpsOverview"
import {
	buildSelfMediaOpsHealthInsightSignature,
	resolveSelfMediaOpsHealthInsight,
	type SelfMediaOpsHealthInsightPayload,
	type SelfMediaOpsHealthInsightStatus,
	type SelfMediaOpsHealthInsightStorage,
} from "../services/selfMediaOpsHealthInsight"

interface UseSelfMediaOpsHealthInsightOptions {
	overview: SelfMediaOpsOverview
	enabled: boolean
	model?: string
	storage?: SelfMediaOpsHealthInsightStorage
}

export function useSelfMediaOpsHealthInsight({
	overview,
	enabled,
	model,
	storage,
}: UseSelfMediaOpsHealthInsightOptions) {
	const [insight, setInsight] = useState<SelfMediaOpsHealthInsightPayload | null>(null)
	const [status, setStatus] = useState<SelfMediaOpsHealthInsightStatus>("idle")
	const [error, setError] = useState<unknown>(null)
	const requestedSignatureRef = useRef<string | null>(null)
	const overviewRef = useRef(overview)
	overviewRef.current = overview
	const stateSignature = useMemo(
		() => buildSelfMediaOpsHealthInsightSignature(overview),
		[overview],
	)

	const generate = useCallback(
		async (force = false) => {
			if (!storage) return null
			setStatus("loading")
			setError(null)
			try {
				const result = await resolveSelfMediaOpsHealthInsight({
					overview: overviewRef.current,
					storage,
					force,
					model,
				})
				setInsight(result.insight)
				setStatus(result.status)
				return result.insight
			} catch (nextError) {
				setError(nextError)
				setStatus("error")
				return null
			}
		},
		[model, storage],
	)

	useEffect(() => {
		if (!enabled || !storage) return
		if (requestedSignatureRef.current === stateSignature) return
		requestedSignatureRef.current = stateSignature
		void generate(false)
	}, [enabled, generate, stateSignature, storage])

	const regenerate = useCallback(() => generate(true), [generate])

	return {
		insight,
		status,
		error,
		regenerate,
	}
}
