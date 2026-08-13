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
 * 一个元素同一时刻只允许归属一个 attempt；新 attempt 会使旧 attempt 对该元素立即失效，
 * 从而阻止较早返回的异步请求覆盖较新的用户操作。
 */
export class GenerationRuntimeManager {
	private attempts = new Map<string, GenerationAttempt>()
	private targetStates = new Map<string, GenerationRuntimeTargetState>()
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

		const targetIds = new Set<string>()
		for (const target of options.targets) {
			if (targetIds.has(target.elementId)) {
				throw new Error(`Duplicate generation target ${target.elementId}`)
			}
			targetIds.add(target.elementId)
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
			this.detachTargetFromCurrentAttempt(target.elementId)
		}

		this.attempts.set(attemptId, attempt)
		for (const target of attempt.targets) {
			this.targetStates.set(target.elementId, this.createTargetState(attempt, target))
			this.notifyElement(target.elementId)
		}

		return attemptId
	}

	public updateAttemptPhase(attemptId: string, phase: GenerationAttemptPhase): boolean {
		const attempt = this.attempts.get(attemptId)
		if (!attempt || attempt.phase === phase) return Boolean(attempt)

		attempt.phase = phase
		for (const target of attempt.targets) {
			const current = this.targetStates.get(target.elementId)
			if (current?.attemptId !== attemptId) continue
			this.targetStates.set(target.elementId, this.createTargetState(attempt, target))
			this.notifyElement(target.elementId)
		}
		return true
	}

	public getAttempt(attemptId: string): GenerationAttempt | null {
		return this.attempts.get(attemptId) ?? null
	}

	public getTargetState(elementId: string): GenerationRuntimeTargetState | null {
		return this.targetStates.get(elementId) ?? null
	}

	public isCurrent(attemptId: string, elementId?: string): boolean {
		if (elementId) {
			return this.targetStates.get(elementId)?.attemptId === attemptId
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
		const current = this.targetStates.get(elementId)
		if (!current) return

		this.targetStates.delete(elementId)
		const attempt = this.attempts.get(current.attemptId)
		if (attempt) {
			attempt.targets = attempt.targets.filter((target) => target.elementId !== elementId)
			if (attempt.targets.length === 0) {
				this.attempts.delete(attempt.attemptId)
			}
		}
		this.notifyElement(elementId)
	}

	public clear(): void {
		const elementIds = Array.from(this.targetStates.keys())
		this.attempts.clear()
		this.targetStates.clear()
		elementIds.forEach((elementId) => this.notifyElement(elementId))
	}

	public destroy(): void {
		this.unsubscribers.forEach((unsubscribe) => unsubscribe())
		this.unsubscribers = []
		this.attempts.clear()
		this.targetStates.clear()
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

	private detachTargetFromCurrentAttempt(elementId: string): void {
		const current = this.targetStates.get(elementId)
		if (!current) return

		const previousAttempt = this.attempts.get(current.attemptId)
		if (previousAttempt) {
			previousAttempt.targets = previousAttempt.targets.filter(
				(target) => target.elementId !== elementId,
			)
			if (previousAttempt.targets.length === 0) {
				this.attempts.delete(previousAttempt.attemptId)
			}
		}
		this.targetStates.delete(elementId)
	}

	private clearAttempt(attemptId: string): GenerationAttempt | null {
		const attempt = this.attempts.get(attemptId)
		if (!attempt) return null

		this.attempts.delete(attemptId)
		for (const target of attempt.targets) {
			const current = this.targetStates.get(target.elementId)
			if (current?.attemptId !== attemptId) continue
			this.targetStates.delete(target.elementId)
			this.notifyElement(target.elementId)
		}
		return attempt
	}

	private notifyElement(elementId: string): void {
		this.listeners.get(elementId)?.forEach((listener) => listener())
	}
}
