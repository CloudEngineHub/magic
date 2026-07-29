import ImageResourceWorker from "./imageResource.worker?worker"
import type {
	ImageResourceWorkerRequest,
	ImageResourceWorkerMessage,
	ImageResourceWorkerResponse,
	ImageResourceWorkerReadyMessage,
} from "./imageResource.worker"

interface ImageResourceWorkerOwnerInfo {
	ownerId: string
	canvasId: string
	managerInstanceId: number
}

interface PendingWorkerRequest {
	ownerId: string
	resolve: (response: ImageResourceWorkerResponse) => void
	reject: (error: Error) => void
	signal?: AbortSignal
	abortListener?: () => void
}

export interface ImageResourceWorkerClientLease {
	send(
		request: ImageResourceWorkerRequest,
		options?: { signal?: AbortSignal },
	): Promise<ImageResourceWorkerResponse>
	release(error?: Error): void
	cancelAll(error?: Error): void
}

const WORKER_TERMINATE_DELAY_MS = 30 * 1000

function isWorkerReadyMessage(
	message: ImageResourceWorkerMessage,
): message is ImageResourceWorkerReadyMessage {
	return "type" in message && message.type === "ready"
}

class SharedImageResourceWorkerClient {
	private static prewarmRequestIdSeed = 0

	private worker: Worker | null = null
	private terminateTimer: ReturnType<typeof setTimeout> | null = null
	private readonly activeOwners = new Map<string, ImageResourceWorkerOwnerInfo>()
	private readonly pendingRequests = new Map<string, PendingWorkerRequest>()
	private prewarmPromise: Promise<void> | null = null

	public prewarm(reason: string): Promise<void> {
		if (typeof Worker !== "function") return Promise.resolve()
		if (this.prewarmPromise) return this.prewarmPromise

		const owner: ImageResourceWorkerOwnerInfo = {
			ownerId: "canvas-design-image-worker-prewarm",
			canvasId: "prewarm",
			managerInstanceId: 0,
		}
		const lease = this.acquire(owner)
		const requestId = `prewarm-${++SharedImageResourceWorkerClient.prewarmRequestIdSeed}`
		const startedAt = Date.now()

		const promise = lease
			.send({
				type: "warmup",
				requestId: `${requestId}:${reason}`,
				mainThreadSentAt: startedAt,
				variant: "preview",
			})
			.then(() => undefined)
			.catch(() => undefined)
			.finally(() => {
				if (this.prewarmPromise === promise) {
					this.prewarmPromise = null
				}
				lease.release(new Error("ImageResourceWorkerClient prewarm complete"))
			})

		this.prewarmPromise = promise
		return promise
	}

	public acquire(owner: ImageResourceWorkerOwnerInfo): ImageResourceWorkerClientLease {
		this.activeOwners.set(owner.ownerId, owner)
		this.cancelScheduledTerminate()

		let released = false
		return {
			send: (request, options) => this.send(owner, request, options),
			cancelAll: (error) => {
				this.cancelOwnerRequests(
					owner.ownerId,
					error ?? new Error("Worker owner cancelled"),
				)
			},
			release: (error) => {
				if (released) return
				released = true
				this.release(owner, error)
			},
		}
	}

	private send(
		owner: ImageResourceWorkerOwnerInfo,
		request: ImageResourceWorkerRequest,
		options?: { signal?: AbortSignal },
	): Promise<ImageResourceWorkerResponse> {
		if (!this.activeOwners.has(owner.ownerId)) {
			return Promise.reject(new Error("ImageResourceWorkerClient owner released"))
		}
		if (this.pendingRequests.has(request.requestId)) {
			return Promise.reject(
				new Error(`Duplicate image resource worker requestId: ${request.requestId}`),
			)
		}

		if (options?.signal?.aborted) {
			return Promise.reject(createAbortError())
		}

		return new Promise((resolve, reject) => {
			const abortListener = () => {
				this.cancelRequest(request.requestId, createAbortError())
			}
			this.pendingRequests.set(request.requestId, {
				ownerId: owner.ownerId,
				resolve,
				reject,
				signal: options?.signal,
				abortListener,
			})
			options?.signal?.addEventListener("abort", abortListener, { once: true })
			try {
				const transferables: Transferable[] = []
				if (request.type === "encode-persistent-low" && request.imageSource) {
					transferables.push(request.imageSource)
				}
				if (transferables.length > 0) {
					this.getWorker().postMessage(request, { transfer: transferables })
				} else {
					this.getWorker().postMessage(request)
				}
			} catch (error) {
				request.imageSource?.close()
				this.removePendingRequest(request.requestId)
				reject(error instanceof Error ? error : new Error(String(error)))
			}
		})
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker

		const worker = new ImageResourceWorker()
		this.worker = worker

		worker.onmessage = (event: MessageEvent<ImageResourceWorkerMessage>) => {
			const message = event.data
			if (isWorkerReadyMessage(message)) {
				// 根因备忘：刷新后首屏图片慢时，日志确认慢点可能发生在浏览器启动/加载 worker
				// 脚本到 ready 消息之间，而不是 getFileInfo、service worker 或实际解码阶段。
				// 这里不阻塞请求；后续若治理 cold start，应在首屏图片侧做超时降级或更早预热。
				return
			}

			const { requestId } = message
			const pending = this.pendingRequests.get(requestId)
			if (!pending) {
				message.imageSource?.close()
				return
			}
			this.removePendingRequest(requestId)
			pending.resolve(message)
		}

		worker.onerror = (event) => {
			const reason =
				event instanceof ErrorEvent && event.message
					? event.message
					: "ImageResourceWorker error"
			this.rejectAll(new Error(reason))
			this.terminateWorker()
		}

		return worker
	}

	private release(owner: ImageResourceWorkerOwnerInfo, error?: Error): void {
		this.activeOwners.delete(owner.ownerId)
		this.cancelOwnerRequests(
			owner.ownerId,
			error ?? new Error("ImageResourceWorkerClient owner released"),
		)
		if (this.activeOwners.size === 0) {
			this.scheduleTerminate()
		}
	}

	private cancelOwnerRequests(ownerId: string, error: Error): void {
		this.pendingRequests.forEach((pending, requestId) => {
			if (pending.ownerId !== ownerId) return
			this.cancelRequest(requestId, error)
		})
	}

	private rejectAll(error: Error): void {
		this.pendingRequests.forEach((_, requestId) => {
			this.cancelRequest(requestId, error)
		})
	}

	private cancelRequest(requestId: string, error: Error): void {
		const pending = this.removePendingRequest(requestId)
		if (!pending) return
		try {
			this.worker?.postMessage({
				type: "cancel",
				requestId: `cancel:${requestId}`,
				targetRequestId: requestId,
			})
		} catch {
			// A terminating worker cannot receive a cancellation message; rejecting the caller is enough.
		}
		pending.reject(error)
	}

	private removePendingRequest(requestId: string): PendingWorkerRequest | undefined {
		const pending = this.pendingRequests.get(requestId)
		if (!pending) return undefined
		this.pendingRequests.delete(requestId)
		if (pending.abortListener) {
			pending.signal?.removeEventListener("abort", pending.abortListener)
		}
		return pending
	}

	private scheduleTerminate(): void {
		this.cancelScheduledTerminate()
		this.terminateTimer = setTimeout(() => {
			this.terminateTimer = null
			if (this.activeOwners.size > 0) return
			this.terminateWorker()
		}, WORKER_TERMINATE_DELAY_MS)
	}

	private cancelScheduledTerminate(): void {
		if (!this.terminateTimer) return
		clearTimeout(this.terminateTimer)
		this.terminateTimer = null
	}

	private terminateWorker(): void {
		if (!this.worker) return
		this.cancelScheduledTerminate()
		this.worker.terminate()
		this.worker = null
	}
}

function createAbortError(): Error {
	const error = new Error("Image resource worker request aborted")
	error.name = "AbortError"
	return error
}

const sharedImageResourceWorkerClient = new SharedImageResourceWorkerClient()

export function acquireImageResourceWorkerClient(
	owner: ImageResourceWorkerOwnerInfo,
): ImageResourceWorkerClientLease {
	return sharedImageResourceWorkerClient.acquire(owner)
}

export function prewarmImageResourceWorkerClient(reason: string): Promise<void> {
	return sharedImageResourceWorkerClient.prewarm(reason)
}
