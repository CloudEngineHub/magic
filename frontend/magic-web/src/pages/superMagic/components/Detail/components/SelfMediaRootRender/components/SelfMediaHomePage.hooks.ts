import {
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
	useCallback,
	useEffect,
} from "react"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaPostOpsMetricsPayload } from "../services/SelfMediaFileStorageService"
import {
	buildOpsMetricsRequestSignature,
	diffPostOpsArtifactAnimations,
	type SelfMediaPostOpsArtifactStates,
} from "../services/selfMediaOpsArtifactStates"
import { getSelfMediaPostKey } from "../services/selfMediaOpsOverview"
import { hasHomePreviewAsset } from "./SelfMediaHomePage.helpers"

export interface OpsMetricsLoadState {
	signature: string
	loading: boolean
}

export type OpsArtifactAnimations = ReturnType<typeof diffPostOpsArtifactAnimations>

interface UseSelfMediaHomePageRuntimeParams {
	posts: SelfMediaPlatformPostItem[]
	opsArtifactStateSignature: string
	onEnsurePostLoaded?: (target: { platform: SelfMediaPlatform; index: number }) => void
	onLoadOpsMetrics?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<SelfMediaPostOpsMetricsPayload | null> | SelfMediaPostOpsMetricsPayload | null
	onRefreshAllData?: () => void
	requestedPreviewPostKeysRef: MutableRefObject<Set<string>>
	requestedOpsMetricsPostKeysRef: MutableRefObject<Map<string, string>>
	isHomePageMountedRef: MutableRefObject<boolean>
	currentOpsArtifactStatesRef: MutableRefObject<Map<string, SelfMediaPostOpsArtifactStates>>
	previousOpsArtifactStatesRef: MutableRefObject<Map<string, SelfMediaPostOpsArtifactStates>>
	openPostTransitionTimerRef: MutableRefObject<number | null>
	setOpsMetricsByPostKey: Dispatch<
		SetStateAction<Map<string, SelfMediaPostOpsMetricsPayload | null>>
	>
	setOpsMetricsLoadStateByPostKey: Dispatch<SetStateAction<Map<string, OpsMetricsLoadState>>>
	setOpsArtifactAnimationsByPostKey: Dispatch<SetStateAction<Map<string, OpsArtifactAnimations>>>
}

export function useSelfMediaHomePageRuntime({
	posts,
	opsArtifactStateSignature,
	onEnsurePostLoaded,
	onLoadOpsMetrics,
	onRefreshAllData,
	requestedPreviewPostKeysRef,
	requestedOpsMetricsPostKeysRef,
	isHomePageMountedRef,
	currentOpsArtifactStatesRef,
	previousOpsArtifactStatesRef,
	openPostTransitionTimerRef,
	setOpsMetricsByPostKey,
	setOpsMetricsLoadStateByPostKey,
	setOpsArtifactAnimationsByPostKey,
}: UseSelfMediaHomePageRuntimeParams) {
	useEffect(() => {
		isHomePageMountedRef.current = true
		return () => {
			isHomePageMountedRef.current = false
		}
	}, [isHomePageMountedRef])

	useEffect(() => {
		if (!onEnsurePostLoaded) return

		posts.forEach((item) => {
			if (hasHomePreviewAsset(item)) return
			const requestKey = `${item.platform}:${item.entry.id}:${item.index}`
			if (requestedPreviewPostKeysRef.current.has(requestKey)) return

			requestedPreviewPostKeysRef.current.add(requestKey)
			onEnsurePostLoaded({ platform: item.platform, index: item.index })
		})
	}, [onEnsurePostLoaded, posts, requestedPreviewPostKeysRef])

	useEffect(() => {
		const transitionTimer = openPostTransitionTimerRef
		return () => {
			const pendingTimerId = transitionTimer.current
			if (pendingTimerId) {
				window.clearTimeout(pendingTimerId)
			}
		}
	}, [openPostTransitionTimerRef])

	useEffect(() => {
		requestedOpsMetricsPostKeysRef.current.clear()
		setOpsMetricsLoadStateByPostKey(new Map())
	}, [onLoadOpsMetrics, requestedOpsMetricsPostKeysRef, setOpsMetricsLoadStateByPostKey])

	useEffect(() => {
		const previous = previousOpsArtifactStatesRef.current
		const currentStates = currentOpsArtifactStatesRef.current
		const nextAnimations = new Map<string, OpsArtifactAnimations>()
		currentStates.forEach((states, postKey) => {
			const prevStates = previous.get(postKey)
			if (!prevStates) return
			const animations = diffPostOpsArtifactAnimations(prevStates, states)
			if (Object.keys(animations).length > 0) nextAnimations.set(postKey, animations)
		})
		previousOpsArtifactStatesRef.current = new Map(currentStates)
		setOpsArtifactAnimationsByPostKey((current) => {
			if (nextAnimations.size === 0 && current.size === 0) return current
			return nextAnimations
		})
		if (nextAnimations.size === 0) return undefined

		const timer = window.setTimeout(() => {
			setOpsArtifactAnimationsByPostKey(new Map())
		}, 1400)
		return () => window.clearTimeout(timer)
	}, [
		currentOpsArtifactStatesRef,
		opsArtifactStateSignature,
		previousOpsArtifactStatesRef,
		setOpsArtifactAnimationsByPostKey,
	])

	useEffect(() => {
		if (!onLoadOpsMetrics) return

		posts.forEach((item) => {
			const postKey = getSelfMediaPostKey(item)
			const metricState = currentOpsArtifactStatesRef.current.get(postKey)?.metrics
			const requestSignature = buildOpsMetricsRequestSignature(postKey, metricState)
			const previousRequestSignature = requestedOpsMetricsPostKeysRef.current.get(postKey)
			if (previousRequestSignature === requestSignature) return

			requestedOpsMetricsPostKeysRef.current.set(postKey, requestSignature)
			setOpsMetricsLoadStateByPostKey((current) => {
				const existing = current.get(postKey)
				if (existing?.signature === requestSignature && existing.loading) return current
				const next = new Map(current)
				next.set(postKey, { signature: requestSignature, loading: true })
				return next
			})
			void Promise.resolve(onLoadOpsMetrics(item))
				.then((metrics) => {
					const latestRequestSignature =
						requestedOpsMetricsPostKeysRef.current.get(postKey)
					if (
						!isHomePageMountedRef.current ||
						latestRequestSignature !== requestSignature
					) {
						return
					}
					setOpsMetricsByPostKey((current) => {
						const next = new Map(current)
						next.set(postKey, metrics)
						return next
					})
					setOpsMetricsLoadStateByPostKey((current) => {
						const next = new Map(current)
						next.set(postKey, { signature: requestSignature, loading: false })
						return next
					})
				})
				.catch(() => {
					const latestRequestSignature =
						requestedOpsMetricsPostKeysRef.current.get(postKey)
					if (
						!isHomePageMountedRef.current ||
						latestRequestSignature !== requestSignature
					) {
						return
					}
					setOpsMetricsByPostKey((current) => {
						const next = new Map(current)
						next.set(postKey, null)
						return next
					})
					setOpsMetricsLoadStateByPostKey((current) => {
						const next = new Map(current)
						next.set(postKey, { signature: requestSignature, loading: false })
						return next
					})
				})
		})
	}, [
		currentOpsArtifactStatesRef,
		isHomePageMountedRef,
		onLoadOpsMetrics,
		opsArtifactStateSignature,
		posts,
		requestedOpsMetricsPostKeysRef,
		setOpsMetricsByPostKey,
		setOpsMetricsLoadStateByPostKey,
	])

	return useCallback(() => {
		requestedPreviewPostKeysRef.current.clear()
		requestedOpsMetricsPostKeysRef.current.clear()
		currentOpsArtifactStatesRef.current = new Map()
		previousOpsArtifactStatesRef.current = new Map()
		setOpsMetricsByPostKey(new Map())
		setOpsMetricsLoadStateByPostKey(new Map())
		onRefreshAllData?.()
	}, [
		currentOpsArtifactStatesRef,
		onRefreshAllData,
		previousOpsArtifactStatesRef,
		requestedOpsMetricsPostKeysRef,
		requestedPreviewPostKeysRef,
		setOpsMetricsByPostKey,
		setOpsMetricsLoadStateByPostKey,
	])
}
