export type MediaDecodePriority = "critical" | "visible" | "near" | "background"

export const DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET = 16 * 1024 * 1024

const MEDIA_DECODE_PRIORITY_RANK: Record<MediaDecodePriority, number> = {
	critical: 0,
	visible: 1,
	near: 2,
	background: 3,
}

interface DecodePermitQueueItem {
	pixelCost: number
	priority: MediaDecodePriority
	sequence: number
	resolve: (release: () => void) => void
}

export function getMediaDecodePriorityRank(priority: MediaDecodePriority): number {
	return MEDIA_DECODE_PRIORITY_RANK[priority] ?? MEDIA_DECODE_PRIORITY_RANK.background
}

export function estimateScaledPixelCost(width: number, height: number, maxEdge?: number): number {
	const sourceWidth = Math.max(1, width)
	const sourceHeight = Math.max(1, height)
	if (!maxEdge || maxEdge <= 0) {
		return sourceWidth * sourceHeight
	}

	const largestEdge = Math.max(sourceWidth, sourceHeight)
	if (largestEdge <= maxEdge) {
		return sourceWidth * sourceHeight
	}

	const scale = maxEdge / largestEdge
	return (
		Math.max(1, Math.round(sourceWidth * scale)) * Math.max(1, Math.round(sourceHeight * scale))
	)
}

export function getFallbackDecodePixelCost(
	maxEdge?: number,
	pixelBudget = DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
): number {
	if (maxEdge && maxEdge > 0) {
		return maxEdge * maxEdge
	}
	return pixelBudget
}

export class MediaDecodePixelBudgetGate {
	private activePixelCostValue = 0
	private queue: DecodePermitQueueItem[] = []
	private sequence = 0
	private destroyed = false

	constructor(private readonly pixelBudget = DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET) {}

	public get activePixelCost(): number {
		return this.activePixelCostValue
	}

	public get queuedCount(): number {
		return this.queue.length
	}

	public acquire(pixelCost: number, priority: MediaDecodePriority): Promise<() => void> {
		if (this.destroyed) return Promise.resolve(() => undefined)

		const normalizedPixelCost = Math.max(1, Math.ceil(pixelCost))
		if (this.canStart(normalizedPixelCost)) {
			return Promise.resolve(this.activate(normalizedPixelCost))
		}

		return new Promise((resolve) => {
			this.queue.push({
				pixelCost: normalizedPixelCost,
				priority,
				sequence: ++this.sequence,
				resolve,
			})
			this.pump()
		})
	}

	public destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		this.queue.forEach((item) => item.resolve(() => undefined))
		this.queue = []
		this.activePixelCostValue = 0
	}

	private sortQueue(): void {
		this.queue.sort((a, b) => {
			const priorityDiff =
				getMediaDecodePriorityRank(a.priority) - getMediaDecodePriorityRank(b.priority)
			if (priorityDiff !== 0) return priorityDiff
			return a.sequence - b.sequence
		})
	}

	private canStart(pixelCost: number): boolean {
		return (
			this.activePixelCostValue === 0 ||
			this.activePixelCostValue + pixelCost <= this.pixelBudget
		)
	}

	private activate(pixelCost: number): () => void {
		this.activePixelCostValue += pixelCost
		let released = false
		return () => {
			if (released) return
			released = true
			this.release(pixelCost)
		}
	}

	private release(pixelCost: number): void {
		this.activePixelCostValue = Math.max(0, this.activePixelCostValue - pixelCost)
		this.pump()
	}

	private pump(): void {
		if (this.destroyed) {
			this.queue.forEach((item) => item.resolve(() => undefined))
			this.queue = []
			return
		}

		this.sortQueue()
		while (this.queue.length > 0) {
			const item = this.queue[0]
			if (!this.canStart(item.pixelCost)) return
			this.queue.shift()
			item.resolve(this.activate(item.pixelCost))
		}
	}
}
