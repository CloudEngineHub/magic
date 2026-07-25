export interface SharedAbortableRequestOptions<T> {
	abortValue: T
	onNoConsumers?: () => void
}

/**
 * 让多个消费者复用同一个底层请求，同时保持各自独立的取消语义。
 * 只有最后一个消费者释放后，底层 AbortController 才会被取消。
 */
export class SharedAbortableRequest<T> {
	private readonly abortController = new AbortController()
	private readonly consumers = new Map<number, () => void>()
	private consumerSequence = 0
	private settled = false
	public readonly promise: Promise<T>

	constructor(
		factory: (signal: AbortSignal) => Promise<T>,
		private readonly options: SharedAbortableRequestOptions<T>,
	) {
		this.promise = Promise.resolve()
			.then(() => factory(this.abortController.signal))
			.finally(() => {
				this.settled = true
				this.consumers.forEach((cleanup) => cleanup())
				this.consumers.clear()
			})
		// 最后一个消费者先于底层请求完成时，请求可能以 AbortError 结束；避免无人订阅的拒绝。
		void this.promise.catch(() => undefined)
	}

	public consume(signal?: AbortSignal): Promise<T> {
		if (signal?.aborted) {
			return Promise.resolve(this.options.abortValue)
		}

		const consumerId = ++this.consumerSequence
		let released = false
		let abortListener: (() => void) | undefined
		const release = () => {
			if (released) return
			released = true
			if (abortListener) signal?.removeEventListener("abort", abortListener)
			this.consumers.delete(consumerId)
			if (!this.settled && this.consumers.size === 0) {
				this.options.onNoConsumers?.()
				this.abort()
			}
		}

		return new Promise<T>((resolve, reject) => {
			abortListener = () => {
				release()
				resolve(this.options.abortValue)
			}
			this.consumers.set(consumerId, () => {
				if (abortListener) signal?.removeEventListener("abort", abortListener)
			})
			signal?.addEventListener("abort", abortListener, { once: true })

			this.promise.then(
				(value) => {
					if (released) return
					release()
					resolve(value)
				},
				(error) => {
					if (released) return
					release()
					reject(error)
				},
			)
		})
	}

	public abort(): void {
		if (!this.abortController.signal.aborted) {
			this.abortController.abort()
		}
	}

	public get isSettled(): boolean {
		return this.settled
	}

	public get isAborted(): boolean {
		return this.abortController.signal.aborted
	}

	public get consumerCount(): number {
		return this.consumers.size
	}
}
