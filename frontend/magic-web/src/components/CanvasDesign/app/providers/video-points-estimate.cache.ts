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
	private readonly failures = new Map<string, unknown>()
	private version = 0

	clear() {
		this.version += 1
		this.estimates.clear()
		this.pendingRequests.clear()
		this.failures.clear()
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

		if (this.failures.has(options.signature)) {
			return Promise.reject(this.failures.get(options.signature))
		}

		if (!options.estimateVideoPoints) {
			throw new Error("estimateVideoPoints is unavailable")
		}

		const requestVersion = this.version
		const requestPromise = options
			.estimateVideoPoints(options.request)
			.then((estimate) => {
				if (this.version === requestVersion) {
					this.failures.delete(options.signature)
					this.estimates.set(options.signature, estimate)
				}
				return estimate
			})
			.catch((error) => {
				if (this.version === requestVersion) {
					this.failures.set(options.signature, error)
				}
				throw error
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
