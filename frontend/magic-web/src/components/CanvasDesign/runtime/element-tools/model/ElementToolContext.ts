import type { Canvas } from "../../core/Canvas"
import { getContentGenerationState } from "../../document/elementContent"
import type { LayerElement } from "../../document/types"
import { createContentIndex } from "../resolver/ElementToolResolver"
import type {
	ElementToolContext,
	ElementToolElementSnapshot,
	ElementToolSession,
	GenerationAttemptState,
} from "./ElementToolTypes"

function toElementSnapshot(element: LayerElement): ElementToolElementSnapshot {
	return {
		id: element.id,
		type: element.type,
		locked: element.locked,
		width: element.width,
		height: element.height,
	}
}

export interface CreateElementToolContextOptions {
	canvas?: Canvas | null
	selectedElements: readonly LayerElement[]
	isDragging?: boolean
	isSelecting?: boolean
	activeToolSession?: ElementToolSession | null
	isReplacing?: boolean
	isEditing?: boolean
	isCropping?: boolean
	isExtending?: boolean
	isErasing?: boolean
	isFullscreenPreviewOpen?: boolean
	convertHightSupported?: boolean
	removeBackgroundSupported?: boolean
	eraserSupported?: boolean
	expandSupported?: boolean
	showMediaOriginalSize?: boolean
	isStoryboardOutputFrame?: boolean
	canConcurrentGenerate?: boolean
	runtimeRevision?: number
	toolRuntimeStates?: ElementToolContext["runtime"]["toolsById"]
}

export function createElementToolContext(
	options: CreateElementToolContextOptions,
): ElementToolContext | null {
	const [element] = options.selectedElements
	if (!element) return null

	const selectedSnapshots = options.selectedElements.map(toElementSnapshot)
	const contentIndex = createContentIndex(element as never)
	const generationState =
		"contents" in element
			? getContentGenerationState(element as never)
			: {
					activeContentIsGenerating: false,
					hasSiblingGenerating: false,
					hasAnyGenerating: false,
					activeContent: undefined,
				}
	const runtimeTargetStates =
		options.canvas?.generationRuntimeManager?.getTargetStates(element.id) ?? []
	const generatingContentIds = [...contentIndex.states.entries()]
		.filter(([, state]) => state === "pending" || state === "processing")
		.map(([contentId]) => contentId)
	for (const targetState of runtimeTargetStates) {
		if (targetState.contentId && !generatingContentIds.includes(targetState.contentId)) {
			generatingContentIds.push(targetState.contentId)
		}
	}
	const activeContentId = contentIndex.activeContentId
	const activeContentState = activeContentId ? contentIndex.states.get(activeContentId) : "empty"
	const activeContent = contentIndex.active as
		| (typeof contentIndex.active & {
				contentRevision?: string | number
				revision?: string | number
		  })
		| undefined
	const siblingGeneratingContentIds = generatingContentIds.filter(
		(contentId) => contentId !== activeContentId,
	)
	const activeContentIsGenerating =
		generationState.activeContentIsGenerating ||
		(activeContentId ? generatingContentIds.includes(activeContentId) : false)
	const hasAnyGenerating = generationState.hasAnyGenerating || generatingContentIds.length > 0
	const attemptsByContentId = new Map<string, GenerationAttemptState>()
	for (const targetState of runtimeTargetStates) {
		if (!targetState.contentId) continue
		attemptsByContentId.set(targetState.contentId, {
			attemptId: targetState.attemptId,
			elementId: targetState.elementId,
			contentId: targetState.contentId,
			operation: targetState.operation,
			phase: targetState.phase,
		})
	}

	return {
		commandBus: options.canvas?.elementToolCommandBus,
		element: toElementSnapshot(element),
		selection: {
			elements: selectedSnapshots,
			isSingleElement: selectedSnapshots.length === 1,
			isDragging: Boolean(options.isDragging),
			isSelecting: Boolean(options.isSelecting),
			activeToolSession: options.activeToolSession,
		},
		content: {
			...contentIndex,
			activeResource: activeContent
				? {
						src: activeContent.src,
						width: activeContent.width,
						height: activeContent.height,
					}
				: undefined,
			activeRevision: activeContent?.contentRevision ?? activeContent?.revision,
		},
		generation: {
			activeContentIsGenerating,
			siblingGeneratingContentIds,
			generatingContentIds,
			attemptsByContentId,
		},
		interaction: {
			isReplacing: Boolean(options.isReplacing),
			isDragging: Boolean(options.isDragging),
			isSelecting: Boolean(options.isSelecting),
			isEditing: Boolean(options.isEditing),
			isCropping: Boolean(options.isCropping),
			isExtending: Boolean(options.isExtending),
			isErasing: Boolean(options.isErasing),
			isFullscreenPreviewOpen: Boolean(options.isFullscreenPreviewOpen),
		},
		runtime: {
			revision: options.runtimeRevision ?? 0,
			toolsById: options.toolRuntimeStates ?? new Map(),
		},
		capabilities: {
			canSwitchVersion: contentIndex.byId.size > 1,
			canSetMainVersion:
				contentIndex.byId.size > 1 &&
				!activeContentIsGenerating &&
				activeContentState === "completed",
			canDeleteVersion: contentIndex.byId.size > 1 && !hasAnyGenerating,
			canGenerateContent:
				!activeContentIsGenerating &&
				(Boolean(contentIndex.active?.src) || element.type === "audio"),
			canConcurrentGenerate:
				options.canConcurrentGenerate ??
				(element.type === "image" || element.type === "video"),
		},
		flags: {
			convertHightSupported: Boolean(options.convertHightSupported),
			removeBackgroundSupported: options.removeBackgroundSupported ?? true,
			eraserSupported: options.eraserSupported ?? true,
			expandSupported: options.expandSupported ?? true,
			showMediaOriginalSize: Boolean(options.showMediaOriginalSize),
			isStoryboardOutputFrame: Boolean(options.isStoryboardOutputFrame),
		},
	}
}
