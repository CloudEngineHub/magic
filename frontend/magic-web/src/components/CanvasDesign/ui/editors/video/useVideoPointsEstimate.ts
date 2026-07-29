import { useEffect, useMemo, useState } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import type { EstimateVideoPointsResponse, GenerateVideoRequest } from "../../../public/magic-types"
import {
	resolveVideoPointsEstimateGate,
	type VideoPointsEstimateBlockedReason,
} from "./points/video-points-estimate.policy"
import {
	collectPendingVideoGenerationRequestResourcePaths,
	collectVideoGenerationRequestResourcePaths,
} from "./points/video-points-estimate.resources"

interface UseVideoPointsEstimateOptions {
	request: Partial<GenerateVideoRequest> | null
	signature: string | null
	enabled?: boolean
}

interface UseVideoPointsEstimateResult {
	estimate: EstimateVideoPointsResponse | null
	points: number | null
	isLoading: boolean
	error: unknown
	blockedReason: VideoPointsEstimateBlockedReason | null
}

export function useVideoPointsEstimate(
	options: UseVideoPointsEstimateOptions,
): UseVideoPointsEstimateResult {
	const { request, signature, enabled = true } = options
	const { canvas } = useCanvas()
	const { methods, getCachedVideoPointsEstimate, getVideoPointsEstimate } = useMagic()
	const [estimate, setEstimate] = useState<EstimateVideoPointsResponse | null>(null)
	const [error, setError] = useState<unknown>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [deferralVersion, setDeferralVersion] = useState(0)

	const requestResourcePaths = useMemo(() => {
		return collectVideoGenerationRequestResourcePaths(request)
	}, [request])
	const pendingResourcePaths = useMemo(() => {
		const uploadManager = canvas?.canvasFileUploadManager
		if (!request) return []
		if (!uploadManager) return requestResourcePaths

		void deferralVersion
		return collectPendingVideoGenerationRequestResourcePaths(request, (path) =>
			uploadManager.shouldDeferRemoteResourceLoad(path),
		)
	}, [canvas, request, requestResourcePaths, deferralVersion])

	const pendingResourceKey = useMemo(
		() => pendingResourcePaths.join("\0"),
		[pendingResourcePaths],
	)
	const hasPendingResourceDeferrals = pendingResourcePaths.length > 0

	const estimateGate = useMemo(
		() =>
			resolveVideoPointsEstimateGate({
				enabled,
				request,
				signature,
				hasEstimateVideoPoints: Boolean(methods?.estimateVideoPoints),
				hasPendingResourceDeferrals,
			}),
		[enabled, hasPendingResourceDeferrals, methods?.estimateVideoPoints, request, signature],
	)
	const canEstimate = estimateGate.canEstimate

	useEffect(() => {
		if (!canvas || estimateGate.blockedReason !== "pending_resource_deferrals") return

		const uploadManager = canvas.canvasFileUploadManager
		const pendingKeys = new Set(
			pendingResourcePaths
				.map((path) => uploadManager.getRemoteResourceLoadDeferralKey(path))
				.filter((key): key is string => Boolean(key)),
		)
		if (pendingKeys.size === 0) return

		return canvas.eventEmitter.on("resource:remote-load-deferral-released", ({ data }) => {
			if (!pendingKeys.has(data.key)) return
			setDeferralVersion((value) => value + 1)
		})
	}, [canvas, estimateGate.blockedReason, pendingResourceKey, pendingResourcePaths, signature])

	useEffect(() => {
		if (!canEstimate || !signature || !request?.model_id) {
			setEstimate(null)
			setError(null)
			setIsLoading(false)
			return
		}

		const cachedEstimate = getCachedVideoPointsEstimate(signature)
		if (cachedEstimate) {
			setEstimate(cachedEstimate)
			setError(null)
			setIsLoading(false)
			return
		}

		let cancelled = false
		setError(null)
		setIsLoading(true)

		void getVideoPointsEstimate({
			signature,
			request: request as GenerateVideoRequest,
		})
			.then((nextEstimate) => {
				if (cancelled) return
				setEstimate(nextEstimate)
			})
			.catch((nextError) => {
				if (cancelled) return
				setError(nextError)
			})
			.finally(() => {
				if (cancelled) return
				setIsLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [
		canvas?.id,
		canEstimate,
		getCachedVideoPointsEstimate,
		getVideoPointsEstimate,
		request,
		signature,
	])

	return {
		estimate,
		points: typeof estimate?.points === "number" ? estimate.points : null,
		isLoading:
			estimateGate.blockedReason === "pending_resource_deferrals" ||
			(canEstimate && isLoading),
		error,
		blockedReason: estimateGate.blockedReason,
	}
}
