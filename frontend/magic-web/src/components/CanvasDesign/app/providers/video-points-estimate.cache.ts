import type {
	CanvasDesignMethods,
	EstimateVideoPointsResponse,
	GenerateVideoRequest,
} from "../../public/magic-types"

type EstimateVideoPoints = NonNullable<CanvasDesignMethods["estimateVideoPoints"]>

interface GetOrRequestVideoPointsEstimateOptions {
	signature: string
	request: GenerateVideoRequest
	estimateVideoPoints?: EstimateVideoPoints
}

export class VideoPointsEstimateCache {
	private readonly estimates = new Map<string, EstimateVideoPointsResponse>()
	private readonly pendingRequests = new Map<string, Promise<EstimateVideoPointsResponse>>()
	private version = 0

	clear() {
		this.version += 1
		this.estimates.clear()
		this.pendingRequests.clear()
	}

	get(signature: string): EstimateVideoPointsResponse | undefined {
		return this.estimates.get(signature)
	}

	getOrRequest(
		options: GetOrRequestVideoPointsEstimateOptions,
	): Promise<EstimateVideoPointsResponse> {
		const cachedEstimate = this.estimates.get(options.signature)
		if (cachedEstimate) return Promise.resolve(cachedEstimate)

		const pendingEstimate = this.pendingRequests.get(options.signature)
		if (pendingEstimate) return pendingEstimate

		if (!options.estimateVideoPoints) {
			throw new Error("estimateVideoPoints is unavailable")
		}

		const requestVersion = this.version
		const requestPromise = options
			.estimateVideoPoints(options.request)
			.then((estimate) => {
				if (this.version === requestVersion) {
					this.estimates.set(options.signature, estimate)
				}
				return estimate
			})
			.finally(() => {
				if (this.version === requestVersion) {
					this.pendingRequests.delete(options.signature)
				}
			})

		this.pendingRequests.set(options.signature, requestPromise)
		return requestPromise
	}
}
