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
	getCanvasResourceIdentity,
} from "../../../runtime/shared/path/canvasResourcePath"
import { getLinkedTextPromptText, type LinkedTextConnection } from "./linkedTextPrompt"

export type LinkedEditorTargetKind = "image" | "video"
export type LinkedEditorMediaKind = "image" | "video" | "audio"
export type LinkedEditorMediaStatus = "active" | "inactive"
export type LinkedEditorMediaInactiveReason =
	"unsupported-type" | "unsupported-mode" | "over-limit" | "missing-resource" | "duplicate"

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
	return getCanvasResourceIdentity(path)
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
	 * 关联输入的稳定 ID。一级直接元素等于真实连线 ID；多级元素与画框子元素使用派生 ID。
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
	/** 是否对应当前编辑器中的 mention；不代表一定通过媒体策略进入提交 */
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

/** 关联卡片的勾选状态直接来自 mention 驱动的媒体解析结果。 */
export function resolveLinkedMediaSelectionDisplay(
	item: Pick<LinkedEditorMediaItem, "selected" | "selectionDisabledReason">,
): { checked: boolean; disabled: boolean } {
	const selected = item.selected === true
	return {
		checked: selected,
		disabled: !selected && Boolean(item.selectionDisabledReason),
	}
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
const LINKED_UPSTREAM_SOURCE_ID_PREFIX = "upstream-source"

export interface LinkedEditorSourceCollectionConfig {
	/** direct 保持现有一级上游行为；upstream 按 maxDepth 向上遍历。 */
	mode: "direct" | "upstream"
	/** 从当前编辑元素开始计算的最大连接边深度，仅 upstream 模式生效。 */
	maxDepth: number
}

/**
 * 关联输入上游收集行为的静态开关。
 * 切回现有行为时将 mode 改为 direct；多级模式通过 maxDepth 控制向上收集层数。
 */
const LINKED_EDITOR_SOURCE_COLLECTION_CONFIG: LinkedEditorSourceCollectionConfig = {
	mode: "upstream",
	maxDepth: Number.POSITIVE_INFINITY,
}

export function createLinkedFrameSourceId(connectionId: string, sourceElementId: string): string {
	return `${LINKED_FRAME_SOURCE_ID_PREFIX}:${connectionId}:${sourceElementId}`
}

export function createLinkedUpstreamSourceId(
	targetElementId: string,
	sourceElementId: string,
): string {
	return `${LINKED_UPSTREAM_SOURCE_ID_PREFIX}:${targetElementId}:${sourceElementId}`
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

function collectDirectLinkedEditorSourceElements(
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

interface CollectedLinkedEditorSourceElement {
	item: LinkedEditorSourceElement
	depth: number
	origin: "connected-element" | "frame-descendant"
	order: number
}

function shouldReplaceCollectedSource(
	current: CollectedLinkedEditorSourceElement,
	next: CollectedLinkedEditorSourceElement,
): boolean {
	if (next.depth !== current.depth) return next.depth < current.depth
	if (next.origin !== current.origin) return next.origin === "connected-element"
	return false
}

/**
 * 按连接方向从目标元素向上进行广度优先遍历，并收集最大深度内可消费的元素。
 * Frame 仍只在到达该图节点时展开内容，不会把 Frame 子元素当作新的连接图节点继续遍历。
 */
export function collectLinkedEditorUpstreamSourceElements(
	canvas: Canvas,
	targetElementId: string,
	maxDepth: number,
): LinkedEditorSourceElement[] {
	const normalizedMaxDepth =
		maxDepth === Number.POSITIVE_INFINITY
			? Number.POSITIVE_INFINITY
			: Number.isFinite(maxDepth)
				? Math.max(1, Math.floor(maxDepth))
				: 1
	const queue: Array<{ elementId: string; depth: number }> = [
		{ elementId: targetElementId, depth: 0 },
	]
	const visitedGraphElementIds = new Set<string>([targetElementId])
	const collectedBySourceElementId = new Map<string, CollectedLinkedEditorSourceElement>()
	let queueIndex = 0
	let encounterOrder = 0

	const collectCandidate = (
		item: LinkedEditorSourceElement,
		depth: number,
		origin: CollectedLinkedEditorSourceElement["origin"],
	): void => {
		const next: CollectedLinkedEditorSourceElement = {
			item,
			depth,
			origin,
			order: encounterOrder,
		}
		encounterOrder += 1
		const current = collectedBySourceElementId.get(item.sourceElementId)
		if (!current || shouldReplaceCollectedSource(current, next)) {
			collectedBySourceElementId.set(item.sourceElementId, next)
		}
	}

	while (queueIndex < queue.length) {
		const current = queue[queueIndex]
		queueIndex += 1
		if (!current || current.depth >= normalizedMaxDepth) continue

		const upstreamConnections = canvas.connectionManager.getUpstreamConnections(
			current.elementId,
		)
		for (const connection of upstreamConnections) {
			const sourceElement = canvas.elementManager.getElementData(connection.sourceElementId)
			if (!sourceElement || visitedGraphElementIds.has(sourceElement.id)) continue

			const sourceDepth = current.depth + 1
			visitedGraphElementIds.add(sourceElement.id)
			const sourceCandidateId =
				sourceDepth === 1
					? connection.id
					: createLinkedUpstreamSourceId(targetElementId, sourceElement.id)

			if (isLinkedEditorConsumableElement(sourceElement)) {
				collectCandidate(
					{
						connectionId: sourceCandidateId,
						sourceElementId: sourceElement.id,
						element: sourceElement,
					},
					sourceDepth,
					"connected-element",
				)
			} else if (sourceElement.type === ElementTypeEnum.Frame) {
				for (const frameSource of collectLinkedFrameSourceElements(
					sourceCandidateId,
					sourceElement,
					{ excludedElementIds: [targetElementId] },
				)) {
					collectCandidate(frameSource, sourceDepth, "frame-descendant")
				}
			}

			if (sourceDepth < normalizedMaxDepth) {
				queue.push({ elementId: sourceElement.id, depth: sourceDepth })
			}
		}
	}

	return Array.from(collectedBySourceElementId.values())
		.sort((left, right) => left.depth - right.depth || left.order - right.order)
		.map(({ item }) => item)
}

export function collectLinkedEditorSourceElements(
	canvas: Canvas,
	targetElementId: string,
	config: LinkedEditorSourceCollectionConfig = LINKED_EDITOR_SOURCE_COLLECTION_CONFIG,
): LinkedEditorSourceElement[] {
	if (config.mode === "direct") {
		return collectDirectLinkedEditorSourceElements(canvas, targetElementId)
	}
	return collectLinkedEditorUpstreamSourceElements(canvas, targetElementId, config.maxDepth)
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

export interface LinkedEditorMediaAssociationResolution extends LinkedEditorMediaSelectionResolution {
	mentionedReferencePaths: string[]
	unmatchedManualReferences: LinkedEditorMediaReference[]
}

export interface ResolveLinkedMediaAssociationOptions {
	candidates: LinkedEditorMediaCandidate[]
	mentionedPaths: string[]
	manualReferences?: LinkedEditorMediaReference[]
	targetKind: LinkedEditorTargetKind
	mediaPolicy?: LinkedEditorMediaPolicy
}

/**
 * 以编辑器 mention 为唯一媒体选择状态，将画布连接媒体解析为候选展示与提交输入。
 * 同一路径最多绑定一个稳定候选；连接本身不参与状态持久化。
 */
export function resolveLinkedMediaAssociation(
	options: ResolveLinkedMediaAssociationOptions,
): LinkedEditorMediaAssociationResolution {
	const {
		candidates,
		mentionedPaths: mentionedReferencePaths,
		manualReferences = options.mediaPolicy?.manualReferences ?? [],
		targetKind,
		mediaPolicy,
	} = options
	const effectiveMediaPolicy = mediaPolicy
		? { ...mediaPolicy, manualReferences }
		: manualReferences.length > 0
			? { supportedKinds: [], manualReferences }
			: undefined
	const selectionOptions = { targetKind, mediaPolicy: effectiveMediaPolicy }
	const stableCandidates: LinkedEditorMediaCandidate[] = []
	const candidateIdentities = new Set<string>()
	for (const candidate of candidates) {
		const identity = getLinkedMediaReferenceIdentity(candidate.path)
		if (identity) {
			if (candidateIdentities.has(identity)) continue
			candidateIdentities.add(identity)
		}
		stableCandidates.push(candidate)
	}
	const mentionedPaths: string[] = []
	const mentionedIdentities = new Set<string>()
	mentionedReferencePaths.forEach((path) => {
		const identity = getLinkedMediaReferenceIdentity(path)
		if (!identity || mentionedIdentities.has(identity)) return
		mentionedIdentities.add(identity)
		mentionedPaths.push(path)
	})

	const associatedConnectionIds = stableCandidates.flatMap((candidate) => {
		const identity = getLinkedMediaReferenceIdentity(candidate.path)
		return identity && mentionedIdentities.has(identity) ? [candidate.connectionId] : []
	})
	const associatedConnectionIdSet = new Set(associatedConnectionIds)

	const selectionResolution = resolveLinkedMediaPolicySelection(
		stableCandidates,
		associatedConnectionIds,
		selectionOptions,
	)
	const items = selectionResolution.items.map((item) =>
		associatedConnectionIdSet.has(item.connectionId)
			? { ...item, selected: true, selectionDisabledReason: undefined }
			: item,
	)
	const unmatchedManualReferences = manualReferences.filter(
		(reference) => !candidateIdentities.has(getLinkedMediaReferenceIdentity(reference.path)),
	)
	const activeMediaReferences = mergeLinkedMediaReferences(
		manualReferences,
		selectionResolution.activeMediaReferences,
	)

	return {
		items,
		activeMediaReferences,
		mentionedReferencePaths: mentionedPaths,
		unmatchedManualReferences,
	}
}

/**
 * 根据 mention 已匹配出的临时连接 ID 计算媒体策略结果。
 * 连接 ID 仅用于在一次纯函数计算中定位候选，不作为业务状态持久化或恢复。
 */
export function resolveLinkedMediaPolicySelection(
	candidates: LinkedEditorMediaCandidate[],
	mentionedConnectionIds: string[],
	options: {
		targetKind: LinkedEditorTargetKind
		mediaPolicy?: LinkedEditorMediaPolicy
	},
): LinkedEditorMediaSelectionResolution {
	const normalizedCandidates = candidates.map((candidate): LinkedEditorMediaCandidate => ({
		connectionId: candidate.connectionId,
		sourceElementId: candidate.sourceElementId,
		kind: candidate.kind,
		path: candidate.path,
		fileName: candidate.fileName,
		sourceCrop: candidate.sourceCrop,
	}))
	const selectedConnectionIdSet = new Set(mentionedConnectionIds)
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
		const candidateIdentity = getLinkedMediaReferenceIdentity(candidate.path)
		const candidateSelectionOptions = {
			targetKind: options.targetKind,
			mediaPolicy: options.mediaPolicy
				? {
						...options.mediaPolicy,
						manualReferences: options.mediaPolicy.manualReferences?.filter(
							(reference) =>
								getLinkedMediaReferenceIdentity(reference.path) !==
								candidateIdentity,
						),
					}
				: undefined,
		}
		const attemptItem = resolveLinkedMediaItems(
			[...selectedCandidates, candidate],
			candidateSelectionOptions,
		).find((item) => item.connectionId === candidate.connectionId)
		const standaloneReason = standaloneItem?.reason
		const selectionDisabledReason =
			standaloneReason &&
			standaloneReason !== "over-limit" &&
			standaloneReason !== "duplicate"
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

	const mediaSelection = resolveLinkedMediaPolicySelection(mediaCandidates, [], {
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
