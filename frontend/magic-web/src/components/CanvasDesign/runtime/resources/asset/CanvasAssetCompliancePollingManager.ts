import type { Canvas } from "../../core/Canvas"
import type {
	CanvasAssetComplianceState,
	CanvasAssetComplianceStatus,
} from "../../../public/magic-types"

const DEFAULT_POLLING_INTERVAL = 2500

export interface CanvasAssetCompliancePollingOptions {
	intervalMs?: number
	onUpdate?: (state: CanvasAssetComplianceState) => void
	onSettled?: (state: CanvasAssetComplianceState) => void
	onError?: (error: unknown) => void
}

interface PollingListener {
	id: symbol
	options: CanvasAssetCompliancePollingOptions
}

interface PollingEntry {
	assetId: string
	listeners: PollingListener[]
	timer?: ReturnType<typeof setTimeout>
	inFlight: boolean
	token: symbol
}

function isTerminalStatus(status: CanvasAssetComplianceStatus): boolean {
	return status !== "PROCESSING"
}

/**
 * Canvas 级素材合规轮询器。
 *
 * 轮询状态属于素材服务，不写回媒体 Content；合规任务模块订阅
 * 状态回调即可复用同一套请求去重、定时器清理和旧请求隔离逻辑。
 */
export class CanvasAssetCompliancePollingManager {
	private readonly entries = new Map<string, PollingEntry>()
	private readonly states = new Map<string, CanvasAssetComplianceState>()
	private destroyed = false

	constructor(private readonly canvas: Canvas) {}

	public start(assetId: string, options: CanvasAssetCompliancePollingOptions = {}): () => void {
		if (this.destroyed) return () => undefined
		const normalizedAssetId = assetId.trim()
		if (!normalizedAssetId) return () => undefined

		const listener: PollingListener = {
			id: Symbol(`asset-compliance-listener:${normalizedAssetId}`),
			options,
		}

		const existing = this.entries.get(normalizedAssetId)
		if (existing) {
			existing.listeners.push(listener)
			return () => this.removeListener(normalizedAssetId, listener.id)
		}

		const entry: PollingEntry = {
			assetId: normalizedAssetId,
			listeners: [listener],
			inFlight: false,
			token: Symbol(`asset-compliance:${normalizedAssetId}`),
		}
		this.entries.set(normalizedAssetId, entry)
		void this.poll(entry)
		return () => this.removeListener(normalizedAssetId, listener.id)
	}

	public stop(assetId: string): void {
		const normalizedAssetId = assetId.trim()
		const entry = this.entries.get(normalizedAssetId)
		if (!entry) return
		this.clearEntry(entry)
	}

	public stopAll(): void {
		for (const entry of this.entries.values()) this.clearEntry(entry)
		this.entries.clear()
	}

	public getState(assetId: string): CanvasAssetComplianceState | undefined {
		return this.states.get(assetId.trim())
	}

	public destroy(): void {
		this.destroyed = true
		this.stopAll()
		this.states.clear()
	}

	private async poll(entry: PollingEntry): Promise<void> {
		if (!this.isCurrentEntry(entry) || entry.inFlight) return

		const getAssetComplianceStatus =
			this.canvas.magicConfigManager.config?.methods?.getAssetComplianceStatus
		if (!getAssetComplianceStatus) {
			this.emitError(entry, new Error("Asset compliance resolver is not configured"))
			this.clearEntry(entry)
			return
		}

		entry.inFlight = true
		try {
			const state = await getAssetComplianceStatus(entry.assetId)
			if (!this.isCurrentEntry(entry)) return

			this.states.set(entry.assetId, state)
			this.emitUpdate(entry, state)
			if (isTerminalStatus(state.status)) {
				this.emitSettled(entry, state)
				this.clearEntry(entry)
				return
			}

			this.scheduleNextPoll(entry)
		} catch (error) {
			if (!this.isCurrentEntry(entry)) return
			// 与生成结果轮询一致：临时网络/服务异常不改变素材状态，
			// 通知调用方后继续下一周期重试。
			this.emitError(entry, error)
			this.scheduleNextPoll(entry)
		} finally {
			entry.inFlight = false
		}
	}

	private emitUpdate(entry: PollingEntry, state: CanvasAssetComplianceState): void {
		for (const listener of entry.listeners) {
			listener.options.onUpdate?.(state)
		}
	}

	private emitSettled(entry: PollingEntry, state: CanvasAssetComplianceState): void {
		for (const listener of entry.listeners) {
			listener.options.onSettled?.(state)
		}
	}

	private emitError(entry: PollingEntry, error: unknown): void {
		for (const listener of entry.listeners) {
			listener.options.onError?.(error)
		}
	}

	private removeListener(assetId: string, listenerId: symbol): void {
		const entry = this.entries.get(assetId)
		if (!entry) return
		entry.listeners = entry.listeners.filter((listener) => listener.id !== listenerId)
		if (entry.listeners.length === 0) {
			this.clearEntry(entry)
		}
	}

	private scheduleNextPoll(entry: PollingEntry): void {
		if (!this.isCurrentEntry(entry)) return
		if (entry.timer) clearTimeout(entry.timer)
		const interval = Math.max(
			0,
			entry.listeners[0]?.options.intervalMs ?? DEFAULT_POLLING_INTERVAL,
		)
		entry.timer = setTimeout(() => {
			entry.timer = undefined
			void this.poll(entry)
		}, interval)
	}

	private isCurrentEntry(entry: PollingEntry): boolean {
		const current = this.entries.get(entry.assetId)
		return !this.destroyed && current === entry && current?.token === entry.token
	}

	private clearEntry(entry: PollingEntry): void {
		if (entry.timer) clearTimeout(entry.timer)
		entry.timer = undefined
		if (this.entries.get(entry.assetId) === entry) this.entries.delete(entry.assetId)
	}
}
