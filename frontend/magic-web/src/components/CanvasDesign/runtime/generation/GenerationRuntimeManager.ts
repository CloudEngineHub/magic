import type {
	GenerateImageRequest,
	GenerateVideoRequest,
	ImageGenerationTaskMeta,
} from "../../public/magic-types"
import type { Canvas } from "../core/Canvas"
import { generateUUID } from "../shared/ids"

export type GenerationOperation =
	| "image-generate"
	| "image-batch"
	| "image-high"
	| "image-remove-background"
	| "image-eraser"
	| "image-extend"
	| "video-generate"

export type GenerationAttemptPhase = "preparing" | "submitting"

export type GenerationFailurePolicy = "restore-existing" | "promote-empty" | "remove-placeholder"

export interface GenerationAttemptTarget {
	elementId: string
	versionId?: string
	/** 提交时的 active，用于结果完成后判断用户是否在生成期间手动切版 */
	activeVersionIdAtSubmission?: string
	outputIndex?: number
	generateImageRequest?: GenerateImageRequest
	generateVideoRequest?: GenerateVideoRequest
	imageGenerationTaskMeta?: ImageGenerationTaskMeta
}

export interface GenerationAttempt {
	attemptId: string
	operation: GenerationOperation
	originElementId?: string
	targets: GenerationAttemptTarget[]
	phase: GenerationAttemptPhase
	failurePolicy: GenerationFailurePolicy
}

export interface GenerationRuntimeTargetState extends GenerationAttemptTarget {
	attemptId: string
	operation: GenerationOperation
	originElementId?: string
	phase: GenerationAttemptPhase
	failurePolicy: GenerationFailurePolicy
}

export interface BeginGenerationAttemptOptions {
	attemptId?: string
	operation: GenerationOperation
	originElementId?: string
	targets: GenerationAttemptTarget[]
	phase?: GenerationAttemptPhase
	failurePolicy: GenerationFailurePolicy
}

/**
 * Canvas 级生成任务运行时状态。
 *
 * 这里只保存后端尚未确认的提交尝试，绝不修改 Element data，也不会进入 DSL、历史或剪贴板。
 * 普通操作仍按元素独占 attempt；图片版本生成则按 elementId + versionId 隔离，
 * 允许同一图片的多个版本同时提交，并由各自的 versionId 防止异步结果串写。
 */
export class GenerationRuntimeManager {
	private attempts = new Map<string, GenerationAttempt>()
	private targetStates = new Map<string, GenerationRuntimeTargetState>()
	private latestTargetKeyByElementId = new Map<string, string>()
	private listeners = new Map<string, Set<() => void>>()
	private unsubscribers: Array<() => void> = []

	constructor(options?: { canvas?: Canvas }) {
		const canvas = options?.canvas
		if (!canvas) return

		this.unsubscribers.push(
			canvas.eventEmitter.on("element:deleted", ({ data }) => {
				this.clearElement(data.elementId)
			}),
			canvas.eventEmitter.on("document:loaded", () => {
				this.clear()
			}),
			canvas.eventEmitter.on("document:restored", () => {
				this.clear()
			}),
			canvas.eventEmitter.on("canvas:clear", () => {
				this.clear()
			}),
		)
	}

	public beginAttempt(options: BeginGenerationAttemptOptions): string {
		if (options.targets.length === 0) {
			throw new Error("Generation attempt must contain at least one target")
		}

		const targetKeys = new Set<string>()
		for (const target of options.targets) {
			const targetKey = this.getTargetKey(target.elementId, target.versionId)
			if (targetKeys.has(targetKey)) {
				throw new Error(`Duplicate generation target ${targetKey}`)
			}
			targetKeys.add(targetKey)
		}

		const attemptId = options.attemptId ?? generateUUID()
		if (this.attempts.has(attemptId)) {
			throw new Error(`Generation attempt ${attemptId} already exists`)
		}

		const attempt: GenerationAttempt = {
			attemptId,
			operation: options.operation,
			originElementId: options.originElementId,
			targets: options.targets.map((target) => ({ ...target })),
			phase: options.phase ?? "submitting",
			failurePolicy: options.failurePolicy,
		}

		for (const target of attempt.targets) {
			this.detachTargetFromCurrentAttempt(target)
		}

		this.attempts.set(attemptId, attempt)
		for (const target of attempt.targets) {
			const targetKey = this.getTargetKey(target.elementId, target.versionId)
			this.targetStates.set(targetKey, this.createTargetState(attempt, target))
			this.latestTargetKeyByElementId.set(target.elementId, targetKey)
			this.notifyElement(target.elementId)
		}

		return attemptId
	}

	public updateAttemptPhase(attemptId: string, phase: GenerationAttemptPhase): boolean {
		const attempt = this.attempts.get(attemptId)
		if (!attempt || attempt.phase === phase) return Boolean(attempt)

		attempt.phase = phase
		for (const target of attempt.targets) {
			const targetKey = this.getTargetKey(target.elementId, target.versionId)
			const current = this.targetStates.get(targetKey)
			if (current?.attemptId !== attemptId) continue
			this.targetStates.set(targetKey, this.createTargetState(attempt, target))
			this.notifyElement(target.elementId)
		}
		return true
	}

	public getAttempt(attemptId: string): GenerationAttempt | null {
		return this.attempts.get(attemptId) ?? null
	}

	public getTargetState(elementId: string): GenerationRuntimeTargetState | null {
		const targetKey = this.latestTargetKeyByElementId.get(elementId)
		return targetKey ? (this.targetStates.get(targetKey) ?? null) : null
	}

	public isCurrent(attemptId: string, elementId?: string, versionId?: string): boolean {
		if (elementId) {
			const targetKey = this.getTargetKey(elementId, versionId)
			const current = this.targetStates.get(targetKey)
			return (
				current?.attemptId === attemptId &&
				(versionId === undefined || current.versionId === versionId)
			)
		}
		return this.attempts.has(attemptId)
	}

	public subscribeElement(elementId: string, listener: () => void): () => void {
		let listeners = this.listeners.get(elementId)
		if (!listeners) {
			listeners = new Set()
			this.listeners.set(elementId, listeners)
		}
		listeners.add(listener)

		return () => {
			const current = this.listeners.get(elementId)
			current?.delete(listener)
			if (current?.size === 0) {
				this.listeners.delete(elementId)
			}
		}
	}

	public completeAttempt(attemptId: string): GenerationAttempt | null {
		return this.clearAttempt(attemptId)
	}

	public failAttempt(attemptId: string): GenerationAttempt | null {
		return this.clearAttempt(attemptId)
	}

	public clearElement(elementId: string): void {
		const targetEntries = Array.from(this.targetStates.entries()).filter(
			([, state]) => state.elementId === elementId,
		)
		if (targetEntries.length === 0) return

		const attemptIds = new Set(targetEntries.map(([, state]) => state.attemptId))
		targetEntries.forEach(([targetKey]) => this.targetStates.delete(targetKey))
		this.latestTargetKeyByElementId.delete(elementId)
		attemptIds.forEach((attemptId) => {
			const attempt = this.attempts.get(attemptId)
			if (!attempt) return
			attempt.targets = attempt.targets.filter((target) => target.elementId !== elementId)
			if (attempt.targets.length === 0) {
				this.attempts.delete(attemptId)
			}
		})
		this.notifyElement(elementId)
	}

	public clear(): void {
		const elementIds = Array.from(
			new Set(Array.from(this.targetStates.values()).map((state) => state.elementId)),
		)
		this.attempts.clear()
		this.targetStates.clear()
		this.latestTargetKeyByElementId.clear()
		elementIds.forEach((elementId) => this.notifyElement(elementId))
	}

	public destroy(): void {
		this.unsubscribers.forEach((unsubscribe) => unsubscribe())
		this.unsubscribers = []
		this.attempts.clear()
		this.targetStates.clear()
		this.latestTargetKeyByElementId.clear()
		this.listeners.clear()
	}

	private createTargetState(
		attempt: GenerationAttempt,
		target: GenerationAttemptTarget,
	): GenerationRuntimeTargetState {
		return {
			...target,
			attemptId: attempt.attemptId,
			operation: attempt.operation,
			originElementId: attempt.originElementId,
			phase: attempt.phase,
			failurePolicy: attempt.failurePolicy,
		}
	}

	private detachTargetFromCurrentAttempt(target: GenerationAttemptTarget): void {
		const targetKey = this.getTargetKey(target.elementId, target.versionId)
		const current = this.targetStates.get(targetKey)
		if (!current) return

		const previousAttempt = this.attempts.get(current.attemptId)
		if (previousAttempt) {
			previousAttempt.targets = previousAttempt.targets.filter(
				(candidate) =>
					this.getTargetKey(candidate.elementId, candidate.versionId) !== targetKey,
			)
			if (previousAttempt.targets.length === 0) {
				this.attempts.delete(previousAttempt.attemptId)
			}
		}
		this.targetStates.delete(targetKey)
		this.refreshLatestTargetKey(target.elementId)
	}

	private clearAttempt(attemptId: string): GenerationAttempt | null {
		const attempt = this.attempts.get(attemptId)
		if (!attempt) return null

		this.attempts.delete(attemptId)
		for (const target of attempt.targets) {
			const targetKey = this.getTargetKey(target.elementId, target.versionId)
			const current = this.targetStates.get(targetKey)
			if (current?.attemptId !== attemptId) continue
			this.targetStates.delete(targetKey)
			this.refreshLatestTargetKey(target.elementId)
			this.notifyElement(target.elementId)
		}
		return attempt
	}

	private notifyElement(elementId: string): void {
		this.listeners.get(elementId)?.forEach((listener) => listener())
	}

	private getTargetKey(elementId: string, versionId?: string): string {
		return `${elementId}\u0000${versionId ?? ""}`
	}

	private refreshLatestTargetKey(elementId: string): void {
		const latest = Array.from(this.targetStates.entries()).reduce<
			[string, GenerationRuntimeTargetState] | null
		>((current, entry) => {
			if (entry[1].elementId !== elementId) return current
			return entry
		}, null)
		if (latest) {
			this.latestTargetKeyByElementId.set(elementId, latest[0])
		} else {
			this.latestTargetKeyByElementId.delete(elementId)
		}
	}
}
