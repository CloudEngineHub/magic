import type { Box } from "konva/lib/shapes/Transformer"
import type { Canvas } from "../../core/Canvas"
import type { Rect } from "../../shared/ids"
import type { LayerElement } from "../../document/types"
import { calculateSnapThreshold } from "../transform/anchorUtils"
import type { AlignmentInfo, AlignmentType } from "./snapGuideTypes"
import { SnapGuideRenderer } from "./SnapGuideRenderer"
import { SnapResolver, type SnapResolverContext } from "./SnapResolver"
import { GridSpacingResolver } from "./GridSpacingResolver"
import { SequenceSpacingResolver } from "./SequenceSpacingResolver"
import { SpacingSnapResolver } from "./SpacingSnapResolver"
import type {
	SpacingGuide,
	SpacingSnapAxis,
	SpacingSnapCandidate,
	SpacingSnapTarget,
} from "./spacingSnapTypes"

const COINCIDENT_ALIGNMENT_OFFSET_EPSILON = 0.01

type SpacingSnapLock =
	| {
			kind: "linear"
			mode: "between" | "extend-before" | "extend-after"
			targetElementIds: [string, string]
	  }
	| {
			kind: "grid"
			mode: "grid-before" | "grid-after"
			targetElementIds: [string, string]
			sourceAxis: SpacingSnapAxis
			anchorTargetId: string
	  }

/**
 * 吸附引导线管理器
 * 职责：计算吸附 + 更新元素位置
 * 视觉绘制委托给 SnapGuideRenderer
 *
 * 对齐逻辑：
 * - 只考虑同级元素之间的对齐（兄弟元素）
 * - 如果元素在 Frame 内，还会考虑与 Frame 边界的对齐
 * - 不会与不同层级的元素对齐（例如：Frame 外的元素不会与 Frame 内的子元素对齐）
 */
export class SnapGuideManager implements SnapResolverContext {
	private canvas: Canvas
	private guideRenderer: SnapGuideRenderer
	private snapResolver: SnapResolver
	private spacingSnapResolver: SpacingSnapResolver
	private sequenceSpacingResolver: SequenceSpacingResolver
	private gridSpacingResolver: GridSpacingResolver

	// 是否启用吸附
	private enabled = true

	// 是否正在拖拽
	private isDragging = false

	// 当前激活的 anchor（用于缩放时的吸附）
	private activeAnchor: string | null = null

	// 交互期间缓存的参数（viewport 不变，避免每帧重复计算）
	private cachedSnapThreshold = 0
	private cachedGuideThreshold = 0

	// 上一帧吸附结果签名，用于判断辅助线是否需要重绘
	private lastSnappedAlignmentsKey: string | null = null

	// 当前交互的目标集缓存，避免拖拽过程中每帧递归整棵元素树
	private cachedInteractionTargets: LayerElement[] | null = null
	private cachedInteractionTargetIds: string[] | null = null
	private cachedInteractionTargetsById: Map<string, LayerElement> | null = null
	private cachedInteractionTargetOrder: Map<string, number> | null = null
	private cachedInteractionSelectionKey: string | null = null
	private cachedSequenceSpacingTargets: SpacingSnapTarget[] = []
	private activeSpacingSnapTargets: Partial<Record<SpacingSnapAxis, SpacingSnapLock>> = {}
	private currentDragBoundsOverride: Rect | null = null
	/** 节点在本次 dragmove 事件中实际处于的位置，可能已被上一帧吸附过。 */
	private currentAppliedDragBoundsOverride: Rect | null = null
	private currentSnappedDragBoundsOverride: Rect | null = null
	private eventUnsubscribers: Array<() => void> = []

	constructor(options: { canvas: Canvas }) {
		const { canvas } = options
		this.canvas = canvas
		this.guideRenderer = new SnapGuideRenderer({
			overlayLayer: canvas.overlayLayer,
		})
		this.snapResolver = new SnapResolver(this)
		this.spacingSnapResolver = new SpacingSnapResolver()
		this.sequenceSpacingResolver = new SequenceSpacingResolver()
		this.gridSpacingResolver = new GridSpacingResolver()
		this.setupEventListeners()
	}

	private requestOverlayDraw(reason: string): void {
		this.canvas.runtimeScheduler.requestLayerDraw("overlay", {
			source: "SnapGuideManager",
			reason,
			priority: "input",
		})
	}

	private emitSelectionPositionOverride(boundingRect: Rect): void {
		this.canvas.eventEmitter.emit({
			type: "selection:position",
			data: {
				boundingRect,
			},
		})
	}

	private syncSnappedProxyDragBounds(snappedDraggingRect: Rect): void {
		if (this.activeAnchor || !this.currentDragBoundsOverride) return

		this.currentSnappedDragBoundsOverride = snappedDraggingRect
		this.emitSelectionPositionOverride(snappedDraggingRect)
	}

	private resolveRawDragBounds(appliedBounds: Rect | null): Rect | null {
		if (
			!appliedBounds ||
			!this.currentDragBoundsOverride ||
			!this.currentSnappedDragBoundsOverride
		) {
			return appliedBounds
		}

		return {
			...appliedBounds,
			x: this.isNearlyEqual(appliedBounds.x, this.currentSnappedDragBoundsOverride.x)
				? this.currentDragBoundsOverride.x
				: appliedBounds.x,
			y: this.isNearlyEqual(appliedBounds.y, this.currentSnappedDragBoundsOverride.y)
				? this.currentDragBoundsOverride.y
				: appliedBounds.y,
		}
	}

	private isNearlyEqual(first: number, second: number): boolean {
		return Math.abs(first - second) < 0.001
	}

	ensureCache(): void {
		if (this.cachedSnapThreshold === 0) this.cacheVisualParams()
	}

	/**
	 * 设置事件监听
	 */
	private setupEventListeners(): void {
		// 监听拖拽开始
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:dragstart", () => {
				const selectedIds = this.canvas.selectionManager.getSelectedIds()
				this.isDragging = true
				this.activeAnchor = null
				this.lastSnappedAlignmentsKey = null
				this.clearSpacingSnapState()
				this.currentDragBoundsOverride = null
				this.currentAppliedDragBoundsOverride = null
				this.currentSnappedDragBoundsOverride = null
				this.cacheVisualParams()
				this.primeInteractionTargets(selectedIds)
			}),
		)

		// 监听拖拽移动
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:dragmove", ({ data }) => {
				if (!this.enabled || !this.isDragging) return
				const appliedBounds = data.boundingRect ? { ...data.boundingRect } : null
				this.currentDragBoundsOverride = this.resolveRawDragBounds(appliedBounds)
				this.currentAppliedDragBoundsOverride = appliedBounds
				this.processSnap()
			}),
		)

		// 监听拖拽结束
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:dragend", () => {
				this.isDragging = false
				this.activeAnchor = null
				this.lastSnappedAlignmentsKey = null
				this.clearSpacingSnapState()
				this.currentDragBoundsOverride = null
				this.currentAppliedDragBoundsOverride = null
				this.currentSnappedDragBoundsOverride = null
				this.clearInteractionTargets()
				this.guideRenderer.clear()
			}),
		)

		// 监听缩放开始
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:anchorDragStart", ({ data }) => {
				this.isDragging = true
				this.activeAnchor = data.activeAnchor
				this.lastSnappedAlignmentsKey = null
				this.clearSpacingSnapState()
				this.currentDragBoundsOverride = null
				this.currentAppliedDragBoundsOverride = null
				this.currentSnappedDragBoundsOverride = null
				this.cacheVisualParams()
				this.primeInteractionTargets(data.elementIds)
			}),
		)

		// 监听缩放移动
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:anchorDragmove", () => {
				if (!this.enabled || !this.isDragging) return
				this.processSnap()
			}),
		)

		// 监听缩放结束
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:anchorDragend", () => {
				this.isDragging = false
				this.activeAnchor = null
				this.lastSnappedAlignmentsKey = null
				this.clearSpacingSnapState()
				this.currentDragBoundsOverride = null
				this.currentAppliedDragBoundsOverride = null
				this.currentSnappedDragBoundsOverride = null
				this.clearInteractionTargets()
				this.guideRenderer.clear()
			}),
		)
	}

	private getSelectionKey(elementIds: string[]): string {
		return [...elementIds].sort().join("|")
	}

	private primeInteractionTargets(selectedIds: string[]): void {
		this.cachedInteractionSelectionKey = this.getSelectionKey(selectedIds)
		const targets = this.getAlignmentTargets(selectedIds)
		this.cachedInteractionTargets = targets
		this.cachedInteractionTargetIds = targets.map((target) => target.id)
		this.cachedInteractionTargetsById = new Map(targets.map((target) => [target.id, target]))
		this.cachedInteractionTargetOrder = new Map(
			targets.map((target, index) => [target.id, index]),
		)
		const siblingIds = new Set(
			selectedIds.length === 1 && selectedIds[0]
				? this.findParentAndSiblings(selectedIds[0]).siblings.map((sibling) => sibling.id)
				: [],
		)
		this.cachedSequenceSpacingTargets = targets.flatMap((target) => {
			if (!siblingIds.has(target.id)) return []
			const rect = this.canvas.geometryCacheManager.getElementBounds(target.id)
			return rect && rect.width > 0 && rect.height > 0 ? [{ id: target.id, rect }] : []
		})
		this.sequenceSpacingResolver.prepare(this.cachedSequenceSpacingTargets)
		this.gridSpacingResolver.prepare(this.sequenceSpacingResolver.getPreparedSequences())
	}

	private clearInteractionTargets(): void {
		this.cachedInteractionTargets = null
		this.cachedInteractionTargetIds = null
		this.cachedInteractionTargetsById = null
		this.cachedInteractionTargetOrder = null
		this.cachedInteractionSelectionKey = null
		this.cachedSequenceSpacingTargets = []
		this.sequenceSpacingResolver.clear()
		this.gridSpacingResolver.clear()
	}

	private getActiveInteractionTargets(selectedIds: string[], draggingRect: Rect): LayerElement[] {
		const selectionKey = this.getSelectionKey(selectedIds)
		if (
			!this.cachedInteractionTargets ||
			!this.cachedInteractionSelectionKey ||
			this.cachedInteractionSelectionKey !== selectionKey
		) {
			this.primeInteractionTargets(selectedIds)
		}

		const targetIds = this.cachedInteractionTargetIds ?? []
		const targetsById = this.cachedInteractionTargetsById
		if (targetIds.length === 0 || !targetsById) return []

		const candidateIds = this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
			draggingRect,
			this.cachedGuideThreshold,
			{ elementIds: targetIds },
		)
		const targetOrder = this.cachedInteractionTargetOrder
		if (targetOrder) {
			candidateIds.sort((a, b) => (targetOrder.get(a) ?? 0) - (targetOrder.get(b) ?? 0))
		}

		return candidateIds
			.map((elementId) => targetsById.get(elementId))
			.filter((target): target is LayerElement => target !== undefined)
	}

	/** @implements SnapResolverContext */
	getActiveAlignmentTargets(selectedIds: string[], draggingRect: Rect): LayerElement[] {
		return this.getActiveInteractionTargets(selectedIds, draggingRect)
	}

	/**
	 * 生成吸附结果签名，用于判断辅助线是否需要重绘
	 * 仅当 type + targetElementId 组合变化时才重绘（脱离吸附或切换目标）
	 */
	private getSnapVisualKey(alignments: AlignmentInfo[], spacingGuides: SpacingGuide[]): string {
		const alignmentKey = alignments
			.map((alignment) => `${alignment.type}:${alignment.targetElementId}`)
			.sort()
			.join("|")
		const spacingKey = spacingGuides
			.map(
				(guide) =>
					`${guide.kind}:${guide.axis}:${guide.sourceAxis ?? ""}:${guide.anchorTargetId ?? ""}:${guide.targetElementIds.join(":")}`,
			)
			.sort()
			.join("|")
		return `${alignmentKey};${spacingKey}`
	}

	/**
	 * 交互开始缓存参数（viewport/scale 不变，避免每帧重复计算）
	 */
	private cacheVisualParams(): void {
		const scale = this.canvas.stage.scaleX()
		this.cachedSnapThreshold = calculateSnapThreshold(scale)
		const viewportWidth = this.canvas.stage.width() / scale
		this.cachedGuideThreshold = viewportWidth / 4
		this.guideRenderer.cacheVisualParams(scale)
	}

	/**
	 * 主入口：编排核心逻辑 + 视觉渲染
	 * 吸附计算委托给 SnapResolver，应用根据场景分发
	 */
	private processSnap(): void {
		if (!this.enabled) return

		const selectedIds = this.canvas.selectionManager.getSelectedIds()
		if (selectedIds.length === 0) return

		const draggingRect = this.getDraggingElementsRect(selectedIds)
		if (!draggingRect) return
		const targets = this.getActiveInteractionTargets(selectedIds, draggingRect)

		const options =
			this.activeAnchor && this.canvas.transformManager.shouldKeepRatio(selectedIds)
				? {
						keepRatio: true,
						aspectRatio:
							this.canvas.transformManager.getInitialAspectRatio() ??
							(draggingRect.height !== 0
								? draggingRect.width / draggingRect.height
								: 1),
					}
				: undefined

		const directResult = this.snapResolver.resolveInContentSpace({
			draggingRect,
			targets,
			activeAnchor: this.activeAnchor,
			options,
		})

		const resolvedSnap = this.resolveTranslationSnap({
			selectedIds,
			draggingRect,
			targets,
			directResult,
		})
		const { snappedAlignments, snappedDraggingRect, spacingGuides } = resolvedSnap
		const appliedDragBounds = this.currentAppliedDragBoundsOverride ?? draggingRect
		const appliedOffsetX = snappedDraggingRect.x - appliedDragBounds.x
		const appliedOffsetY = snappedDraggingRect.y - appliedDragBounds.y

		// 缩放吸附由 TransformManager.boundBoxFunc 处理；这里仅处理平移吸附的位移应用。
		if (!this.activeAnchor && (appliedOffsetX !== 0 || appliedOffsetY !== 0)) {
			this.applySnapOffset(selectedIds, appliedOffsetX, appliedOffsetY)
		}
		if (!this.activeAnchor && resolvedSnap.hasSnap) {
			this.syncSnappedProxyDragBounds(snappedDraggingRect)
		} else if (!this.activeAnchor) {
			this.currentSnappedDragBoundsOverride = null
		}

		// 视觉：委托渲染器
		const currentKey = this.getSnapVisualKey(snappedAlignments, spacingGuides)
		const getSnappedRect = () => this.getSnappedElementsRect(snappedDraggingRect)
		if (currentKey !== this.lastSnappedAlignmentsKey) {
			this.guideRenderer.clear()
			this.guideRenderer.render(snappedAlignments, getSnappedRect)
			this.guideRenderer.renderSpacing(spacingGuides)
			this.lastSnappedAlignmentsKey = currentKey
		} else {
			if (snappedAlignments.length > 0) {
				this.guideRenderer.update(snappedAlignments, getSnappedRect)
			}
			if (spacingGuides.length > 0) {
				this.guideRenderer.updateSpacing(spacingGuides)
			}
		}

		this.guideRenderer.batchDraw()
	}

	private resolveTranslationSnap(params: {
		selectedIds: string[]
		draggingRect: Rect
		targets: LayerElement[]
		directResult: ReturnType<SnapResolver["resolveInContentSpace"]>
	}): {
		hasSnap: boolean
		snappedAlignments: AlignmentInfo[]
		snappedDraggingRect: Rect
		spacingGuides: SpacingGuide[]
		snapOffsetX: number
		snapOffsetY: number
	} {
		const { selectedIds, draggingRect, targets, directResult } = params
		if (this.activeAnchor || selectedIds.length !== 1) {
			return {
				hasSnap: directResult !== null,
				snappedAlignments: directResult?.snappedAlignments ?? [],
				snappedDraggingRect: directResult?.snappedRect ?? draggingRect,
				spacingGuides: [],
				snapOffsetX: directResult?.snapOffsetX ?? 0,
				snapOffsetY: directResult?.snapOffsetY ?? 0,
			}
		}

		const spacingTargets = this.getSpacingSnapTargets(draggingRect, targets)
		const spacingResult = this.spacingSnapResolver.resolve({
			draggingRect,
			targets: spacingTargets,
			threshold: this.cachedSnapThreshold,
		})
		const sequenceSpacingResult = this.sequenceSpacingResolver.resolve({
			draggingRect,
			threshold: this.cachedSnapThreshold,
		})
		const gridSpacingResult = this.gridSpacingResolver.resolve({
			draggingRect,
			threshold: this.cachedSnapThreshold,
			isAnchorAligned: (anchorTargetId, axis) =>
				this.hasDirectAlignmentToTarget(directResult, anchorTargetId, axis),
		})
		const directXAlignment = directResult?.snappedAlignments.find((alignment) =>
			this.isHorizontalAlignment(alignment.type),
		)
		const directYAlignment = directResult?.snappedAlignments.find(
			(alignment) => !this.isHorizontalAlignment(alignment.type),
		)
		const horizontalSpacing = this.pickSpacingCandidate(
			directResult?.snapOffsetX,
			!!directXAlignment,
			this.stabilizeSpacingCandidate({
				axis: "horizontal",
				draggingRect,
				targets: this.cachedSequenceSpacingTargets,
				baseCandidate: this.getClosestSpacingCandidate(
					spacingResult.horizontal,
					sequenceSpacingResult.horizontal,
					gridSpacingResult.horizontal,
				),
				directResult,
			}),
		)
		const verticalSpacing = this.pickSpacingCandidate(
			directResult?.snapOffsetY,
			!!directYAlignment,
			this.stabilizeSpacingCandidate({
				axis: "vertical",
				draggingRect,
				targets: this.cachedSequenceSpacingTargets,
				baseCandidate: this.getClosestSpacingCandidate(
					spacingResult.vertical,
					sequenceSpacingResult.vertical,
					gridSpacingResult.vertical,
				),
				directResult,
			}),
		)
		const snapOffsetX = horizontalSpacing?.offset ?? directResult?.snapOffsetX ?? 0
		const snapOffsetY = verticalSpacing?.offset ?? directResult?.snapOffsetY ?? 0
		const snappedAlignments = (directResult?.snappedAlignments ?? []).filter((alignment) =>
			this.isHorizontalAlignment(alignment.type) ? !horizontalSpacing : !verticalSpacing,
		)
		const snappedDraggingRect = {
			...draggingRect,
			x: draggingRect.x + snapOffsetX,
			y: draggingRect.y + snapOffsetY,
		}
		const spacingGuides = [horizontalSpacing, verticalSpacing]
			.filter((candidate): candidate is SpacingSnapCandidate => candidate !== null)
			.map((candidate) =>
				this.spacingSnapResolver.createGuideForSnappedRect(candidate, snappedDraggingRect),
			)

		this.updateSpacingSnapState("horizontal", horizontalSpacing)
		this.updateSpacingSnapState("vertical", verticalSpacing)

		return {
			hasSnap: snappedAlignments.length > 0 || spacingGuides.length > 0,
			snappedAlignments,
			snappedDraggingRect,
			spacingGuides,
			snapOffsetX,
			snapOffsetY,
		}
	}

	private getSpacingSnapTargets(
		draggingRect: Rect,
		fallbackTargets: LayerElement[],
	): SpacingSnapTarget[] {
		const targetIds = this.cachedSequenceSpacingTargets.map((target) => target.id)
		const targetsById =
			this.cachedInteractionTargetsById ??
			new Map(fallbackTargets.map((target) => [target.id, target]))
		const candidateIds = this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
			draggingRect,
			this.cachedGuideThreshold * 4,
			{ elementIds: targetIds },
		)
		const targetOrder = this.cachedInteractionTargetOrder
		if (targetOrder) {
			candidateIds.sort((a, b) => (targetOrder.get(a) ?? 0) - (targetOrder.get(b) ?? 0))
		}

		return candidateIds.flatMap((targetId) => {
			if (!targetsById.has(targetId)) return []
			const rect = this.canvas.geometryCacheManager.getElementBounds(targetId)
			return rect && rect.width > 0 && rect.height > 0 ? [{ id: targetId, rect }] : []
		})
	}

	private hasDirectAlignmentToTarget(
		directResult: ReturnType<SnapResolver["resolveInContentSpace"]>,
		targetElementId: string,
		spacingAxis: SpacingSnapAxis,
	): boolean {
		const requiresHorizontalAlignment = spacingAxis === "vertical"
		return !!directResult?.snappedAlignments.some(
			(alignment) =>
				alignment.targetElementId === targetElementId &&
				this.isHorizontalAlignment(alignment.type) === requiresHorizontalAlignment,
		)
	}

	private pickSpacingCandidate(
		directOffset: number | undefined,
		hasDirectAlignment: boolean,
		spacingCandidate: SpacingSnapCandidate | null,
	): SpacingSnapCandidate | null {
		if (!spacingCandidate) return null
		if (!hasDirectAlignment || directOffset === undefined) return spacingCandidate
		return Math.abs(spacingCandidate.offset) < Math.abs(directOffset) ? spacingCandidate : null
	}

	private getClosestSpacingCandidate(
		...candidates: Array<SpacingSnapCandidate | null>
	): SpacingSnapCandidate | null {
		return candidates.reduce<SpacingSnapCandidate | null>((closest, candidate) => {
			if (!candidate || (closest && Math.abs(closest.offset) <= Math.abs(candidate.offset))) {
				return closest
			}
			return candidate
		}, null)
	}

	private stabilizeSpacingCandidate(params: {
		axis: SpacingSnapAxis
		draggingRect: Rect
		targets: SpacingSnapTarget[]
		baseCandidate: SpacingSnapCandidate | null
		directResult: ReturnType<SnapResolver["resolveInContentSpace"]>
	}): SpacingSnapCandidate | null {
		const { axis, draggingRect, targets, baseCandidate, directResult } = params
		const lock = this.activeSpacingSnapTargets?.[axis]
		if (!lock) return baseCandidate

		const lockedTargets = lock.targetElementIds
			.map((targetId) => targets.find((target) => target.id === targetId))
			.filter((target): target is SpacingSnapTarget => target !== undefined)
		if (lockedTargets.length !== 2) {
			return baseCandidate
		}

		const releaseThreshold = this.getSpacingReleaseThreshold()
		const lockedCandidate =
			lock.kind === "grid"
				? this.gridSpacingResolver.resolveForReference({
						axis,
						sourceAxis: lock.sourceAxis,
						mode: lock.mode,
						draggingRect,
						targetElementIds: lock.targetElementIds,
						anchorTargetId: lock.anchorTargetId,
						threshold: releaseThreshold,
					})
				: lock.mode === "between"
					? axis === "horizontal"
						? this.spacingSnapResolver.resolve({
								draggingRect,
								targets: lockedTargets,
								threshold: releaseThreshold,
							}).horizontal
						: this.spacingSnapResolver.resolve({
								draggingRect,
								targets: lockedTargets,
								threshold: releaseThreshold,
							}).vertical
					: this.sequenceSpacingResolver.resolveForPair({
							axis,
							mode: lock.mode,
							draggingRect,
							targetElementIds: lock.targetElementIds,
							threshold: releaseThreshold,
						})
		if (!lockedCandidate) {
			return baseCandidate
		}
		if (
			lockedCandidate.kind === "grid" &&
			!this.hasDirectAlignmentToTarget(directResult, lockedCandidate.anchorTarget.id, axis)
		) {
			return baseCandidate
		}
		if (!baseCandidate) {
			return lockedCandidate
		}

		const baseKey = this.getSpacingCandidateKey(baseCandidate)
		const lockedKey = this.getSpacingCandidateKey(lockedCandidate)
		if (baseKey === lockedKey) {
			return lockedCandidate
		}

		const baseDistance = Math.abs(baseCandidate.offset)
		const lockedDistance = Math.abs(lockedCandidate.offset)
		const shouldSwitch = baseDistance + releaseThreshold < lockedDistance
		return shouldSwitch ? baseCandidate : lockedCandidate
	}

	private getSpacingReleaseThreshold(): number {
		return this.cachedSnapThreshold + Math.max(1, this.cachedSnapThreshold * 0.25)
	}

	private getSpacingCandidateKey(candidate: SpacingSnapCandidate): string {
		return `${candidate.kind}:${candidate.axis}:${candidate.mode}:${candidate.kind === "grid" ? `${candidate.sourceAxis}:${candidate.anchorTarget.id}:` : ""}${candidate.referenceTargets.map((target) => target.id).join(":")}`
	}

	private updateSpacingSnapState(
		axis: SpacingSnapAxis,
		candidate: SpacingSnapCandidate | null,
	): void {
		if (!this.activeSpacingSnapTargets) {
			this.activeSpacingSnapTargets = {}
		}
		if (!candidate) {
			delete this.activeSpacingSnapTargets[axis]
			return
		}
		const targetElementIds = candidate.referenceTargets.map((target) => target.id) as [
			string,
			string,
		]
		this.activeSpacingSnapTargets[axis] =
			candidate.kind === "grid"
				? {
						kind: "grid",
						mode: candidate.mode,
						targetElementIds,
						sourceAxis: candidate.sourceAxis,
						anchorTargetId: candidate.anchorTarget.id,
					}
				: {
						kind: "linear",
						mode: candidate.mode,
						targetElementIds,
					}
	}

	private clearSpacingSnapState(): void {
		this.activeSpacingSnapTargets = {}
	}

	/** @implements SnapResolverContext - 供 SnapResolver 调用 */
	getAlignmentTargets(draggingElementIds: string[]): LayerElement[] {
		const targets: LayerElement[] = []
		const excludeSet = new Set(draggingElementIds)

		// 获取第一个拖拽元素（假设多选时都在同一层级）
		const firstElementId = draggingElementIds[0]
		if (!firstElementId) return targets
		if (!this.areSelectedElementsInSameScope(draggingElementIds)) return targets

		// 查找父元素和同级元素
		const { parentElement, siblings } = this.findParentAndSiblings(firstElementId)

		// 1. 添加同级元素（排除正在拖拽的元素）
		for (const sibling of siblings) {
			if (!excludeSet.has(sibling.id) && this.canvas.permissionManager.canSnap(sibling)) {
				targets.push(sibling)
			}
		}

		// 2. 如果有父 Frame，添加父 Frame（用于边界对齐）
		if (parentElement && parentElement.type === "frame") {
			if (this.canvas.permissionManager.canSnap(parentElement)) {
				targets.push(parentElement)
			}
		}

		return targets
	}

	private areSelectedElementsInSameScope(elementIds: string[]): boolean {
		if (elementIds.length <= 1) return true

		const getScopeId = (elementId: string): string | null =>
			this.findParentAndSiblings(elementId).parentElement?.id ?? null
		const scopeId = getScopeId(elementIds[0])

		return elementIds.every((elementId) => getScopeId(elementId) === scopeId)
	}

	/**
	 * 查找元素的父元素和同级元素
	 */
	private findParentAndSiblings(elementId: string): {
		parentElement: LayerElement | null
		siblings: LayerElement[]
	} {
		return this.canvas.elementManager.getParentAndSiblings(elementId)
	}

	/** @implements SnapResolverContext */
	calculateElementsRect(elementIds: string[]): Rect | null {
		return this.canvas.geometryCacheManager.getElementsBounds(elementIds)
	}

	/**
	 * 获取拖拽元素的边界矩形
	 */
	private getDraggingElementsRect(elementIds: string[]): Rect | null {
		if (!this.activeAnchor && this.currentDragBoundsOverride) {
			return { ...this.currentDragBoundsOverride }
		}
		return this.calculateElementsRect(elementIds)
	}

	/** @implements SnapResolverContext */
	findAlignments(
		draggingRect: Rect,
		otherElements: LayerElement[],
		overrideAnchor?: string | null,
	): AlignmentInfo[] {
		const alignments: AlignmentInfo[] = []
		const guideThreshold = this.cachedGuideThreshold
		// 使用缓存的吸附阈值
		const snapThreshold = this.cachedSnapThreshold

		// 计算拖拽元素的关键位置
		const dragLeft = draggingRect.x
		const dragRight = draggingRect.x + draggingRect.width
		const dragCenterX = draggingRect.x + draggingRect.width / 2
		const dragTop = draggingRect.y
		const dragBottom = draggingRect.y + draggingRect.height
		const dragMiddleY = draggingRect.y + draggingRect.height / 2

		// 根据 activeAnchor 确定允许吸附的边
		const allowedAlignments = this.getAllowedAlignments(overrideAnchor)

		// 遍历其他元素，查找对齐关系
		for (const element of otherElements) {
			const clientRect = this.canvas.geometryCacheManager.getElementBounds(element.id)
			if (!clientRect) continue

			// 确保尺寸有效
			if (clientRect.width <= 0 || clientRect.height <= 0) {
				continue
			}

			const targetRect: Rect = {
				x: clientRect.x,
				y: clientRect.y,
				width: clientRect.width,
				height: clientRect.height,
			}

			const targetLeft = targetRect.x
			const targetRight = targetRect.x + targetRect.width
			const targetCenterX = targetRect.x + targetRect.width / 2
			const targetTop = targetRect.y
			const targetBottom = targetRect.y + targetRect.height
			const targetMiddleY = targetRect.y + targetRect.height / 2

			// 检查水平对齐（左、中、右） - 只检查允许的对齐方式
			if (allowedAlignments.has("left") && Math.abs(dragLeft - targetLeft) < guideThreshold) {
				alignments.push({
					type: "left",
					position: targetLeft,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("left", draggingRect),
					targetPoints: this.getAlignmentPoints("left", targetRect),
				})
			}
			if (
				allowedAlignments.has("center") &&
				Math.abs(dragCenterX - targetCenterX) < guideThreshold
			) {
				alignments.push({
					type: "center",
					position: targetCenterX,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("center", draggingRect),
					targetPoints: this.getAlignmentPoints("center", targetRect),
				})
			}
			if (
				allowedAlignments.has("right") &&
				Math.abs(dragRight - targetRight) < guideThreshold
			) {
				alignments.push({
					type: "right",
					position: targetRight,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("right", draggingRect),
					targetPoints: this.getAlignmentPoints("right", targetRect),
				})
			}

			// 检查垂直对齐（上、中、下） - 只检查允许的对齐方式
			if (allowedAlignments.has("top") && Math.abs(dragTop - targetTop) < guideThreshold) {
				alignments.push({
					type: "top",
					position: targetTop,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("top", draggingRect),
					targetPoints: this.getAlignmentPoints("top", targetRect),
				})
			}
			if (
				allowedAlignments.has("middle") &&
				Math.abs(dragMiddleY - targetMiddleY) < guideThreshold
			) {
				alignments.push({
					type: "middle",
					position: targetMiddleY,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("middle", draggingRect),
					targetPoints: this.getAlignmentPoints("middle", targetRect),
				})
			}
			if (
				allowedAlignments.has("bottom") &&
				Math.abs(dragBottom - targetBottom) < guideThreshold
			) {
				alignments.push({
					type: "bottom",
					position: targetBottom,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("bottom", draggingRect),
					targetPoints: this.getAlignmentPoints("bottom", targetRect),
				})
			}

			// ==================== 边缘吸附 ====================
			// 检查拖拽元素的边缘是否接近目标元素的边缘
			// 注意：边缘吸附使用 snapThreshold，确保只在真正接近时才吸附

			// 水平边缘吸附：拖拽元素的左边 -> 目标元素的右边
			if (allowedAlignments.has("left") && Math.abs(dragLeft - targetRight) < snapThreshold) {
				alignments.push({
					type: "left",
					position: targetRight,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("left", draggingRect),
					targetPoints: this.getAlignmentPoints("right", targetRect),
				})
			}

			// 水平边缘吸附：拖拽元素的右边 -> 目标元素的左边
			if (
				allowedAlignments.has("right") &&
				Math.abs(dragRight - targetLeft) < snapThreshold
			) {
				alignments.push({
					type: "right",
					position: targetLeft,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("right", draggingRect),
					targetPoints: this.getAlignmentPoints("left", targetRect),
				})
			}

			// 垂直边缘吸附：拖拽元素的上边 -> 目标元素的下边
			if (allowedAlignments.has("top") && Math.abs(dragTop - targetBottom) < snapThreshold) {
				alignments.push({
					type: "top",
					position: targetBottom,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("top", draggingRect),
					targetPoints: this.getAlignmentPoints("bottom", targetRect),
				})
			}

			// 垂直边缘吸附：拖拽元素的下边 -> 目标元素的上边
			if (
				allowedAlignments.has("bottom") &&
				Math.abs(dragBottom - targetTop) < snapThreshold
			) {
				alignments.push({
					type: "bottom",
					position: targetTop,
					targetElementId: element.id,
					dragPoints: this.getAlignmentPoints("bottom", draggingRect),
					targetPoints: this.getAlignmentPoints("top", targetRect),
				})
			}
		}

		return alignments
	}

	/** @implements SnapResolverContext */
	getAllowedAlignments(overrideAnchor?: string | null): Set<AlignmentType> {
		const anchor = overrideAnchor ?? this.activeAnchor
		// 如果没有激活的 anchor，说明是纯拖拽，允许所有对齐
		if (!anchor) {
			return new Set<AlignmentType>(["left", "center", "right", "top", "middle", "bottom"])
		}

		// 内建比例锁定和 Shift/Meta 锁定都意味着另一轴会跟随变化，
		// 因此两者都需要开放对应的辅助线，避免视觉提示与实际尺寸变化不一致。
		const shouldKeepRatio = this.canvas.transformManager.shouldKeepRatio(
			this.canvas.selectionManager.getSelectedIds(),
		)

		// 根据 anchor 位置确定允许的对齐方式
		const allowed = new Set<AlignmentType>()

		switch (anchor) {
			case "top-left":
				allowed.add("left")
				allowed.add("top")
				break
			case "top-center":
				// 未锁定比例：只吸附上边；锁定比例：吸附左上角（left + top）
				allowed.add("top")
				if (shouldKeepRatio) {
					allowed.add("left")
				}
				break
			case "top-right":
				allowed.add("right")
				allowed.add("top")
				break
			case "middle-left":
				// 未锁定比例：只吸附左边；锁定比例：吸附左上角（left + top）
				allowed.add("left")
				if (shouldKeepRatio) {
					allowed.add("top")
				}
				break
			case "middle-right":
				// 未锁定比例：只吸附右边；锁定比例：吸附右下角（right + bottom）
				allowed.add("right")
				if (shouldKeepRatio) {
					allowed.add("bottom")
				}
				break
			case "bottom-left":
				allowed.add("left")
				allowed.add("bottom")
				break
			case "bottom-center":
				// 未锁定比例：只吸附下边；锁定比例：吸附右下角（right + bottom）
				allowed.add("bottom")
				if (shouldKeepRatio) {
					allowed.add("right")
				}
				break
			case "bottom-right":
				allowed.add("right")
				allowed.add("bottom")
				break
		}

		return allowed
	}

	/**
	 * 获取吸附后选中元素的边界（applySnapOffset 之后调用）
	 */
	private getSnappedElementsRect(fallbackRect?: Rect): Rect | null {
		if (!this.activeAnchor && this.currentSnappedDragBoundsOverride) {
			return { ...this.currentSnappedDragBoundsOverride }
		}
		if (fallbackRect) {
			return { ...fallbackRect }
		}
		const selectedIds = this.canvas.selectionManager.getSelectedIds()
		return this.calculateElementsRect(selectedIds)
	}

	/** @implements SnapResolverContext */
	calculateSnapResult(
		alignments: AlignmentInfo[],
		draggingRect: Rect,
	): {
		snappedAlignments: AlignmentInfo[]
		snapOffsetX: number
		snapOffsetY: number
	} {
		if (alignments.length === 0) {
			return { snappedAlignments: [], snapOffsetX: 0, snapOffsetY: 0 }
		}

		// 使用缓存的吸附阈值
		const snapThreshold = this.cachedSnapThreshold

		const dragLeft = draggingRect.x
		const dragCenterX = draggingRect.x + draggingRect.width / 2
		const dragRight = draggingRect.x + draggingRect.width
		const dragTop = draggingRect.y
		const dragMiddleY = draggingRect.y + draggingRect.height / 2
		const dragBottom = draggingRect.y + draggingRect.height

		// 选择距离最近的水平对齐（左/中/右）
		let minXOffset = Infinity
		let bestXAlignment: AlignmentInfo | null = null

		for (const alignment of alignments) {
			if (!["left", "center", "right"].includes(alignment.type)) continue

			let offset = 0
			if (alignment.type === "left") {
				offset = alignment.position - dragLeft
			} else if (alignment.type === "center") {
				offset = alignment.position - dragCenterX
			} else if (alignment.type === "right") {
				offset = alignment.position - dragRight
			}

			// 只考虑在吸附阈值内的对齐
			if (Math.abs(offset) <= snapThreshold && Math.abs(offset) < Math.abs(minXOffset)) {
				minXOffset = offset
				bestXAlignment = alignment
			}
		}

		// 选择距离最近的垂直对齐（上/中/下）
		let minYOffset = Infinity
		let bestYAlignment: AlignmentInfo | null = null

		for (const alignment of alignments) {
			if (!["top", "middle", "bottom"].includes(alignment.type)) continue

			let offset = 0
			if (alignment.type === "top") {
				offset = alignment.position - dragTop
			} else if (alignment.type === "middle") {
				offset = alignment.position - dragMiddleY
			} else if (alignment.type === "bottom") {
				offset = alignment.position - dragBottom
			}

			// 只考虑在吸附阈值内的对齐
			if (Math.abs(offset) <= snapThreshold && Math.abs(offset) < Math.abs(minYOffset)) {
				minYOffset = offset
				bestYAlignment = alignment
			}
		}

		// 保持一个实际吸附偏移，但同时保留共享该偏移的所有点位关系。
		// 例如两个等大的元素左右平行时，top/middle/bottom 都会以相同的 Y 偏移对齐。
		const snappedAlignments = this.collectCoincidentAlignments({
			alignments,
			draggingRect,
			snapOffsetX: bestXAlignment ? minXOffset : null,
			snapOffsetY: bestYAlignment ? minYOffset : null,
			snapThreshold,
		})

		return {
			snappedAlignments,
			snapOffsetX: bestXAlignment ? minXOffset : 0,
			snapOffsetY: bestYAlignment ? minYOffset : 0,
		}
	}

	private collectCoincidentAlignments(params: {
		alignments: AlignmentInfo[]
		draggingRect: Rect
		snapOffsetX: number | null
		snapOffsetY: number | null
		snapThreshold: number
	}): AlignmentInfo[] {
		const { alignments, draggingRect, snapOffsetX, snapOffsetY, snapThreshold } = params
		const result: AlignmentInfo[] = []
		const seen = new Set<string>()

		for (const alignment of alignments) {
			const offset = this.getAlignmentOffset(alignment, draggingRect)
			const expectedOffset = this.isHorizontalAlignment(alignment.type)
				? snapOffsetX
				: snapOffsetY
			if (
				expectedOffset === null ||
				Math.abs(offset) > snapThreshold ||
				Math.abs(offset - expectedOffset) > COINCIDENT_ALIGNMENT_OFFSET_EPSILON
			) {
				continue
			}

			const key = `${alignment.type}:${alignment.position.toFixed(2)}`
			if (seen.has(key)) continue
			seen.add(key)
			result.push(alignment)
		}

		return result
	}

	private getAlignmentOffset(alignment: AlignmentInfo, draggingRect: Rect): number {
		switch (alignment.type) {
			case "left":
				return alignment.position - draggingRect.x
			case "center":
				return alignment.position - (draggingRect.x + draggingRect.width / 2)
			case "right":
				return alignment.position - (draggingRect.x + draggingRect.width)
			case "top":
				return alignment.position - draggingRect.y
			case "middle":
				return alignment.position - (draggingRect.y + draggingRect.height / 2)
			case "bottom":
				return alignment.position - (draggingRect.y + draggingRect.height)
		}
	}

	private isHorizontalAlignment(type: AlignmentType): boolean {
		return type === "left" || type === "center" || type === "right"
	}

	/**
	 * anchor 缩放场景：返回 Konva boundBoxFunc 所需的吸附后 box
	 * 委托给 SnapResolver，内部完成 content ↔ konva 坐标转换
	 */
	public getSnappedBox(
		oldBox: Box,
		newBox: Box,
		activeAnchor: string | null,
		selectedIds: string[],
		options?: { keepRatio: boolean; aspectRatio: number },
	): Box {
		if (!this.enabled || !activeAnchor) return newBox

		return this.snapResolver.getSnappedBox(oldBox, newBox, activeAnchor, selectedIds, options)
	}

	/**
	 * 根据对齐类型计算标记点位置
	 */
	private getAlignmentPoints(type: AlignmentType, rect: Rect): Array<{ x: number; y: number }> {
		switch (type) {
			case "left":
				return [
					{ x: rect.x, y: rect.y }, // 左上角
					{ x: rect.x, y: rect.y + rect.height }, // 左下角
				]
			case "right":
				return [
					{ x: rect.x + rect.width, y: rect.y }, // 右上角
					{ x: rect.x + rect.width, y: rect.y + rect.height }, // 右下角
				]
			case "top":
				return [
					{ x: rect.x, y: rect.y }, // 左上角
					{ x: rect.x + rect.width, y: rect.y }, // 右上角
				]
			case "bottom":
				return [
					{ x: rect.x, y: rect.y + rect.height }, // 左下角
					{ x: rect.x + rect.width, y: rect.y + rect.height }, // 右下角
				]
			case "center":
			case "middle":
				return [
					{
						x: rect.x + rect.width / 2,
						y: rect.y + rect.height / 2,
					}, // 中心点
				]
		}
	}

	/**
	 * 应用吸附偏移到选中的元素
	 */
	private applySnapOffset(selectedIds: string[], snapOffsetX: number, snapOffsetY: number): void {
		// 临时标记正在吸附，避免触发过多的位置更新事件
		this.canvas.eventEmitter.emit({ type: "snap:start", data: undefined })

		const appliedToProxy = this.canvas.transformManager.applySelectionProxyDragOffset(
			snapOffsetX,
			snapOffsetY,
		)
		if (!appliedToProxy) {
			// 获取选中的元素节点
			const adapter = this.canvas.elementManager.getNodeAdapter()
			const nodes = adapter.getNodesForTransform(selectedIds)

			if (nodes.length === 0) {
				this.canvas.eventEmitter.emit({ type: "snap:end", data: undefined })
				return
			}

			// 纯拖拽操作，直接调整位置
			for (const node of nodes) {
				const elementId = node.id()
				const currentX = node.x()
				const currentY = node.y()
				const updates = {
					x: currentX + snapOffsetX,
					y: currentY + snapOffsetY,
				}

				// 使用 ElementManager 的 update 接口（mode: 'node-only'）
				this.canvas.elementManager.update(elementId, updates, {
					mode: "node-only",
					forceRerender: false,
				})
			}
		}

		this.requestOverlayDraw("snap-offset")

		// 吸附完成后再触发位置更新
		this.canvas.eventEmitter.emit({ type: "snap:end", data: undefined })
	}

	/**
	 * 启用吸附
	 */
	public enable(): void {
		this.enabled = true
	}

	/**
	 * 禁用吸附
	 */
	public disable(): void {
		this.enabled = false
		this.guideRenderer.clear()
	}

	/**
	 * 检查是否启用
	 */
	public isEnabled(): boolean {
		return this.enabled
	}

	/**
	 * 销毁管理器
	 */
	public destroy(): void {
		this.guideRenderer.clear()
		this.clearInteractionTargets()
		this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.eventUnsubscribers = []
	}
}
