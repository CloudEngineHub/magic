import Konva from "konva"
import { COLORS, IMAGE_CONFIG, LAYOUT } from "../image/ImageElement.config"
import infoIcon from "../../../assets/svg/Info.svg"
import type { Canvas } from "../../core/Canvas"

export type ElementCornerActionPlacement = "top-right" | "bottom-right"

export type ElementCornerActionIcon = "info" | "fullscreen"

export interface ElementCornerActionConfig {
	key: string
	placement: ElementCornerActionPlacement
	icon: ElementCornerActionIcon
	onClick: () => void
}

export interface ElementCornerActionsDecoratorConfig {
	elementId: string
	canvas: Canvas
	width: number
	height: number
	actions: ElementCornerActionConfig[]
}

/**
 * 元素角落操作装饰器：统一管理 info / fullscreen 等悬浮按钮的定位、缩放与交互。
 */
export class ElementCornerActionsDecorator {
	private group: Konva.Group
	private config: ElementCornerActionsDecoratorConfig
	private rootGroup?: Konva.Group
	private actionGroups = new Map<string, Konva.Group>()
	private viewportScaleHandler?: () => void
	private elementTransformHandler?: () => void
	private hoverChangeHandler?: (event: { data: { elementId: string | null } }) => void
	private selectHandler?: () => void
	private deselectHandler?: () => void
	private mouseEnterHandler?: () => void
	private mouseLeaveHandler?: () => void
	private dragStartHandler?: () => void
	private dragEndHandler?: () => void
	private isHovering = false

	constructor(group: Konva.Group, config: ElementCornerActionsDecoratorConfig) {
		this.group = group
		this.config = config
	}

	public create(): void {
		this.destroyButtonNodes()
		if (this.config.actions.length === 0) return

		const rootGroup = new Konva.Group({
			x: 0,
			y: 0,
			listening: true,
			visible: false,
			name: "decorator-corner-actions",
		})

		this.rootGroup = rootGroup
		this.actionGroups.clear()

		this.config.actions.forEach((action) => {
			const actionGroup = this.createActionButton(action)
			rootGroup.add(actionGroup)
			this.actionGroups.set(action.key, actionGroup)
		})

		this.group.add(rootGroup)
		rootGroup.moveToTop()
		this.updateButtonScale()
		this.setupViewportScaleListener()
		this.setupElementTransformListener()
		this.setupHoverBehavior()
		this.syncHoverStateFromCanvas()
		this.group.getLayer()?.batchDraw()
	}

	private createActionButton(action: ElementCornerActionConfig): Konva.Group {
		const buttonSize = IMAGE_CONFIG.INFO_BUTTON_SIZE
		const buttonGroup = new Konva.Group({
			listening: true,
			name: `decorator-corner-action-${action.key}`,
		})

		const buttonBg = new Konva.Rect({
			x: 0,
			y: 0,
			width: buttonSize,
			height: buttonSize,
			cornerRadius: IMAGE_CONFIG.CORNER_RADIUS,
			fill: COLORS.BUTTON_BG,
			listening: true,
			name: `decorator-corner-action-${action.key}-button`,
		})

		buttonGroup.add(buttonBg)
		this.addIconNode(buttonGroup, action)
		this.setupButtonEvents(buttonBg, action)

		return buttonGroup
	}

	private addIconNode(buttonGroup: Konva.Group, action: ElementCornerActionConfig): void {
		if (action.icon === "fullscreen") {
			buttonGroup.add(this.createFullscreenIcon())
			return
		}

		const iconImage = new Image()
		iconImage.onload = () => {
			if (this.actionGroups.get(action.key) !== buttonGroup) return
			const iconSize = IMAGE_CONFIG.INFO_ICON_SIZE
			const iconOffset = (IMAGE_CONFIG.INFO_BUTTON_SIZE - iconSize) / 2
			buttonGroup.add(
				new Konva.Image({
					image: iconImage,
					width: iconSize,
					height: iconSize,
					x: iconOffset,
					y: iconOffset,
					listening: false,
				}),
			)
			buttonGroup.moveToTop()
			this.group.getLayer()?.batchDraw()
		}
		iconImage.src = infoIcon
	}

	private createFullscreenIcon(): Konva.Group {
		const size = 14
		const corner = 4
		const stroke = 1.5
		const iconOffset = (IMAGE_CONFIG.INFO_BUTTON_SIZE - size) / 2
		const icon = new Konva.Group({
			x: iconOffset,
			y: iconOffset,
			width: size,
			height: size,
			listening: false,
		})
		const lines = [
			[corner, 0, 0, 0, 0, corner],
			[size - corner, 0, size, 0, size, corner],
			[0, size - corner, 0, size, corner, size],
			[size, size - corner, size, size, size - corner, size],
		]

		lines.forEach((points) => {
			icon.add(
				new Konva.Line({
					points,
					stroke: "#FAFAFA",
					strokeWidth: stroke,
					lineCap: "round",
					lineJoin: "round",
					listening: false,
				}),
			)
		})

		return icon
	}

	private setupButtonEvents(buttonBg: Konva.Rect, action: ElementCornerActionConfig): void {
		const handleAction = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			e.cancelBubble = true
			if (e.evt) {
				e.evt.stopPropagation()
				e.evt.stopImmediatePropagation()
			}

			if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
				return
			}

			this.config.canvas.selectionManager.replaceSelection([this.config.elementId])
			action.onClick()
		}

		buttonBg.on("mousedown tap", handleAction)

		buttonBg.on("mouseup mousemove click tap", (e) => {
			e.cancelBubble = true
			if (e.evt) {
				e.evt.stopPropagation()
			}
		})

		buttonBg.on("mouseenter", () => {
			if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
				return
			}
			buttonBg.fill(COLORS.BUTTON_BG_HOVER)
			this.config.canvas.cursorManager.setTemporary("pointer")
			this.group.getLayer()?.batchDraw()
		})

		buttonBg.on("mouseleave", () => {
			if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
				return
			}
			buttonBg.fill(COLORS.BUTTON_BG)
			this.config.canvas.cursorManager.restoreToolCursor()
			this.group.getLayer()?.batchDraw()
		})

		buttonBg.on("touchstart", (e) => {
			e.cancelBubble = true
			if (e.evt) {
				e.evt.stopPropagation()
			}
			if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
				return
			}
			buttonBg.fill(COLORS.BUTTON_BG_HOVER)
			this.group.getLayer()?.batchDraw()
		})

		buttonBg.on("touchend touchcancel", (e) => {
			e.cancelBubble = true
			if (e.evt) {
				e.evt.stopPropagation()
			}
			if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
				return
			}
			buttonBg.fill(COLORS.BUTTON_BG)
			this.group.getLayer()?.batchDraw()
		})
	}

	public updateButtonScale(): void {
		if (!this.rootGroup) return

		const stage = this.rootGroup.getStage()
		if (!stage) return

		const viewportScale = stage.scaleX()
		const elementScaleX = this.group.scaleX()
		const elementScaleY = this.group.scaleY()
		const elementScreenWidth = Math.abs(this.config.width * elementScaleX * viewportScale)
		const elementScreenHeight = Math.abs(this.config.height * elementScaleY * viewportScale)
		const minElementScreenSize = Math.min(elementScreenWidth, elementScreenHeight)

		if (minElementScreenSize < IMAGE_CONFIG.MIN_ELEMENT_SCREEN_SIZE_FOR_INFO_BUTTON) {
			this.rootGroup.visible(false)
			return
		}

		const inverseScaleX = 1 / (viewportScale * elementScaleX)
		const inverseScaleY = 1 / (viewportScale * elementScaleY)
		const buttonSize = IMAGE_CONFIG.INFO_BUTTON_SIZE
		const scaledButtonWidth = buttonSize * inverseScaleX
		const scaledButtonHeight = buttonSize * inverseScaleY
		const canvasOffsetX = this.resolveCanvasOffset(viewportScale * elementScaleX)
		const canvasOffsetY = this.resolveCanvasOffset(viewportScale * elementScaleY)

		this.config.actions.forEach((action) => {
			const actionGroup = this.actionGroups.get(action.key)
			if (!actionGroup) return
			actionGroup.scale({ x: inverseScaleX, y: inverseScaleY })
			actionGroup.position({
				x: this.resolveActionX(action.placement, scaledButtonWidth, canvasOffsetX),
				y: this.resolveActionY(action.placement, scaledButtonHeight, canvasOffsetY),
			})
		})

		this.rootGroup.visible(this.isHovering && !this.hasMultipleSelection())
		this.rootGroup.moveToTop()
	}

	private resolveCanvasOffset(totalScale: number): number {
		const baseCanvasOffset = IMAGE_CONFIG.OFFSET
		if (!Number.isFinite(totalScale) || totalScale <= 0) return baseCanvasOffset
		const screenOffset = baseCanvasOffset * totalScale
		if (screenOffset > LAYOUT.MAX_SCREEN_OFFSET) {
			return LAYOUT.MAX_SCREEN_OFFSET / totalScale
		}
		if (screenOffset < LAYOUT.MIN_SCREEN_OFFSET) {
			return LAYOUT.MIN_SCREEN_OFFSET / totalScale
		}
		return baseCanvasOffset
	}

	private resolveActionX(
		placement: ElementCornerActionPlacement,
		scaledButtonWidth: number,
		canvasOffsetX: number,
	): number {
		if (placement === "top-right" || placement === "bottom-right") {
			return this.config.width - scaledButtonWidth - canvasOffsetX
		}
		return canvasOffsetX
	}

	private resolveActionY(
		placement: ElementCornerActionPlacement,
		scaledButtonHeight: number,
		canvasOffsetY: number,
	): number {
		if (placement === "bottom-right") {
			return this.config.height - scaledButtonHeight - canvasOffsetY
		}
		return canvasOffsetY
	}

	public updateConfig(config: Partial<ElementCornerActionsDecoratorConfig>): void {
		const nextActions = config.actions ?? this.config.actions
		const shouldRecreate = config.actions !== undefined
		this.config = { ...this.config, ...config, actions: nextActions }

		if (shouldRecreate) {
			this.create()
			return
		}

		this.updateButtonScale()
	}

	private setupViewportScaleListener(): void {
		if (this.viewportScaleHandler) return
		this.viewportScaleHandler = () => {
			this.syncHoverStateFromCanvas()
			this.updateButtonScale()
			this.rootGroup?.getLayer()?.batchDraw()
		}
		this.config.canvas.eventEmitter.on("viewport:scale", this.viewportScaleHandler)
	}

	private removeViewportScaleListener(): void {
		if (!this.viewportScaleHandler) return
		this.config.canvas.eventEmitter.off("viewport:scale", this.viewportScaleHandler)
		this.viewportScaleHandler = undefined
	}

	private setupElementTransformListener(): void {
		if (this.elementTransformHandler) return
		this.elementTransformHandler = () => {
			this.updateButtonScale()
			this.rootGroup?.getLayer()?.batchDraw()
		}
		this.group.on("transform", this.elementTransformHandler)
	}

	private removeElementTransformListener(): void {
		if (!this.elementTransformHandler) return
		this.group.off("transform", this.elementTransformHandler)
		this.elementTransformHandler = undefined
	}

	private setupHoverBehavior(): void {
		if (!this.hoverChangeHandler) {
			this.hoverChangeHandler = () => {
				this.syncHoverStateFromCanvas()
			}
			this.config.canvas.eventEmitter.on("element:hover", this.hoverChangeHandler)
		}

		if (!this.selectHandler) {
			this.selectHandler = () => {
				this.syncHoverStateFromCanvas()
			}
			this.config.canvas.eventEmitter.on("element:select", this.selectHandler)
		}

		if (!this.mouseEnterHandler) {
			this.mouseEnterHandler = () => {
				if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
					return
				}
				this.show()
			}
			this.group.on("mouseenter", this.mouseEnterHandler)
		}

		if (!this.mouseLeaveHandler) {
			this.mouseLeaveHandler = () => {
				this.hide()
			}
			this.group.on("mouseleave", this.mouseLeaveHandler)
		}

		if (!this.deselectHandler) {
			this.deselectHandler = () => {
				if (!this.config.canvas.selectionManager.isSelected(this.config.elementId)) {
					this.hide()
				}
			}
			this.config.canvas.eventEmitter.on("element:deselect", this.deselectHandler)
		}

		if (!this.dragStartHandler) {
			this.dragStartHandler = () => {
				this.hide()
			}
			this.group.on("dragstart", this.dragStartHandler)
		}

		if (!this.dragEndHandler) {
			this.dragEndHandler = () => {
				if (!this.config.canvas.permissionManager.canUseSelectionToolAffordance()) {
					return
				}
				const stage = this.group.getStage()
				const pointerPos = stage?.getPointerPosition()
				if (!stage || !pointerPos) return
				const shape = stage.getIntersection(pointerPos)
				const isInGroup =
					shape &&
					(this.group.findOne(
						(node: Konva.Node) => node === shape || shape.getAncestors().includes(node),
					) ||
						shape.name().startsWith("decorator-"))
				if (isInGroup) {
					this.show()
				}
			}
			this.group.on("dragend", this.dragEndHandler)
		}
	}

	private removeHoverBehavior(): void {
		if (this.hoverChangeHandler) {
			this.config.canvas.eventEmitter.off("element:hover", this.hoverChangeHandler)
			this.hoverChangeHandler = undefined
		}
		if (this.selectHandler) {
			this.config.canvas.eventEmitter.off("element:select", this.selectHandler)
			this.selectHandler = undefined
		}
		if (this.mouseEnterHandler) {
			this.group.off("mouseenter", this.mouseEnterHandler)
			this.mouseEnterHandler = undefined
		}
		if (this.mouseLeaveHandler) {
			this.group.off("mouseleave", this.mouseLeaveHandler)
			this.mouseLeaveHandler = undefined
		}
		if (this.deselectHandler) {
			this.config.canvas.eventEmitter.off("element:deselect", this.deselectHandler)
			this.deselectHandler = undefined
		}
		if (this.dragStartHandler) {
			this.group.off("dragstart", this.dragStartHandler)
			this.dragStartHandler = undefined
		}
		if (this.dragEndHandler) {
			this.group.off("dragend", this.dragEndHandler)
			this.dragEndHandler = undefined
		}
	}

	private syncHoverStateFromCanvas(): void {
		if (
			!this.config.canvas.permissionManager.canUseSelectionToolAffordance() ||
			this.isConnectionDragging() ||
			this.hasMultipleSelection()
		) {
			this.hide()
			return
		}

		if (this.config.canvas.hoverManager.getHoveredElementId() === this.config.elementId) {
			this.show()
			return
		}

		if (
			this.shouldUseTouchAffordance() &&
			this.config.canvas.selectionManager.isSelected(this.config.elementId)
		) {
			this.show()
			return
		}

		if (!this.config.canvas.selectionManager.isSelected(this.config.elementId)) {
			this.hide()
		}
	}

	private shouldUseTouchAffordance(): boolean {
		return this.config.canvas.deviceInfo?.input.touch === true
	}

	public show(): void {
		if (this.isConnectionDragging() || this.hasMultipleSelection()) {
			this.hide()
			return
		}
		this.isHovering = true
		if (!this.rootGroup) return
		this.rootGroup.visible(true)
		this.rootGroup.moveToTop()
		this.updateButtonScale()
		this.group.getLayer()?.batchDraw()
	}

	public hide(): void {
		this.isHovering = false
		if (!this.rootGroup) return
		this.rootGroup.visible(false)
		this.group.getLayer()?.batchDraw()
	}

	private isConnectionDragging(): boolean {
		return this.config.canvas.connectionDragManager?.isDraggingConnection?.() === true
	}

	private hasMultipleSelection(): boolean {
		return this.config.canvas.selectionManager.getSelectionCount() > 1
	}

	private destroyButtonNodes(): void {
		this.rootGroup?.destroy()
		this.rootGroup = undefined
		this.actionGroups.clear()
	}

	public destroy(): void {
		this.removeViewportScaleListener()
		this.removeElementTransformListener()
		this.removeHoverBehavior()
		this.destroyButtonNodes()
	}
}
