import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SelfMediaOpsOverview } from "../services/selfMediaOpsOverview"
import {
	buildSelfMediaHomeInsightSignature,
	getSelfMediaHomeInsightDateKey,
	resolveSelfMediaHomeDailyInsight,
	type SelfMediaHomeDailyInsightPayload,
	type SelfMediaHomeDailyInsightStatus,
	type SelfMediaHomeDailyInsightStorage,
} from "../services/selfMediaHomeInsight"

interface UseSelfMediaHomeDailyInsightOptions {
	overview: SelfMediaOpsOverview
	displayName?: string
	enabled: boolean
	model?: string
	storage?: SelfMediaHomeDailyInsightStorage
}

export function useSelfMediaHomeDailyInsight({
	overview,
	displayName,
	enabled,
	model,
	storage,
}: UseSelfMediaHomeDailyInsightOptions) {
	const [insight, setInsight] = useState<SelfMediaHomeDailyInsightPayload | null>(null)
	const [status, setStatus] = useState<SelfMediaHomeDailyInsightStatus>("idle")
	const [error, setError] = useState<unknown>(null)
	const requestedDateRef = useRef<string | null>(null)
	const overviewRef = useRef(overview)
	overviewRef.current = overview
	const dateKey = getSelfMediaHomeInsightDateKey()
	const stateSignature = useMemo(() => buildSelfMediaHomeInsightSignature(overview), [overview])

	const generate = useCallback(
		async (force = false) => {
			if (!storage) return null
			setStatus("loading")
			setError(null)
			try {
				const result = await resolveSelfMediaHomeDailyInsight({
					overview: overviewRef.current,
					displayName,
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
		[displayName, model, storage],
	)

	useEffect(() => {
		if (!enabled || !storage) return
		if (requestedDateRef.current === dateKey) return
		requestedDateRef.current = dateKey
		void generate(false)
	}, [dateKey, enabled, generate, stateSignature, storage])

	const regenerate = useCallback(() => generate(true), [generate])
	const dismissAction = useCallback(
		(actionId: string) => {
			if (!storage) return
			setInsight((current) => {
				if (!current?.actions.some((action) => action.id === actionId)) return current
				const next = {
					...current,
					actions: current.actions.filter((action) => action.id !== actionId),
				}
				void storage.saveHomeDailyInsight(next).catch((nextError) => {
					setError(nextError)
					setStatus("error")
				})
				return next
			})
		},
		[storage],
	)

	return {
		insight,
		status,
		error,
		regenerate,
		dismissAction,
	}
}
