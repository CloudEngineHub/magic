import type { Canvas } from "../../../runtime/core/Canvas"
import {
	type CropConfig,
	ElementTypeEnum,
	type FrameElement,
	type ImageElement,
	type LayerElement,
	type TextElement,
	type VideoElement,
} from "../../../runtime/document/types"
import { sortCanvasElementsByZIndexStable } from "../../../runtime/document/elementIndex"
import {
	extractPlainTextFromRichText,
	extractPromptTextFromRichText,
} from "../../../runtime/text/richText"
import {
	getCanvasResourceFileName,
	toCanonicalCanvasResourcePath,
} from "../../../runtime/shared/path/canvasResourcePath"
import { getLinkedTextPromptText, type LinkedTextConnection } from "./linkedTextPrompt"

export type LinkedEditorTargetKind = "image" | "video"
export type LinkedEditorMediaKind = "image" | "video" | "audio"
export type LinkedEditorMediaStatus = "active" | "inactive"
export type LinkedEditorMediaInactiveReason =
	| "unsupported-type"
	| "unsupported-mode"
	| "over-limit"
	| "missing-resource"
	| "duplicate"

export interface LinkedEditorMediaReference {
	kind: LinkedEditorMediaKind
	path: string
	sourceCrop?: CropConfig
}

export interface LinkedEditorMediaPolicy {
	supportedKinds: LinkedEditorMediaKind[]
	manualReferences?: LinkedEditorMediaReference[]
	maxTotalCount?: number
	maxCountByKind?: Partial<Record<LinkedEditorMediaKind, number>>
	validateActiveReferences?: (
		references: LinkedEditorMediaReference[],
	) => LinkedEditorMediaInactiveReason | null
}

/** 用于合并连线媒体、手动参考媒体和 @mention 的稳定资源身份。 */
export function getLinkedMediaReferenceIdentity(path?: string): string {
	return path ? toCanonicalCanvasResourcePath(path) : ""
}

export function mergeLinkedMediaPaths(...pathGroups: string[][]): string[] {
	const merged: string[] = []
	const seen = new Set<string>()
	for (const paths of pathGroups) {
		for (const path of paths) {
			const identity = getLinkedMediaReferenceIdentity(path)
			if (!identity || seen.has(identity)) continue
			seen.add(identity)
			merged.push(path)
		}
	}
	return merged
}

export interface LinkedEditorMediaCandidate {
	/**
	 * 关联输入的稳定 ID。直接元素等于真实连线 ID；画框子元素由连线 ID 与子元素 ID 派生。
	 * 选择、排序和首尾帧绑定均以此 ID 为准。
	 */
	connectionId: string
	sourceElementId: string
	kind: LinkedEditorMediaKind
	path?: string
	fileName?: string
	sourceCrop?: CropConfig
}

export interface LinkedEditorMediaItem extends LinkedEditorMediaCandidate {
	status: LinkedEditorMediaStatus
	reason?: LinkedEditorMediaInactiveReason
	/** 是否被用户选择参与参考媒体提交 */
	selected?: boolean
	/** 未选择项不可勾选时的动态原因（不作为媒体状态展示） */
	selectionDisabledReason?: LinkedEditorMediaInactiveReason
}

/** 按资源身份折叠连线媒体；同一路径存在多个连接时优先保留已选择项。 */
export function dedupeLinkedMediaItemsByPath<T extends LinkedEditorMediaItem>(items: T[]): T[] {
	const deduped: T[] = []
	const indexByIdentity = new Map<string, number>()
	for (const item of items) {
		const identity = getLinkedMediaReferenceIdentity(item.path)
		if (!identity) continue
		const existingIndex = indexByIdentity.get(identity)
		if (existingIndex === undefined) {
			indexByIdentity.set(identity, deduped.length)
			deduped.push(item)
			continue
		}
		if (item.selected && !deduped[existingIndex]?.selected) {
			deduped[existingIndex] = item
		}
	}
	return deduped
}

export interface LinkedMediaDisplayResolution<TManual, TLinked extends LinkedEditorMediaItem> {
	manualItems: TManual[]
	linkedItems: Array<TLinked & { path: string }>
}

/** 同一路径存在画布连接时，由关联卡片统一承载展示，避免退化为纯手动资源卡片。 */
export function resolveLinkedMediaDisplay<TManual, TLinked extends LinkedEditorMediaItem>(
	manualItems: TManual[],
	getManualPath: (item: TManual) => string,
	linkedItems: TLinked[],
): LinkedMediaDisplayResolution<TManual, TLinked> {
	const visibleLinkedItems = dedupeLinkedMediaItemsByPath(
		linkedItems.filter((item): item is TLinked & { path: string } => Boolean(item.path)),
	)
	const linkedPathIdentities = new Set(
		visibleLinkedItems.map((item) => getLinkedMediaReferenceIdentity(item.path)),
	)

	return {
		manualItems: manualItems.filter(
			(item) =>
				!linkedPathIdentities.has(getLinkedMediaReferenceIdentity(getManualPath(item))),
		),
		linkedItems: visibleLinkedItems,
	}
}

/** @mention 自身已经使资源参与提交，因此统一卡片应显示为勾选；取消时由调用方同步删除 mention。 */
export function resolveLinkedMediaSelectionDisplay(
	item: Pick<LinkedEditorMediaItem, "selected" | "selectionDisabledReason">,
	isMentioned: boolean,
): { checked: boolean; disabled: boolean } {
	const selected = item.selected === true
	return {
		checked: selected || isMentioned,
		disabled: !selected && !isMentioned && Boolean(item.selectionDisabledReason),
	}
}

/** 删除提示词中的 @mention 时，仅取消对应已选择连线媒体。 */
export function getLinkedMediaConnectionIdsToDeselectAfterMentionChange(
	items: LinkedEditorMediaItem[],
	previousMentionedPaths: string[],
	nextMentionedPaths: string[],
): string[] {
	const nextMentionedPathIdentities = new Set(
		nextMentionedPaths.map(getLinkedMediaReferenceIdentity).filter(Boolean),
	)
	const removedMentionedPathIdentities = new Set(
		previousMentionedPaths
			.map(getLinkedMediaReferenceIdentity)
			.filter((identity) => Boolean(identity) && !nextMentionedPathIdentities.has(identity)),
	)
	if (removedMentionedPathIdentities.size === 0) return []

	return items.flatMap((item) =>
		item.selected &&
		removedMentionedPathIdentities.has(getLinkedMediaReferenceIdentity(item.path))
			? [item.connectionId]
			: [],
	)
}

export interface LinkedEditorInputsResolution {
	textConnections: LinkedTextConnection[]
	textPrompt: string
	mediaItems: LinkedEditorMediaItem[]
	activeMediaReferences: LinkedEditorMediaReference[]
}

interface ResolveLinkedEditorInputsOptions {
	canvas: Canvas | null
	targetElementId: string
	targetKind: LinkedEditorTargetKind
	enabled?: boolean
	mediaPolicy?: LinkedEditorMediaPolicy
}

export interface LinkedEditorSourceElement {
	connectionId: string
	sourceElementId: string
	element: LayerElement
}

const LINKED_FRAME_SOURCE_ID_PREFIX = "frame-source"

export function createLinkedFrameSourceId(connectionId: string, sourceElementId: string): string {
	return `${LINKED_FRAME_SOURCE_ID_PREFIX}:${connectionId}:${sourceElementId}`
}

function isLinkedEditorConsumableElement(element: LayerElement): boolean {
	return (
		element.type === ElementTypeEnum.Text ||
		element.type === ElementTypeEnum.Image ||
		element.type === ElementTypeEnum.Video
	)
}

/**
 * 按画框内视觉层级从后到前递归收集可作为编辑器输入的元素。
 * 隐藏容器/元素不属于画框的可见内容；Frame 与 Group 仅承载层级，不生成候选项。
 */
export function collectLinkedFrameSourceElements(
	connectionId: string,
	frame: FrameElement,
	options?: { excludedElementIds?: Iterable<string> },
): LinkedEditorSourceElement[] {
	const result: LinkedEditorSourceElement[] = []
	const visitedElementIds = new Set<string>()
	const excludedElementIds = new Set(options?.excludedElementIds)

	const collect = (elements: LayerElement[] | undefined): void => {
		for (const element of sortCanvasElementsByZIndexStable(elements ?? [])) {
			if (
				visitedElementIds.has(element.id) ||
				excludedElementIds.has(element.id) ||
				element.visible === false
			) {
				continue
			}
			visitedElementIds.add(element.id)

			if (element.type === ElementTypeEnum.Frame || element.type === ElementTypeEnum.Group) {
				collect(element.children)
				continue
			}

			if (!isLinkedEditorConsumableElement(element)) continue
			result.push({
				connectionId: createLinkedFrameSourceId(connectionId, element.id),
				sourceElementId: element.id,
				element,
			})
		}
	}

	collect(frame.children)
	return result
}

function collectLinkedEditorSourceElements(
	canvas: Canvas,
	targetElementId: string,
): LinkedEditorSourceElement[] {
	const upstreamConnections = canvas.connectionManager.getUpstreamConnections(targetElementId)
	const result: LinkedEditorSourceElement[] = []
	const collectedSourceElementIds = new Set<string>()
	const directSourceElementIds = new Set(
		upstreamConnections.flatMap((connection) => {
			const sourceElement = canvas.elementManager.getElementData(connection.sourceElementId)
			return sourceElement && isLinkedEditorConsumableElement(sourceElement)
				? [sourceElement.id]
				: []
		}),
	)

	for (const connection of upstreamConnections) {
		const sourceElement = canvas.elementManager.getElementData(connection.sourceElementId)
		if (!sourceElement) continue

		if (isLinkedEditorConsumableElement(sourceElement)) {
			if (collectedSourceElementIds.has(sourceElement.id)) continue
			collectedSourceElementIds.add(sourceElement.id)
			result.push({
				connectionId: connection.id,
				sourceElementId: sourceElement.id,
				element: sourceElement,
			})
			continue
		}

		if (sourceElement.type !== ElementTypeEnum.Frame) continue

		for (const frameSource of collectLinkedFrameSourceElements(connection.id, sourceElement, {
			excludedElementIds: [targetElementId],
		})) {
			// 同一元素既单独连接、又属于已连接画框时，保留更明确的直接连线身份。
			if (
				directSourceElementIds.has(frameSource.sourceElementId) ||
				collectedSourceElementIds.has(frameSource.sourceElementId)
			) {
				continue
			}
			collectedSourceElementIds.add(frameSource.sourceElementId)
			result.push(frameSource)
		}
	}

	return result
}

function getFileName(path: string): string {
	return getCanvasResourceFileName(path) || path
}

function getMediaSourceTypeUnsupportedReason(
	targetKind: LinkedEditorTargetKind,
	mediaKind: LinkedEditorMediaKind,
): LinkedEditorMediaInactiveReason | null {
	if (targetKind === "image" && mediaKind !== "image") return "unsupported-type"
	return null
}

function getFiniteLimit(value: number | undefined): number {
	return Number.isFinite(value) ? Math.max(0, Number(value)) : Infinity
}

export function resolveLinkedMediaItems(
	candidates: LinkedEditorMediaCandidate[],
	options: {
		targetKind: LinkedEditorTargetKind
		mediaPolicy?: LinkedEditorMediaPolicy
	},
): LinkedEditorMediaItem[] {
	const { targetKind, mediaPolicy } = options
	const supportedKindSet = new Set(mediaPolicy?.supportedKinds ?? [])
	const activePathSet = new Set<string>()
	const manualReferences = mediaPolicy?.manualReferences ?? []
	const activeReferences: LinkedEditorMediaReference[] = []

	const totalLimit = getFiniteLimit(mediaPolicy?.maxTotalCount)
	const activeCountByKind: Record<LinkedEditorMediaKind, number> = {
		image: 0,
		video: 0,
		audio: 0,
	}
	manualReferences.forEach((reference) => {
		const identity = getLinkedMediaReferenceIdentity(reference.path)
		if (!identity || activePathSet.has(identity)) return
		activePathSet.add(identity)
		activeReferences.push(reference)
		activeCountByKind[reference.kind] += 1
	})
	const maxCountByKind = mediaPolicy?.maxCountByKind ?? {}

	return candidates.map((candidate) => {
		const targetUnsupportedReason = getMediaSourceTypeUnsupportedReason(
			targetKind,
			candidate.kind,
		)
		if (targetUnsupportedReason) {
			return { ...candidate, status: "inactive", reason: targetUnsupportedReason }
		}
		if (!candidate.path) {
			return { ...candidate, status: "inactive", reason: "missing-resource" }
		}
		if (!supportedKindSet.has(candidate.kind)) {
			return { ...candidate, status: "inactive", reason: "unsupported-mode" }
		}
		if (activePathSet.has(getLinkedMediaReferenceIdentity(candidate.path))) {
			return { ...candidate, status: "inactive", reason: "duplicate" }
		}
		if (activePathSet.size >= totalLimit) {
			return { ...candidate, status: "inactive", reason: "over-limit" }
		}

		const kindLimit = getFiniteLimit(maxCountByKind[candidate.kind])
		if (activeCountByKind[candidate.kind] >= kindLimit) {
			return { ...candidate, status: "inactive", reason: "over-limit" }
		}

		const nextReference = {
			kind: candidate.kind,
			path: candidate.path,
			sourceCrop: candidate.sourceCrop,
		}
		const validationReason = mediaPolicy?.validateActiveReferences?.([
			...activeReferences,
			nextReference,
		])
		if (validationReason) {
			return { ...candidate, status: "inactive", reason: validationReason }
		}

		activePathSet.add(getLinkedMediaReferenceIdentity(candidate.path))
		activeReferences.push(nextReference)
		activeCountByKind[candidate.kind] += 1
		return { ...candidate, status: "active" }
	})
}

export interface LinkedEditorMediaSelectionResolution {
	items: LinkedEditorMediaItem[]
	activeMediaReferences: LinkedEditorMediaReference[]
}

/**
 * 将连线媒体候选拆分为“用户已选择”和“待选择”两类。
 * 未选择项不会占用媒体数量限制；只有用户选择且通过策略校验的媒体才会进入 activeMediaReferences。
 */
export function resolveLinkedMediaSelection(
	candidates: LinkedEditorMediaCandidate[],
	selectedConnectionIds: string[],
	options: {
		targetKind: LinkedEditorTargetKind
		mediaPolicy?: LinkedEditorMediaPolicy
	},
): LinkedEditorMediaSelectionResolution {
	const normalizedCandidates = candidates.map(
		(candidate): LinkedEditorMediaCandidate => ({
			connectionId: candidate.connectionId,
			sourceElementId: candidate.sourceElementId,
			kind: candidate.kind,
			path: candidate.path,
			fileName: candidate.fileName,
			sourceCrop: candidate.sourceCrop,
		}),
	)
	const selectedConnectionIdSet = new Set(selectedConnectionIds)
	const selectedCandidates = normalizedCandidates.filter((candidate) =>
		selectedConnectionIdSet.has(candidate.connectionId),
	)
	const selectedPathIdentities = new Set(
		selectedCandidates.map((candidate) => getLinkedMediaReferenceIdentity(candidate.path)),
	)
	const selectedMediaPolicy = options.mediaPolicy
		? {
				...options.mediaPolicy,
				manualReferences: options.mediaPolicy.manualReferences?.filter(
					(reference) =>
						!selectedPathIdentities.has(
							getLinkedMediaReferenceIdentity(reference.path),
						),
				),
			}
		: undefined
	const selectedResolutionOptions = {
		targetKind: options.targetKind,
		mediaPolicy: selectedMediaPolicy,
	}
	const selectedItems = resolveLinkedMediaItems(selectedCandidates, selectedResolutionOptions)
	const selectedItemById = new Map(selectedItems.map((item) => [item.connectionId, item]))

	const items = normalizedCandidates.map((candidate) => {
		const selectedItem = selectedItemById.get(candidate.connectionId)
		if (selectedItem?.status === "active") {
			return {
				...selectedItem,
				selected: true,
			}
		}

		const standaloneItem = resolveLinkedMediaItems([candidate], options)[0]
		const attemptItem = resolveLinkedMediaItems(
			[...selectedCandidates, candidate],
			selectedResolutionOptions,
		).find((item) => item.connectionId === candidate.connectionId)
		const standaloneReason = standaloneItem?.reason
		const selectionDisabledReason =
			standaloneReason && standaloneReason !== "over-limit"
				? standaloneReason
				: attemptItem?.reason

		return {
			...candidate,
			status: "inactive" as const,
			reason:
				standaloneReason && standaloneReason !== "over-limit"
					? standaloneReason
					: undefined,
			selected: false,
			selectionDisabledReason,
		}
	})

	const activeMediaReferences = selectedItems
		.filter(
			(item): item is LinkedEditorMediaItem & { path: string } =>
				item.status === "active" && Boolean(item.path),
		)
		.map((item) => ({
			kind: item.kind,
			path: item.path,
			sourceCrop: item.sourceCrop,
		}))

	return { items, activeMediaReferences }
}

export function mergeLinkedMediaReferences(
	manualReferences: LinkedEditorMediaReference[],
	linkedReferences: LinkedEditorMediaReference[],
): LinkedEditorMediaReference[] {
	const merged: LinkedEditorMediaReference[] = []
	const linkedByIdentity = new Map<string, LinkedEditorMediaReference>()
	for (const reference of linkedReferences) {
		const identity = getLinkedMediaReferenceIdentity(reference.path)
		if (!identity || linkedByIdentity.has(identity)) continue
		linkedByIdentity.set(identity, reference)
	}
	const seenPathSet = new Set<string>()

	for (const reference of manualReferences) {
		const identity = getLinkedMediaReferenceIdentity(reference.path)
		if (!identity || seenPathSet.has(identity)) continue
		seenPathSet.add(identity)
		merged.push(linkedByIdentity.get(identity) ?? reference)
	}

	for (const reference of linkedReferences) {
		const identity = getLinkedMediaReferenceIdentity(reference.path)
		if (!identity || seenPathSet.has(identity)) continue
		seenPathSet.add(identity)
		merged.push(reference)
	}

	return merged
}

export function resolveLinkedEditorInputs(
	options: ResolveLinkedEditorInputsOptions,
): LinkedEditorInputsResolution {
	const { canvas, targetElementId, targetKind, enabled = true, mediaPolicy } = options
	const textConnections: LinkedTextConnection[] = []
	const mediaCandidates: LinkedEditorMediaCandidate[] = []

	if (canvas && enabled) {
		const sourceElements = collectLinkedEditorSourceElements(canvas, targetElementId)
		sourceElements.forEach(({ connectionId, sourceElementId, element: sourceElement }) => {
			if (sourceElement.type === ElementTypeEnum.Text) {
				const content = (sourceElement as TextElement).content
				if (!extractPlainTextFromRichText(content).trim()) return
				textConnections.push({
					connectionId,
					sourceElementId,
					text: extractPromptTextFromRichText(content),
				})
				return
			}

			if (sourceElement.type === ElementTypeEnum.Image) {
				const imageElement = sourceElement as ImageElement
				const path = imageElement.src
				mediaCandidates.push({
					connectionId,
					sourceElementId,
					kind: "image",
					path,
					fileName: path ? getFileName(path) : undefined,
					sourceCrop: imageElement.crop,
				})
				return
			}

			if (sourceElement.type === ElementTypeEnum.Video) {
				const path = (sourceElement as VideoElement).src
				mediaCandidates.push({
					connectionId,
					sourceElementId,
					kind: "video",
					path,
					fileName: path ? getFileName(path) : undefined,
				})
			}
		})
	}

	const mediaSelection = resolveLinkedMediaSelection(mediaCandidates, [], {
		targetKind,
		mediaPolicy,
	})

	return {
		textConnections,
		textPrompt: getLinkedTextPromptText(textConnections),
		mediaItems: mediaSelection.items,
		activeMediaReferences: mediaSelection.activeMediaReferences,
	}
}
