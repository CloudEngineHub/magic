import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import { isConnectionNode } from "../connection/connectionNodeUtils"
import {
	pickSelectedElementIdAtStagePointer,
	resolveManagedElementIdFromKonvaNode,
} from "../transform/elementNodeUtils"

/**
 * Hover 管理器 - 管理元素的 hover 效果
 * 职责：
 * 1. 监听鼠标移入/移出事件
 * 2. 在 hover 时显示边框
 * 3. 发出 hover 事件
 */
export class HoverManager {
	private canvas: Canvas

	// Hover 状态
	private hoveredElementId: string | null = null
	private hoverNode: Konva.Shape | Konva.Group | null = null
	private hoverNodeIsDefault = false
	private pendingHoverTarget: Konva.Node | null = null
	private hoverRafId: number | null = null
	private eventUnsubscribers: Array<() => void> = []
	private isViewportGestureActive = false

	// Hover 边框样式配置（静态属性，供其他类使用）
	public static readonly HOVER_STROKE = "#3B82F6"
	// public static readonly HOVER_STROKE_WIDTH = 1.25
	public static readonly HOVER_STROKE_WIDTH = 2

	constructor(options: { canvas: Canvas }) {
		const { canvas } = options
		this.canvas = canvas

		this.setupEventListeners()
	}

	/**
	 * 设置事件监听
	 */
	private setupEventListeners(): void {
		// 监听鼠标移动事件
		this.canvas.stage.on("mousemove", this.handleMouseMove)

		// 监听鼠标离开 stage 事件
		this.canvas.stage.on("mouseleave", this.handleMouseLeave)

		// 监听元素删除事件，如果删除的是 hover 的元素，清除 hover 状态
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("element:deleted", ({ data }) => {
				const { elementId } = data
				if (this.hoveredElementId === elementId) {
					this.clearHover()
				}
			}),
		)

		// 选中元素仍然可以拥有 hover 身份，用于连接 handle 等 hover-only affordance；
		// 但选中态自身已有 Transformer，不再绘制 hover 边框。
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("element:select", () => {
				this.clearHoverNode()
				this.refreshHoverAtCurrentPointer()
			}),
		)

		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("element:deselect", () => {
				this.refreshHoverAtCurrentPointer()
			}),
		)

		// 监听元素拖拽移动事件，清除 hover
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("elements:transform:dragstart", () => {
				this.clearHover()
			}),
		)

		// 监听视口缩放事件，鼠标未移动时也要重新命中当前指针下的元素
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("viewport:scale", () => {
				if (this.isViewportGestureActive) {
					this.clearHover()
					return
				}
				this.refreshHoverAtCurrentPointer()
				this.updateHoverStrokeWidth()
			}),
		)

		// 监听视口平移事件，鼠标未移动时也要重新命中当前指针下的元素
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("viewport:pan", () => {
				if (this.isViewportGestureActive) {
					this.clearHover()
					return
				}
				this.refreshHoverAtCurrentPointer()
			}),
		)

		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("viewport:gesture", ({ data }) => {
				this.isViewportGestureActive = data.active
				if (data.active) {
					this.pendingHoverTarget = null
					this.cancelHoverFlush()
					this.clearHover()
				}
			}),
		)

		// 监听文档恢复事件（撤销/恢复时触发）
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("document:restored", () => {
				// 清除 hover 状态，因为元素位置可能已经改变
				this.clearHover()
			}),
		)

		// 监听裁剪模式进入事件，清除 hover（裁剪模式下元素不应显示 hover 效果）
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("crop:enter", () => {
				this.clearHover()
			}),
		)

		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("extend:enter", () => {
				this.pendingHoverTarget = null
				this.cancelHoverFlush()
				this.clearHover()
			}),
		)

		// 监听橡皮擦模式进入事件，清除 hover（橡皮擦模式下元素不应显示 hover 效果）
		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("eraser:enter", () => {
				this.clearHover()
			}),
		)
	}

	/**
	 * 处理鼠标移动事件
	 */
	private handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
		if (this.shouldSuppressHover()) {
			this.pendingHoverTarget = null
			this.cancelHoverFlush()
			this.clearHover()
			return
		}

		this.pendingHoverTarget = e.target
		this.scheduleHoverFlush()
	}

	private scheduleHoverFlush(): void {
		if (this.hoverRafId !== null) return
		const schedule =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback: FrameRequestCallback) => window.setTimeout(callback, 16)
		this.hoverRafId = schedule(() => {
			this.hoverRafId = null
			this.flushPendingHover()
		})
	}

	private cancelHoverFlush(): void {
		if (this.hoverRafId === null) return
		const cancel =
			typeof cancelAnimationFrame === "function"
				? cancelAnimationFrame
				: (id: number) => window.clearTimeout(id)
		cancel(this.hoverRafId)
		this.hoverRafId = null
	}

	private flushPendingHover(): void {
		const target = this.pendingHoverTarget
		this.pendingHoverTarget = null

		this.resolveHoverTarget(target)
	}

	private refreshHoverAtCurrentPointer(): void {
		if (this.shouldSuppressHover()) {
			this.clearHover()
			return
		}

		const pointerPosition = this.canvas.stage.getPointerPosition()
		if (!pointerPosition) {
			this.clearHover()
			return
		}

		if (this.canvas.connectionManager.hasConnections()) {
			const targetAtPointer = this.canvas.stage.getIntersection?.(pointerPosition)
			if (targetAtPointer && this.isConnectionTarget(targetAtPointer)) {
				this.clearHover()
				return
			}
		}

		const elementId = this.getElementIdAtPointer(pointerPosition)
		if (!elementId) {
			this.clearHover()
			return
		}

		if (this.isHoverStateCurrentForElement(elementId)) {
			return
		}

		this.setHover(elementId)
	}

	private resolveHoverTarget(target: Konva.Node | null): void {
		if (this.shouldSuppressHover()) {
			this.clearHover()
			return
		}

		const transformInteractionActive =
			this.canvas.transformManager.isTransformInteractionActive()
		if (!target || transformInteractionActive) {
			this.clearHover()
			return
		}

		if (this.isConnectionTarget(target)) {
			this.clearHover()
			return
		}

		const targetIsTransformer = this.isTransformerNode(target)
		const elementId = this.getElementIdFromTarget(target)
		if (!elementId) {
			this.clearHover()
			return
		}

		// 检查是否是有效的元素节点
		if (!targetIsTransformer && !this.isValidElementNode(target)) {
			this.clearHover()
			return
		}

		const invalidElementReason = this.getInvalidElementIdReason(elementId)
		if (invalidElementReason) {
			this.clearHover()
			return
		}

		// 如果已经 hover 在同一个元素上，不做处理
		if (this.isHoverStateCurrentForElement(elementId)) {
			return
		}

		// 更新 hover 状态
		this.setHover(elementId)
	}

	/**
	 * 处理鼠标离开 stage 事件
	 */
	private handleMouseLeave = (): void => {
		this.pendingHoverTarget = null
		this.cancelHoverFlush()
		this.clearHover()
	}

	/**
	 * 设置 hover 状态
	 */
	private setHover(elementId: string): void {
		if (this.shouldSuppressHover()) {
			this.clearHover()
			return
		}

		// 如果元素已被选中，只保留 hover 身份，不绘制 hover 边框。
		if (this.canvas.selectionManager.isSelected(elementId)) {
			this.clearHoverNode()
			this.setHoveredElementId(elementId)
			return
		}

		// 使用 NodeAdapter 获取元素边界和 hover 效果
		const adapter = this.canvas.elementManager.getNodeAdapter()
		const boundingRect = adapter.getElementBounds(elementId)
		if (!boundingRect) {
			this.clearHover()
			return
		}

		// 尝试从 Element 获取自定义 hover 效果
		let hoverNode: Konva.Shape | Konva.Group | null = adapter.createHoverEffect(
			elementId,
			this.canvas.stage,
		)
		let isDefaultHoverNode = false

		// 如果没有自定义 hover 效果，使用默认的矩形边框
		if (!hoverNode) {
			isDefaultHoverNode = true
			if (this.hoverNodeIsDefault && this.hoverNode instanceof Konva.Rect) {
				hoverNode = this.hoverNode
				hoverNode.setAttrs({
					x: boundingRect.x,
					y: boundingRect.y,
					width: boundingRect.width,
					height: boundingRect.height,
					stroke: HoverManager.HOVER_STROKE,
					strokeWidth: HoverManager.HOVER_STROKE_WIDTH / this.canvas.stage.scaleX(),
				})
			} else {
				hoverNode = new Konva.Rect({
					x: boundingRect.x,
					y: boundingRect.y,
					width: boundingRect.width,
					height: boundingRect.height,
					stroke: HoverManager.HOVER_STROKE,
					strokeWidth: HoverManager.HOVER_STROKE_WIDTH / this.canvas.stage.scaleX(),
					listening: false,
					name: "hover-rect",
				})
			}
		}

		if (this.hoverNode && this.hoverNode !== hoverNode) {
			this.hoverNode.destroy()
		}

		if (!hoverNode.getParent()) {
			this.canvas.controlsLayer.add(hoverNode)
		}
		hoverNode.moveToTop()
		this.requestControlsDraw("hover-set")

		// 更新状态
		this.hoverNode = hoverNode
		this.hoverNodeIsDefault = isDefaultHoverNode
		this.setHoveredElementId(elementId)
	}

	/**
	 * 更新 hover 效果（当缩放改变时调用）
	 */
	private updateHoverStrokeWidth(): void {
		if (!this.hoverNode || !this.hoveredElementId) return

		// 尝试使用 Element 的自定义更新方法
		const element = this.canvas.elementManager.getElementInstance(this.hoveredElementId)
		if (element && typeof element.updateHoverEffect === "function") {
			element.updateHoverEffect(this.hoverNode, this.canvas.stage)
			// 确保使用正确的 strokeWidth（覆盖自定义方法可能使用的错误值）
			this.applyHoverStrokeWidth(this.hoverNode)
		} else {
			// 默认更新描边宽度
			this.applyHoverStrokeWidth(this.hoverNode)
		}

		this.requestControlsDraw("hover-stroke")
	}

	/**
	 * 递归应用 hover 边框宽度到节点及其子节点
	 */
	private applyHoverStrokeWidth(node: Konva.Node): void {
		if (node instanceof Konva.Shape) {
			node.strokeWidth(HoverManager.HOVER_STROKE_WIDTH / this.canvas.stage.scaleX())
		} else if (node instanceof Konva.Group) {
			// 递归更新 Group 中的所有子节点
			node.children.forEach((child) => {
				this.applyHoverStrokeWidth(child)
			})
		}
	}

	/**
	 * 清除 hover 状态
	 */
	private clearHover(): void {
		this.clearHoverNode()
		this.setHoveredElementId(null)
	}

	private clearHoverNode(): void {
		if (!this.hoverNode) return
		this.hoverNode.destroy()
		this.hoverNode = null
		this.hoverNodeIsDefault = false
		this.requestControlsDraw("hover-clear")
	}

	private setHoveredElementId(elementId: string | null): void {
		if (this.hoveredElementId === elementId) return
		this.hoveredElementId = elementId
		this.canvas.eventEmitter.emit({ type: "element:hover", data: { elementId } })
	}

	private isHoverStateCurrentForElement(elementId: string): boolean {
		if (this.hoveredElementId !== elementId) return false
		return this.canvas.selectionManager.isSelected(elementId)
			? this.hoverNode === null
			: this.hoverNode !== null
	}

	/**
	 * 从节点沿父链解析 ElementManager 中的元素 ID
	 */
	private getElementIdFromNode(node: Konva.Node): string | null {
		return resolveManagedElementIdFromKonvaNode(node, this.canvas) ?? null
	}

	private getElementIdFromTarget(node: Konva.Node): string | null {
		const elementId = this.getElementIdFromNode(node)
		if (elementId) return elementId
		if (!this.isTransformerNode(node)) return null

		const pointerPosition = this.canvas.stage.getPointerPosition()
		if (!pointerPosition) return null
		return pickSelectedElementIdAtStagePointer(this.canvas, pointerPosition) ?? null
	}

	private isTransformerNode(node: Konva.Node): boolean {
		return (
			node.getClassName() === "Transformer" ||
			node.getParent()?.getClassName() === "Transformer"
		)
	}

	/**
	 * 判断节点是否是有效的可 hover 元素
	 */
	private isValidElementNode(node: Konva.Node): boolean {
		// 排除 Stage
		if (node === this.canvas.stage) {
			return false
		}

		// 排除 Layer
		if (node.getClassName() === "Layer") {
			return false
		}

		// 排除 Transformer 及其子元素
		if (this.isTransformerNode(node)) {
			return false
		}

		// 连接线拥有独立的 hover/selection 反馈，不参与元素 hover。
		if (this.isConnectionTarget(node)) {
			return false
		}

		// 排除 hover 边框自身
		if (node.name() === "hover-rect") {
			return false
		}

		// 排除框选工具矩形
		if (node.name() === "selection-tool-rect") {
			return false
		}

		const elementId = this.getElementIdFromNode(node)

		if (!elementId) {
			return false
		}

		return this.getInvalidElementIdReason(elementId) === null
	}

	private getInvalidElementIdReason(elementId: string): string | null {
		// 使用 PermissionManager 统一判断元素是否可以 hover
		const elementData = this.canvas.elementManager.getElementData(elementId)
		if (!this.canvas.permissionManager.canHover(elementData)) {
			return "cannot-hover"
		}

		// 普通选中态也会绑定 Transformer；只有正在拖拽/缩放的交互态才阻止 hover。
		if (this.isElementInActiveTransformInteraction(elementId)) {
			return "transforming"
		}

		// 排除正在拖拽时的所有元素
		if (this.canvas.transformManager.isDraggingElement()) {
			return "dragging-element"
		}

		return null
	}

	private getElementIdAtPointer(pointerPosition: { x: number; y: number }): string | null {
		if (this.canvas.transformManager.isTransformInteractionActive()) {
			return null
		}

		const layerTransform = this.canvas.contentLayer.getAbsoluteTransform().copy().invert()
		const layerPosition = layerTransform.point(pointerPosition)
		const candidateIds = this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
			{
				x: layerPosition.x,
				y: layerPosition.y,
				width: 0,
				height: 0,
			},
			0,
		)

		let topElementId: string | null = null
		let topAbsoluteZIndex = Number.NEGATIVE_INFINITY
		const adapter = this.canvas.elementManager.getNodeAdapter()
		candidateIds.forEach((elementId) => {
			const invalidReason = this.getInvalidElementIdReason(elementId)
			if (invalidReason) {
				return
			}

			const bounds = adapter.getElementBounds(elementId)
			if (
				!bounds ||
				layerPosition.x < bounds.x ||
				layerPosition.x > bounds.x + bounds.width ||
				layerPosition.y < bounds.y ||
				layerPosition.y > bounds.y + bounds.height
			) {
				return
			}

			const node = this.canvas.elementManager.getElementInstance(elementId)?.getNode()
			const absoluteZIndex = node?.getAbsoluteZIndex() ?? 0
			if (absoluteZIndex >= topAbsoluteZIndex) {
				topAbsoluteZIndex = absoluteZIndex
				topElementId = elementId
			}
		})

		return topElementId
	}

	private isElementInActiveTransformInteraction(elementId: string): boolean {
		const transformManager = this.canvas.transformManager
		if (typeof transformManager.isElementInActiveTransformInteraction === "function") {
			return transformManager.isElementInActiveTransformInteraction(elementId)
		}
		return (
			transformManager.isTransformInteractionActive() &&
			transformManager.isTransforming(elementId)
		)
	}

	private isConnectionTarget(node: Konva.Node): boolean {
		return isConnectionNode(node)
	}

	private isExtendModeActive(): boolean {
		return Boolean(this.canvas.extendManager?.getExtendingElementId?.())
	}

	private isConnectionDragActive(): boolean {
		return this.canvas.connectionDragManager?.isDraggingConnection?.() === true
	}

	private shouldSuppressHover(): boolean {
		return (
			this.isViewportGestureActive ||
			this.isExtendModeActive() ||
			this.isConnectionDragActive()
		)
	}

	/**
	 * 获取当前 hover 的元素 ID
	 */
	public getHoveredElementId(): string | null {
		return this.hoveredElementId
	}

	/**
	 * 手动设置 hover 状态（用于外部触发，如图层面板）
	 */
	public manualSetHover(elementId: string | null): void {
		if (elementId === null) {
			this.clearHover()
		} else {
			// 检查元素是否存在
			if (this.canvas.elementManager.hasElement(elementId)) {
				this.setHover(elementId)
			}
		}
	}

	/**
	 * 销毁管理器
	 */
	public destroy(): void {
		this.cancelHoverFlush()

		// 清除 hover 状态
		this.clearHover()

		// 移除事件监听
		this.canvas.stage.off("mousemove", this.handleMouseMove)
		this.canvas.stage.off("mouseleave", this.handleMouseLeave)
		this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.eventUnsubscribers = []
	}

	private requestControlsDraw(reason: string): void {
		this.canvas.runtimeScheduler.requestLayerDraw("controls", {
			source: "HoverManager",
			reason,
			priority: "input",
		})
	}
}
