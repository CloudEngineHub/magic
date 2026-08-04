import type { Canvas } from "../core/Canvas"
import { ElementTypeEnum, type LayerElement } from "../document/types"
import type { CommitGenerationTarget } from "../elements/core/ElementManager"
import type { GenerationAttempt, GenerationFailurePolicy } from "./GenerationRuntimeManager"

export type GenerationAttemptFailureResolution =
	"stale" | "restored-existing" | "promoted-empty" | "removed-placeholder" | "fallback-removed"

export interface GenerationAttemptFailureResult {
	resolution: GenerationAttemptFailureResolution
	elementIds: string[]
}

/**
 * 生成提交生命周期协调器。
 *
 * GenerationRuntimeManager 只保存尚未被后端确认的运行时状态；
 * Coordinator 负责把成功提交和失败策略原子地映射到 Element/DSL 生命周期。
 */
export class GenerationAttemptCoordinator {
	constructor(private readonly canvas: Canvas) {}

	/** 后端确认成功后，提交正式字段并结束 Runtime attempt。 */
	public confirmAttempt(attemptId: string, targets: CommitGenerationTarget[]): boolean {
		const attempt = this.canvas.generationRuntimeManager.getAttempt(attemptId)
		if (!attempt) return false

		const currentTargetIds = this.getCurrentTargetIds(attempt)
		const submittedTargetIds = targets.map((target) => target.elementId)
		if (!this.isSameTargetSet(currentTargetIds, submittedTargetIds)) {
			return false
		}

		this.canvas.elementManager.commitGenerationTargets(targets)
		this.canvas.generationRuntimeManager.completeAttempt(attemptId)
		return true
	}

	/** 根据 attempt 声明的 failurePolicy 统一完成失败收尾。 */
	public rejectAttempt(attemptId: string): GenerationAttemptFailureResult {
		const attempt = this.canvas.generationRuntimeManager.getAttempt(attemptId)
		if (!attempt) {
			return { resolution: "stale", elementIds: [] }
		}

		const currentTargetIds = this.getCurrentTargetIds(attempt)
		let resolution = this.getResolutionForPolicy(attempt.failurePolicy)

		try {
			switch (attempt.failurePolicy) {
				case "restore-existing":
					break
				case "promote-empty":
					this.promoteEmptyTargets(currentTargetIds)
					break
				case "remove-placeholder":
					this.removePlaceholderTargets(currentTargetIds)
					break
			}
		} catch {
			// 失败收尾本身不能留下永远不进入 DSL 的 runtime-only 僵尸元素。
			try {
				this.removePlaceholderTargets(currentTargetIds)
			} catch {
				// 最终仍会清除 Runtime，避免 UI 永久停留在生成中。
			}
			resolution = "fallback-removed"
		} finally {
			// 删除临时元素时 element:deleted 可能已经移除了 attempt；此处保持幂等。
			this.canvas.generationRuntimeManager.failAttempt(attemptId)
		}

		return { resolution, elementIds: currentTargetIds }
	}

	/**
	 * 创建元素后、attempt 建立前发生内部异常时的兜底。
	 * 仅处理当前没有 Runtime owner 的 generation-result，占位已被新 attempt 接管时保持 no-op。
	 */
	public resolveDetachedPlaceholderFailure(
		elementId: string,
		failurePolicy: Exclude<GenerationFailurePolicy, "restore-existing">,
	): GenerationAttemptFailureResult {
		if (
			this.canvas.generationRuntimeManager.getTargetState(elementId) ||
			!this.isCurrentGenerationPlaceholder(elementId)
		) {
			return { resolution: "stale", elementIds: [] }
		}

		try {
			if (failurePolicy === "promote-empty") {
				this.promoteEmptyTargets([elementId])
				return { resolution: "promoted-empty", elementIds: [elementId] }
			}

			this.removePlaceholderTargets([elementId])
			return { resolution: "removed-placeholder", elementIds: [elementId] }
		} catch {
			try {
				this.removePlaceholderTargets([elementId])
			} catch {
				// 保持兜底幂等；Runtime owner 本来就不存在。
			}
			return { resolution: "fallback-removed", elementIds: [elementId] }
		}
	}

	private getCurrentTargetIds(attempt: GenerationAttempt): string[] {
		return attempt.targets
			.filter((target) =>
				this.canvas.generationRuntimeManager.isCurrent(attempt.attemptId, target.elementId),
			)
			.map((target) => target.elementId)
	}

	private isSameTargetSet(currentTargetIds: string[], submittedTargetIds: string[]): boolean {
		if (currentTargetIds.length !== submittedTargetIds.length) return false
		const submitted = new Set(submittedTargetIds)
		return (
			submitted.size === submittedTargetIds.length &&
			currentTargetIds.every((id) => submitted.has(id))
		)
	}

	private getResolutionForPolicy(
		failurePolicy: GenerationFailurePolicy,
	): GenerationAttemptFailureResolution {
		switch (failurePolicy) {
			case "restore-existing":
				return "restored-existing"
			case "promote-empty":
				return "promoted-empty"
			case "remove-placeholder":
				return "removed-placeholder"
		}
	}

	private promoteEmptyTargets(elementIds: string[]): void {
		const targets: CommitGenerationTarget[] = []
		const unsupportedPlaceholderIds: string[] = []

		for (const elementId of elementIds) {
			if (!this.isCurrentGenerationPlaceholder(elementId)) continue
			const element = this.canvas.elementManager.getElementData(elementId)
			if (!element) continue

			const persistedPatch = this.buildEmptyElementPatch(element)
			if (!persistedPatch) {
				unsupportedPlaceholderIds.push(elementId)
				continue
			}

			targets.push({ elementId, persistedPatch })
		}

		if (targets.length > 0) {
			this.canvas.elementManager.commitGenerationTargets(targets)
		}
		if (unsupportedPlaceholderIds.length > 0) {
			this.canvas.elementManager.batchDelete(unsupportedPlaceholderIds)
		}
	}

	private buildEmptyElementPatch(element: LayerElement): Partial<LayerElement> | null {
		switch (element.type) {
			case ElementTypeEnum.Image:
				return {
					generateImageRequest: undefined,
					imageGenerationTaskMeta: undefined,
					status: undefined,
					errorMessage: undefined,
				} as Partial<LayerElement>
			case ElementTypeEnum.Video:
				return {
					generateVideoRequest: undefined,
					videoGenerationResultMeta: undefined,
					status: undefined,
					errorMessage: undefined,
				} as Partial<LayerElement>
			default:
				return null
		}
	}

	private removePlaceholderTargets(elementIds: string[]): void {
		const removableElementIds = elementIds.filter((elementId) =>
			this.isCurrentGenerationPlaceholder(elementId),
		)
		if (removableElementIds.length > 0) {
			this.canvas.elementManager.batchDelete(removableElementIds)
		}
	}

	private isCurrentGenerationPlaceholder(elementId: string): boolean {
		return (
			this.canvas.elementManager.hasElement(elementId) &&
			this.canvas.elementManager.getTemporaryElementMetadata(elementId)?.kind ===
				"generation-result"
		)
	}
}
