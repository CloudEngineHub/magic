import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import type { Rect } from "../../shared/ids"
import {
	ConnectionHandleRenderer,
	type ConnectionHandleSide,
	type ConnectionHandleInteractionState,
} from "./ConnectionHandleRenderer"

export class ConnectionHandleOverlayManager {
	private static readonly MIN_ELEMENT_SCREEN_MAJOR_SIZE_FOR_HANDLE_PX = 60
	private static readonly MIN_ELEMENT_SCREEN_MINOR_SIZE_FOR_HANDLE_PX = 24
	private static readonly HANDLE_ANIMATION_OFFSET_PX = 8
	private static readonly HANDLE_ENTER_DURATION_SECONDS = 0.14
	private static readonly HANDLE_EXIT_DURATION_SECONDS = 0.1

	private readonly canvas: Canvas
	private readonly renderer: ConnectionHandleRenderer
	private readonly animationsEnabled: boolean
	private overlayNode: Konva.Group | null = null
	private activeElementId: string | null = null
	private isPointerInsideOverlay = false
	private isPointerInsideHandleBridge = false
	private isStagePointerInside = true
	private menuPinnedElementId: string | null = null
	private hoveredHandleNode: Konva.Group | null = null
	private activeHandleNode: Konva.Group | null = null
	private transformSettledRefreshQueued = false
	private destroyed = false
	private overlayTweens = new Map<Konva.Group, Set<Konva.Tween>>()
	private exitingOverlayNodes = new Set<Konva.Group>()
	private eventUnsubscribers: Array<() => void> = []
	private activeHandleReleaseUnsubscribers: Array<() => void> = []

	constructor(options: {
		canvas: Canvas
		renderer?: ConnectionHandleRenderer
		animationsEnabled?: boolean
	}) {
		this.canvas = options.canvas
		this.renderer = options.renderer ?? new ConnectionHandleRenderer()
		this.animationsEnabled = options.animationsEnabled ?? true

		this.setupEventListeners()
	}

	private readonly handleStagePointerMove = (): void => {
		this.isStagePointerInside = true
		if (!this.overlayNode || !this.activeElementId) return

		const wasPointerKeepingOverlay = this.isPointerKeepingOverlay()
		this.syncPointerInsideHandleBridge()

		if (
			this.canvas.hoverManager.getHoveredElementId() ||
			this.shouldUseSelectedElementFallback()
		) {
			return
		}

		if (wasPointerKeepingOverlay !== this.isPointerKeepingOverlay()) {
			this.refresh()
		}
	}

	private readonly handleStagePointerLeave = (): void => {
		this.isStagePointerInside = false
		this.isPointerInsideOverlay = false
		this.isPointerInsideHandleBridge = false
		if (!this.shouldUseSelectedElementFallback() && !this.menuPinnedElementId) {
			this.refresh()
		}
	}

	private readonly handleStageDragStart = (): void => {
		this.menuPinnedElementId = null
		this.hideOverlayImmediately()
	}

	private setupEventListeners(): void {
		const refresh = () => {
			this.refresh()
		}
		const refreshAfterTransformSettled = () => {
			this.scheduleRefreshAfterTransformSettled()
		}
		const hideForTransform = () => {
			this.hideOverlayImmediately()
		}
		const handleHoverChange = ({ data }: { data: { elementId: string | null } }) => {
			if (data.elementId) {
				this.isPointerInsideOverlay = false
				this.isPointerInsideHandleBridge = false
			} else {
				this.syncPointerInsideHandleBridge()
			}
			if (!data.elementId && this.shouldKeepActiveOverlayFromPointer()) {
				this.refresh()
				return
			}
			this.refresh()
		}
		const clear = () => {
			this.clear()
		}
		const handleConnectionMenuOpen = ({
			data,
		}: {
			data: { originElementId?: string; source: "handle" | "drag-empty" }
		}) => {
			this.menuPinnedElementId =
				data.source === "handle" && data.originElementId ? data.originElementId : null
			this.refresh()
		}
		const handleConnectionMenuClose = ({
			data,
		}: {
			data: { originElementId?: string; source: "handle" | "drag-empty" }
		}) => {
			if (data.source !== "handle") return
			if (data.originElementId && data.originElementId !== this.menuPinnedElementId) return
			this.menuPinnedElementId = null
			this.refresh()
		}
		const refreshIfCurrentTargetChanged = ({ data }: { data: { elementId: string } }) => {
			if (
				this.activeElementId === data.elementId ||
				this.getCurrentInteractionElementId() === data.elementId
			) {
				this.refresh()
			}
		}

		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("element:hover", handleHoverChange),
			this.canvas.eventEmitter.on("connection:menu:open", handleConnectionMenuOpen),
			this.canvas.eventEmitter.on("connection:menu:close", handleConnectionMenuClose),
			this.canvas.eventEmitter.on("element:select", refresh),
			this.canvas.eventEmitter.on("element:deselect", refresh),
			this.canvas.eventEmitter.on("element:updated", refreshIfCurrentTargetChanged),
			this.canvas.eventEmitter.on("element:rerendered", refreshIfCurrentTargetChanged),
			this.canvas.eventEmitter.on("viewport:scale", refresh),
			this.canvas.eventEmitter.on("document:loaded", refresh),
			this.canvas.eventEmitter.on("document:restored", refresh),
			this.canvas.eventEmitter.on("canvas:readonly", refresh),
			this.canvas.eventEmitter.on("canvas:devicechange", refresh),
			this.canvas.eventEmitter.on("tool:change", refresh),
			this.canvas.eventEmitter.on("crop:exit", refresh),
			this.canvas.eventEmitter.on("extend:exit", refresh),
			this.canvas.eventEmitter.on("eraser:exit", refresh),
			this.canvas.eventEmitter.on("selection:end", refresh),
			this.canvas.eventEmitter.on("elements:transform:dragend", refreshAfterTransformSettled),
			this.canvas.eventEmitter.on(
				"elements:transform:anchorDragend",
				refreshAfterTransformSettled,
			),
			this.canvas.eventEmitter.on(
				"elements:transform:intentend",
				refreshAfterTransformSettled,
			),
			this.canvas.eventEmitter.on("viewport:gesture", ({ data }) => {
				if (data.active) {
					this.clear()
				} else {
					this.refresh()
				}
			}),
			this.canvas.eventEmitter.on("element:deleted", ({ data }) => {
				if (
					this.activeElementId === data.elementId ||
					this.getCurrentInteractionElementId() === data.elementId
				) {
					this.clear()
				}
			}),
			this.canvas.eventEmitter.on("element:batchdeleted", clear),
			this.canvas.eventEmitter.on("canvas:clear", clear),
			this.canvas.eventEmitter.on("crop:enter", clear),
			this.canvas.eventEmitter.on("extend:enter", clear),
			this.canvas.eventEmitter.on("eraser:enter", clear),
			this.canvas.eventEmitter.on("selection:start", clear),
			this.canvas.eventEmitter.on("element:dragstart", hideForTransform),
			this.canvas.eventEmitter.on("elements:transform:dragstart", hideForTransform),
			this.canvas.eventEmitter.on("elements:transform:anchorDragStart", hideForTransform),
		)
		this.canvas.stage.on("mousemove touchmove pointermove", this.handleStagePointerMove)
		this.canvas.stage.on("mouseleave", this.handleStagePointerLeave)
		this.canvas.stage.on("dragstart", this.handleStageDragStart)
	}

	public refresh(): void {
		const elementId = this.resolveDisplayElementId()
		if (!elementId) {
			this.clear()
			return
		}

		const bounds = this.canvas.elementManager.getNodeAdapter().getElementBounds(elementId)
		if (!this.isValidRect(bounds)) {
			this.clear()
			return
		}

		const stageScale = this.getSafeStageScale()
		if (!this.canFitHandlesOnScreen(bounds, stageScale)) {
			this.clear()
			return
		}

		const isNewOverlay = !this.overlayNode
		const previousElementId = this.activeElementId
		if (!this.overlayNode) {
			this.overlayNode = this.renderer.createOverlay(elementId, bounds, stageScale)
			this.bindOverlayKeepAliveEvents(this.overlayNode)
			this.bindHandleInteractionEvents(this.overlayNode)
			this.canvas.controlsLayer.add(this.overlayNode)
		} else {
			if (previousElementId !== elementId) {
				this.resetHandleInteractionState()
			}
			this.stopOverlayTweens(this.overlayNode)
			this.renderer.updateOverlay(this.overlayNode, elementId, bounds, stageScale)
		}

		this.activeElementId = elementId
		this.overlayNode.moveToTop()
		if (isNewOverlay || previousElementId !== elementId) {
			this.playEnterAnimation(this.overlayNode, stageScale)
		} else {
			this.showHandlesAtRest(this.overlayNode)
		}
		this.requestControlsDraw("connection-handle-refresh")
	}

	public clear(options?: { animated?: boolean }): void {
		this.menuPinnedElementId = null
		this.hideOverlay({ animated: options?.animated })
		this.isPointerInsideOverlay = false
		this.isPointerInsideHandleBridge = false
		this.activeElementId = null
	}

	private hideOverlay(options?: { animated?: boolean }): void {
		const overlayNode = this.overlayNode
		if (!overlayNode) return

		this.overlayNode = null
		this.isPointerInsideOverlay = false
		this.isPointerInsideHandleBridge = false
		this.resetHandleInteractionState()
		this.stopOverlayTweens(overlayNode)

		const shouldAnimate = options?.animated ?? this.animationsEnabled
		if (!shouldAnimate) {
			overlayNode.destroy()
			this.requestControlsDraw("connection-handle-clear")
			return
		}

		overlayNode.name(ConnectionHandleRenderer.EXITING_OVERLAY_GROUP_NAME)
		this.disableOverlayListening(overlayNode)
		this.exitingOverlayNodes.add(overlayNode)
		this.playExitAnimation(overlayNode)
		this.requestControlsDraw("connection-handle-clear")
	}

	private hideOverlayImmediately(): void {
		this.hideOverlay({ animated: false })
		this.destroyExitingOverlays()
	}

	public destroy(): void {
		this.destroyed = true
		this.resetHandleInteractionState()
		this.clear({ animated: false })
		this.destroyExitingOverlays()
		this.destroyAllOverlayTweens()
		this.canvas.stage.off("mousemove touchmove pointermove", this.handleStagePointerMove)
		this.canvas.stage.off("mouseleave", this.handleStagePointerLeave)
		this.canvas.stage.off("dragstart", this.handleStageDragStart)
		this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.eventUnsubscribers = []
	}

	private resolveDisplayElementId(): string | null {
		const overlayBlockReason = this.getConnectionHandleOverlayBlockReason()
		if (overlayBlockReason) {
			return null
		}

		const selectedIds = this.canvas.selectionManager.getSelectedIds()
		if (selectedIds.length > 1) {
			return null
		}

		const hoveredElementId = this.canvas.hoverManager.getHoveredElementId()
		const keepAliveElementId = this.isPointerKeepingOverlay() ? this.activeElementId : null
		const selectedFallbackElementId = this.shouldUseSelectedElementFallback()
			? selectedIds[0]
			: null
		const elementId =
			this.menuPinnedElementId ??
			hoveredElementId ??
			keepAliveElementId ??
			selectedFallbackElementId
		if (!elementId) return null

		const elementBlockReason = this.getConnectionHandleElementBlockReason(elementId)
		if (elementBlockReason) {
			return null
		}

		return elementId
	}

	private getCurrentInteractionElementId(): string | null {
		const selectedIds = this.canvas.selectionManager.getSelectedIds()
		if (selectedIds.length > 1) return null
		return (
			this.menuPinnedElementId ??
			this.canvas.hoverManager.getHoveredElementId() ??
			(this.isPointerKeepingOverlay() ? this.activeElementId : null) ??
			(this.shouldUseSelectedElementFallback() ? selectedIds[0] : null)
		)
	}

	private shouldUseSelectedElementFallback(): boolean {
		return (
			this.shouldShowSelectedElementHandle() &&
			this.canvas.selectionManager.getSelectedIds().length === 1
		)
	}

	private shouldShowSelectedElementHandle(): boolean {
		const { formFactor, input } = this.canvas.deviceInfo
		return input.touch && (input.coarsePointer || !input.hover || formFactor !== "desktop")
	}

	private getConnectionHandleOverlayBlockReason(): string | null {
		if (this.canvas.readonly) return "readonly"
		if (this.canvas.connectionDragManager?.isDraggingConnection?.())
			return "connection-dragging"
		if (!this.canvas.permissionManager.canUseSelectionToolAffordance()) {
			return "selection-tool-affordance-disabled"
		}
		if (this.isExtendModeActive()) return "extend-mode"
		if (this.canvas.transformManager.isTransformInteractionActive()) {
			return "transform-interaction-active"
		}
		if (this.canvas.transformManager.isDraggingElement()) return "dragging-element"
		return null
	}

	private getConnectionHandleElementBlockReason(elementId: string): string | null {
		if (!this.canvas.elementManager.hasElement(elementId)) return "missing-element"
		const elementData = this.canvas.elementManager.getElementData(elementId)
		if (!this.canvas.permissionManager.canConnect(elementData)) return "cannot-connect"
		return null
	}

	private isExtendModeActive(): boolean {
		return Boolean(this.canvas.extendManager?.getExtendingElementId?.())
	}

	private isValidRect(rect: Rect | null | undefined): rect is Rect {
		return (
			!!rect &&
			Number.isFinite(rect.x) &&
			Number.isFinite(rect.y) &&
			Number.isFinite(rect.width) &&
			Number.isFinite(rect.height) &&
			rect.width > 0 &&
			rect.height > 0
		)
	}

	private canFitHandlesOnScreen(rect: Rect, stageScale: number): boolean {
		const screenWidth = rect.width * stageScale
		const screenHeight = rect.height * stageScale
		const majorScreenSize = Math.max(screenWidth, screenHeight)
		const minorScreenSize = Math.min(screenWidth, screenHeight)
		return (
			majorScreenSize >=
				ConnectionHandleOverlayManager.MIN_ELEMENT_SCREEN_MAJOR_SIZE_FOR_HANDLE_PX &&
			minorScreenSize >=
				ConnectionHandleOverlayManager.MIN_ELEMENT_SCREEN_MINOR_SIZE_FOR_HANDLE_PX
		)
	}

	private getSafeStageScale(): number {
		const scale = this.canvas.stage.scaleX()
		return Number.isFinite(scale) && scale > 0 ? scale : 1
	}

	private bindOverlayKeepAliveEvents(overlayNode: Konva.Group): void {
		overlayNode.on("mouseenter", () => {
			this.isPointerInsideOverlay = true
		})
		overlayNode.on("mouseleave", () => {
			this.isPointerInsideOverlay = false
			this.syncPointerInsideHandleBridge()
			this.refresh()
		})
	}

	private isPointerKeepingOverlay(): boolean {
		return this.isPointerInsideOverlay || this.isPointerInsideHandleBridge
	}

	private syncPointerInsideHandleBridge(): boolean {
		const nextPointerInsideHandleBridge = this.canKeepActiveOverlayFromPointerGeometry()
		this.isPointerInsideHandleBridge = nextPointerInsideHandleBridge
		return nextPointerInsideHandleBridge
	}

	private shouldKeepActiveOverlayFromPointer(): boolean {
		if (this.isPointerInsideOverlay) return this.canKeepActiveOverlayForActiveElement()
		if (this.isPointerInsideHandleBridge) return this.canKeepActiveOverlayForActiveElement()
		return this.canKeepActiveOverlayFromPointerGeometry()
	}

	private canKeepActiveOverlayForActiveElement(): boolean {
		if (!this.overlayNode || !this.activeElementId) return false
		if (this.getConnectionHandleOverlayBlockReason()) return false
		if (this.getConnectionHandleElementBlockReason(this.activeElementId)) return false
		return true
	}

	private canKeepActiveOverlayFromPointerGeometry(): boolean {
		if (!this.canKeepActiveOverlayForActiveElement()) return false
		return this.isPointerInsideActiveHandleHitRegion()
	}

	private isPointerInsideActiveHandleHitRegion(): boolean {
		if (!this.isStagePointerInside) return false
		if (!this.activeElementId) return false

		const pointerPosition = this.getPointerPositionInControlsLayer()
		if (!pointerPosition) return false

		const bounds = this.canvas.elementManager
			.getNodeAdapter()
			.getElementBounds(this.activeElementId)
		if (!this.isValidRect(bounds)) return false

		const stageScale = this.getSafeStageScale()
		if (!this.canFitHandlesOnScreen(bounds, stageScale)) return false

		return this.renderer.isPointInHandleHitRegion(bounds, stageScale, pointerPosition)
	}

	private getPointerPositionInControlsLayer(): { x: number; y: number } | null {
		const pointerPosition = this.canvas.stage.getPointerPosition()
		if (!pointerPosition) return null

		const controlsTransform = this.canvas.controlsLayer.getAbsoluteTransform().copy().invert()
		return controlsTransform.point(pointerPosition)
	}

	private bindHandleInteractionEvents(overlayNode: Konva.Group): void {
		this.getHandleNodes(overlayNode).forEach((handle) => {
			handle.on("mouseenter", () => {
				this.hoveredHandleNode = handle
				this.setHandleInteractionState(
					handle,
					this.activeHandleNode === handle ? "active" : "hover",
					"connection-handle-hover",
				)
				this.canvas.cursorManager.setTemporary("pointer")
			})

			handle.on("mouseleave", () => {
				if (this.hoveredHandleNode === handle) {
					this.hoveredHandleNode = null
				}
				if (this.activeHandleNode === handle) {
					return
				}
				this.setHandleInteractionState(handle, "idle", "connection-handle-unhover")
				this.restoreHandleCursorIfIdle()
			})

			handle.on("pointerdown mousedown touchstart", (event) => {
				this.stopHandleEvent(event)
				this.activeHandleNode = handle
				this.hoveredHandleNode = handle
				this.setHandleInteractionState(handle, "active", "connection-handle-active")
				this.canvas.cursorManager.setTemporary("pointer")
				this.startConnectionDragFromHandle(handle, event)
				this.bindActiveHandleReleaseEvents()
			})

			handle.on("pointerup pointercancel mouseup touchend touchcancel", (event) => {
				this.stopHandleEvent(event)
				this.finishActiveHandle()
			})

			handle.on("click tap", (event) => {
				this.stopHandleEvent(event)
			})
		})
	}

	private setHandleInteractionState(
		handle: Konva.Group,
		state: ConnectionHandleInteractionState,
		reason: string,
	): void {
		this.renderer.setHandleInteractionState(handle, state)
		this.requestControlsDraw(reason)
	}

	private finishActiveHandle(): void {
		this.canvas.connectionDragManager?.releasePendingHandleInteraction()
		const activeHandle = this.activeHandleNode
		this.activeHandleNode = null
		this.removeActiveHandleReleaseEvents()
		if (activeHandle) {
			this.setHandleInteractionState(
				activeHandle,
				this.hoveredHandleNode === activeHandle ? "hover" : "idle",
				"connection-handle-active-end",
			)
		}
		this.restoreHandleCursorIfIdle()
	}

	private startConnectionDragFromHandle(
		handle: Konva.Group,
		event: Konva.KonvaEventObject<Event>,
	): void {
		const elementId = handle.getAttr("elementId")
		const side = this.getConnectionHandleSide(handle)
		if (!elementId || !side) return

		this.canvas.connectionDragManager?.startFromHandle({
			elementId,
			side,
			event,
		})
	}

	private getConnectionHandleSide(handle: Konva.Group): ConnectionHandleSide | null {
		const side = handle.getAttr("connectionHandleSide")
		return side === "left" || side === "right" ? side : null
	}

	private resetHandleInteractionState(): void {
		const hasInteraction = !!this.hoveredHandleNode || !!this.activeHandleNode
		const handles = new Set(
			[this.hoveredHandleNode, this.activeHandleNode].filter(
				(node): node is Konva.Group => node instanceof Konva.Group,
			),
		)
		handles.forEach((handle) => {
			if (handle.getParent()) {
				this.renderer.setHandleInteractionState(handle, "idle")
			}
		})
		this.hoveredHandleNode = null
		this.activeHandleNode = null
		this.removeActiveHandleReleaseEvents()
		if (hasInteraction) {
			this.canvas.cursorManager.restoreToolCursor()
		}
	}

	private restoreHandleCursorIfIdle(): void {
		if (this.hoveredHandleNode || this.activeHandleNode) return
		this.canvas.cursorManager.restoreToolCursor()
	}

	private bindActiveHandleReleaseEvents(): void {
		if (this.activeHandleReleaseUnsubscribers.length > 0) return
		if (typeof window === "undefined") return

		const release = () => {
			this.finishActiveHandle()
		}
		window.addEventListener("mouseup", release)
		window.addEventListener("touchend", release)
		window.addEventListener("touchcancel", release)
		this.activeHandleReleaseUnsubscribers = [
			() => window.removeEventListener("mouseup", release),
			() => window.removeEventListener("touchend", release),
			() => window.removeEventListener("touchcancel", release),
		]
	}

	private removeActiveHandleReleaseEvents(): void {
		this.activeHandleReleaseUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.activeHandleReleaseUnsubscribers = []
	}

	private stopHandleEvent(event: Konva.KonvaEventObject<Event>): void {
		event.cancelBubble = true
		event.evt?.stopPropagation()
		event.evt?.stopImmediatePropagation()
	}

	private scheduleRefreshAfterTransformSettled(): void {
		if (this.transformSettledRefreshQueued) return
		this.transformSettledRefreshQueued = true
		const schedule =
			typeof queueMicrotask === "function"
				? queueMicrotask
				: (callback: () => void) => {
						void Promise.resolve().then(callback)
					}
		schedule(() => {
			this.transformSettledRefreshQueued = false
			if (this.destroyed) return
			this.refresh()
		})
	}

	private playEnterAnimation(overlayNode: Konva.Group, stageScale: number): void {
		this.stopOverlayTweens(overlayNode)
		const handles = this.getHandleNodes(overlayNode)
		if (!this.canAnimateOverlay(overlayNode) || handles.length === 0) {
			this.showHandlesAtRest(overlayNode)
			return
		}

		handles.forEach((handle) => {
			const targetX = handle.x()
			const targetY = handle.y()
			handle.setAttrs({
				x: targetX + this.getInwardOffsetX(handle, stageScale),
				y: targetY,
				opacity: 0,
			})
			this.playTween(overlayNode, {
				node: handle,
				duration: ConnectionHandleOverlayManager.HANDLE_ENTER_DURATION_SECONDS,
				x: targetX,
				y: targetY,
				opacity: 1,
				easing: Konva.Easings.EaseOut,
				onUpdate: () => {
					this.requestControlsDraw("connection-handle-enter")
				},
				onFinish: () => {
					handle.opacity(1)
					this.requestControlsDraw("connection-handle-enter-finish")
				},
			})
		})
	}

	private playExitAnimation(overlayNode: Konva.Group): void {
		const handles = this.getHandleNodes(overlayNode)
		if (!this.canAnimateOverlay(overlayNode) || handles.length === 0) {
			this.finishExitAnimation(overlayNode)
			return
		}

		const stageScale = this.getSafeStageScale()
		let remaining = handles.length
		const finishOne = () => {
			remaining -= 1
			if (remaining <= 0) {
				this.finishExitAnimation(overlayNode)
			}
		}

		handles.forEach((handle) => {
			this.playTween(overlayNode, {
				node: handle,
				duration: ConnectionHandleOverlayManager.HANDLE_EXIT_DURATION_SECONDS,
				x: handle.x() + this.getInwardOffsetX(handle, stageScale),
				y: handle.y(),
				opacity: 0,
				easing: Konva.Easings.EaseIn,
				onUpdate: () => {
					this.requestControlsDraw("connection-handle-exit")
				},
				onFinish: finishOne,
			})
		})
	}

	private finishExitAnimation(overlayNode: Konva.Group): void {
		this.stopOverlayTweens(overlayNode)
		this.exitingOverlayNodes.delete(overlayNode)
		overlayNode.destroy()
		this.requestControlsDraw("connection-handle-exit-finish")
	}

	private showHandlesAtRest(overlayNode: Konva.Group): void {
		this.getHandleNodes(overlayNode).forEach((handle) => {
			handle.opacity(1)
		})
	}

	private getHandleNodes(overlayNode: Konva.Group): Konva.Group[] {
		return overlayNode
			.find(`.${ConnectionHandleRenderer.HANDLE_GROUP_NAME}`)
			.filter((node): node is Konva.Group => node instanceof Konva.Group)
	}

	private canAnimateOverlay(overlayNode: Konva.Group): boolean {
		return this.animationsEnabled && !!overlayNode.getLayer()
	}

	private getInwardOffsetX(handle: Konva.Group, stageScale: number): number {
		const scale = Number.isFinite(stageScale) && stageScale > 0 ? stageScale : 1
		const offset = ConnectionHandleOverlayManager.HANDLE_ANIMATION_OFFSET_PX / scale
		return handle.getAttr("connectionHandleSide") === "left" ? offset : -offset
	}

	private playTween(overlayNode: Konva.Group, config: Konva.TweenConfig): void {
		const tween = new Konva.Tween({
			...config,
			onFinish: () => {
				this.unregisterOverlayTween(overlayNode, tween)
				config.onFinish?.()
			},
		})
		this.registerOverlayTween(overlayNode, tween)
		tween.play()
	}

	private registerOverlayTween(overlayNode: Konva.Group, tween: Konva.Tween): void {
		const tweens = this.overlayTweens.get(overlayNode) ?? new Set<Konva.Tween>()
		tweens.add(tween)
		this.overlayTweens.set(overlayNode, tweens)
	}

	private unregisterOverlayTween(overlayNode: Konva.Group, tween: Konva.Tween): void {
		const tweens = this.overlayTweens.get(overlayNode)
		if (!tweens) return
		tweens.delete(tween)
		tween.destroy()
		if (tweens.size === 0) {
			this.overlayTweens.delete(overlayNode)
		}
	}

	private stopOverlayTweens(overlayNode: Konva.Group): void {
		const tweens = this.overlayTweens.get(overlayNode)
		if (!tweens) return
		tweens.forEach((tween) => {
			tween.destroy()
		})
		this.overlayTweens.delete(overlayNode)
	}

	private destroyAllOverlayTweens(): void {
		Array.from(this.overlayTweens.keys()).forEach((overlayNode) => {
			this.stopOverlayTweens(overlayNode)
		})
	}

	private destroyExitingOverlays(): void {
		this.exitingOverlayNodes.forEach((overlayNode) => {
			this.stopOverlayTweens(overlayNode)
			overlayNode.destroy()
		})
		this.exitingOverlayNodes.clear()
	}

	private disableOverlayListening(overlayNode: Konva.Group): void {
		overlayNode.listening(false)
		const selectors = ["Group", "Rect", "Circle", "Line"]
		selectors.forEach((selector) => {
			overlayNode.find(selector).forEach((node) => {
				node.listening(false)
			})
		})
	}

	private requestControlsDraw(reason: string): void {
		this.canvas.runtimeScheduler.requestLayerDraw("controls", {
			source: "ConnectionHandleOverlayManager",
			reason,
			priority: "input",
		})
	}
}
