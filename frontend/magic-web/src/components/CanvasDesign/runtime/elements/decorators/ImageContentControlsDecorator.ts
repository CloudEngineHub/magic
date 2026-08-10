import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import type { ImageElement, VideoElement } from "../../document/types"
import {
	COLORS,
	IMAGE_CONFIG,
	LAYOUT,
	resolveImageControlCanvasOffset,
} from "../image/ImageElement.config"

interface ImageContentControlsDecoratorConfig {
	elementId: string
	canvas: Canvas
	width: number
	height: number
	data: ImageElement | VideoElement
	/** 节点命名前缀；默认保持图片既有命名，视频复用时使用 video。 */
	namePrefix?: "image" | "video"
	bottomRightReservedScreenWidth?: number
	onPrevious: () => void
	onNext: () => void
	onSetMain: () => void
}

type InteractionState = "idle" | "hover" | "active"

const CONTROL_HEIGHT = IMAGE_CONFIG.INFO_BUTTON_SIZE
const BUTTON_WIDTH = IMAGE_CONFIG.INFO_BUTTON_SIZE
const INDEX_WIDTH = 33
const PANEL_PADDING = 4
const BUTTON_RADIUS = IMAGE_CONFIG.CORNER_RADIUS
const GAP = 4
const MAIN_BUTTON_MIN_WIDTH = 72
const MAIN_BUTTON_HORIZONTAL_PADDING = LAYOUT.TEXT_PADDING_X
const MAIN_TAG_HORIZONTAL_PADDING = LAYOUT.TEXT_PADDING_X
const ACTIVE_SCALE = 0.94
const BUTTON_TEXT_COLOR = "#FFFFFF"
const BUTTON_IDLE_TEXT_COLOR = "rgba(255,255,255,0.78)"
const BUTTON_DISABLED_TEXT_COLOR = "rgba(255,255,255,0.38)"
const BUTTON_DISABLED_BG = "rgba(0,0,0,0.35)"
const ACTIVE_BG = "rgba(0, 0, 0, 0.96)"
const TRANSPARENT_BG = "rgba(0,0,0,0)"

/** 图片 Content 控制器：保持屏幕尺寸，并提供完整 hover / active / disabled 反馈。 */
export class ImageContentControlsDecorator {
	private root?: Konva.Group
	private mainTag?: Konva.Group
	private viewportHandler?: () => void
	private transformHandler?: () => void
	private readonlyHandler?: () => void
	private hoverChangeHandler?: (event: { data: { elementId: string | null } }) => void
	private selectionChangeHandler?: () => void
	private mouseEnterHandler?: () => void
	private mouseLeaveHandler?: () => void
	private interactionRefreshers = new Set<() => void>()
	private mainButton?: Konva.Group
	private navigationScreenWidth = 0
	private mainButtonScreenWidth = 0
	private isElementHovered = false

	constructor(
		private readonly elementGroup: Konva.Group,
		private config: ImageContentControlsDecoratorConfig,
	) {}

	public create(): void {
		this.destroyNodes()
		if (this.config.data.contents.length <= 1) return
		const currentIndex = this.config.data.contents.findIndex(
			(content) => content.contentId === this.config.data.activeContentId,
		)
		if (currentIndex < 0) return

		const root = new Konva.Group({
			name: `${this.config.namePrefix ?? "image"}-content-controls`,
			listening: true,
		})
		const active = this.config.data.contents[currentIndex]
		if (active.contentId === this.config.data.mainContentId) {
			this.mainTag = this.createMainTag()
			this.elementGroup.add(this.mainTag)
		}
		const canSetMain =
			active.contentId !== this.config.data.mainContentId &&
			active.status === "completed" &&
			Boolean(active.src)
		const panelWidth = BUTTON_WIDTH * 2 + INDEX_WIDTH + PANEL_PADDING * 2
		this.navigationScreenWidth = panelWidth
		const panel = new Konva.Group({
			name: `${this.config.namePrefix ?? "image"}-content-navigation`,
			listening: true,
		})

		panel.add(
			new Konva.Rect({
				width: panelWidth,
				height: CONTROL_HEIGHT,
				cornerRadius: CONTROL_HEIGHT / 2,
				fill: COLORS.BUTTON_BG,
				listening: false,
			}),
		)

		const previousButton = this.createButton({
			x: PANEL_PADDING,
			key: "previous",
			disabled: currentIndex === 0,
			variant: "plain",
			chevron: "previous",
			onClick: this.config.onPrevious,
		})
		const nextButton = this.createButton({
			x: PANEL_PADDING + BUTTON_WIDTH + INDEX_WIDTH,
			key: "next",
			disabled: currentIndex === this.config.data.contents.length - 1,
			variant: "plain",
			chevron: "next",
			onClick: this.config.onNext,
		})
		panel.add(
			previousButton,
			new Konva.Text({
				x: PANEL_PADDING + BUTTON_WIDTH,
				y: 0,
				width: INDEX_WIDTH,
				height: CONTROL_HEIGHT,
				text: `${currentIndex + 1} / ${this.config.data.contents.length}`,
				fontSize: LAYOUT.TEXT_FONT_SIZE,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
				align: "center",
				verticalAlign: "middle",
				fill: BUTTON_TEXT_COLOR,
				listening: false,
			}),
			nextButton,
		)
		root.add(panel)

		if (canSetMain) {
			const label = this.config.canvas.t
				? this.config.canvas.t("image.content.setMain", { defaultValue: "设为主版本" })
				: "设为主版本"
			const labelProbe = new Konva.Text({
				text: label,
				fontSize: LAYOUT.TEXT_FONT_SIZE,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
			})
			const mainButtonWidth = Math.max(
				MAIN_BUTTON_MIN_WIDTH,
				Math.ceil(labelProbe.getTextWidth() + MAIN_BUTTON_HORIZONTAL_PADDING * 2),
			)
			labelProbe.destroy()
			this.mainButtonScreenWidth = mainButtonWidth
			this.mainButton = this.createButton({
				x: panelWidth + GAP,
				key: "set-main",
				label,
				width: mainButtonWidth,
				onClick: this.config.onSetMain,
			})
			root.add(this.mainButton)
		}

		this.root = root
		this.elementGroup.add(root)
		root.moveToTop()
		this.mainTag?.moveToTop()
		this.syncHoverStateFromCanvas()
		this.updateLayout()
		this.setupListeners()
	}

	public updateConfig(config: Partial<ImageContentControlsDecoratorConfig>): void {
		this.config = { ...this.config, ...config }
		this.create()
	}

	/** 在元素重新挂回 Stage 后调用，修复重渲染期间的首次布局时序。 */
	public refreshLayout(): void {
		this.updateLayout()
	}

	public destroy(): void {
		this.destroyNodes()
		if (this.viewportHandler) {
			this.config.canvas.eventEmitter.off("viewport:scale", this.viewportHandler)
			this.viewportHandler = undefined
		}
		if (this.transformHandler) {
			this.elementGroup.off("transform", this.transformHandler)
			this.transformHandler = undefined
		}
		if (this.readonlyHandler) {
			this.config.canvas.eventEmitter.off("canvas:readonly", this.readonlyHandler)
			this.readonlyHandler = undefined
		}
		if (this.hoverChangeHandler) {
			this.config.canvas.eventEmitter.off("element:hover", this.hoverChangeHandler)
			this.hoverChangeHandler = undefined
		}
		if (this.selectionChangeHandler) {
			this.config.canvas.eventEmitter.off("element:select", this.selectionChangeHandler)
			this.config.canvas.eventEmitter.off("element:deselect", this.selectionChangeHandler)
			this.selectionChangeHandler = undefined
		}
		if (this.mouseEnterHandler) {
			this.elementGroup.off("mouseenter", this.mouseEnterHandler)
			this.mouseEnterHandler = undefined
		}
		if (this.mouseLeaveHandler) {
			this.elementGroup.off("mouseleave", this.mouseLeaveHandler)
			this.mouseLeaveHandler = undefined
		}
	}

	private createMainTag(): Konva.Group {
		const label = this.config.canvas.t
			? this.config.canvas.t("image.content.main", { defaultValue: "主版本" })
			: "主版本"
		const labelProbe = new Konva.Text({
			text: label,
			fontSize: LAYOUT.TEXT_FONT_SIZE,
			fontFamily: LAYOUT.TEXT_FONT_FAMILY,
		})
		const width = Math.ceil(labelProbe.getTextWidth() + MAIN_TAG_HORIZONTAL_PADDING * 2)
		labelProbe.destroy()

		const tag = new Konva.Group({
			width,
			height: CONTROL_HEIGHT,
			name: `${this.config.namePrefix ?? "image"}-content-main-tag`,
			listening: false,
		})
		tag.add(
			new Konva.Rect({
				width,
				height: CONTROL_HEIGHT,
				cornerRadius: IMAGE_CONFIG.CORNER_RADIUS,
				fill: COLORS.BUTTON_BG,
				listening: false,
				name: `${this.config.namePrefix ?? "image"}-content-main-tag-background`,
			}),
			new Konva.Text({
				width,
				height: CONTROL_HEIGHT,
				text: label,
				fontSize: LAYOUT.TEXT_FONT_SIZE,
				fontFamily: LAYOUT.TEXT_FONT_FAMILY,
				align: "center",
				verticalAlign: "middle",
				fill: BUTTON_TEXT_COLOR,
				listening: false,
				name: `${this.config.namePrefix ?? "image"}-content-main-tag-label`,
			}),
		)
		return tag
	}

	private createButton(options: {
		x: number
		key: string
		label?: string
		disabled?: boolean
		width?: number
		variant?: "filled" | "plain"
		chevron?: "previous" | "next"
		onClick: () => void
	}): Konva.Group {
		const width = options.width ?? BUTTON_WIDTH
		const variant = options.variant ?? "filled"
		const group = new Konva.Group({
			x: options.x,
			width,
			height: CONTROL_HEIGHT,
			name: `${this.config.namePrefix ?? "image"}-content-button-${options.key}`,
			listening: true,
		})
		const visual = new Konva.Group({
			x: width / 2,
			y: CONTROL_HEIGHT / 2,
			listening: false,
			name: `${this.config.namePrefix ?? "image"}-content-button-${options.key}-visual`,
		})
		const background = new Konva.Rect({
			x: -width / 2,
			y: -CONTROL_HEIGHT / 2,
			width,
			height: CONTROL_HEIGHT,
			cornerRadius: BUTTON_RADIUS,
			fill: variant === "plain" ? TRANSPARENT_BG : COLORS.BUTTON_BG,
			listening: false,
		})
		const content =
			options.chevron === undefined
				? new Konva.Text({
						x: -width / 2,
						y: -CONTROL_HEIGHT / 2,
						width,
						height: CONTROL_HEIGHT,
						text: options.label ?? "",
						fontSize: LAYOUT.TEXT_FONT_SIZE,
						fontFamily: LAYOUT.TEXT_FONT_FAMILY,
						align: "center",
						verticalAlign: "middle",
						fill: BUTTON_TEXT_COLOR,
						listening: false,
					})
				: this.createChevron(options.chevron, options.key)
		const hitTarget = new Konva.Rect({
			width,
			height: CONTROL_HEIGHT,
			fill: "rgba(0,0,0,0.001)",
			listening: true,
			name: `${this.config.namePrefix ?? "image"}-content-button-${options.key}-hit`,
		})

		visual.add(background, content)
		group.add(visual, hitTarget)
		this.bindInteraction({
			node: group,
			visual,
			background,
			content,
			disabled: options.disabled ?? false,
			variant,
			onClick: options.onClick,
		})
		return group
	}

	private createChevron(direction: "previous" | "next", key: string): Konva.Shape {
		const directionSign = direction === "previous" ? -1 : 1
		const startX = directionSign * -2.5
		const vertexX = directionSign * 3.25
		const cornerOffsetX = directionSign * 1.5
		const cornerOffsetY = 1

		return new Konva.Shape({
			x: 0,
			y: 0,
			stroke: BUTTON_IDLE_TEXT_COLOR,
			strokeWidth: 2,
			lineCap: "round",
			lineJoin: "round",
			sceneFunc: (context, shape) => {
				context.beginPath()
				context.moveTo(startX, -4)
				context.lineTo(vertexX - cornerOffsetX, -cornerOffsetY)
				context.quadraticCurveTo(vertexX, 0, vertexX - cornerOffsetX, cornerOffsetY)
				context.lineTo(startX, 4)
				context.strokeShape(shape)
			},
			listening: false,
			name: `${this.config.namePrefix ?? "image"}-content-button-${key}-chevron`,
		})
	}

	private bindInteraction(options: {
		node: Konva.Group
		visual: Konva.Group
		background: Konva.Rect
		content: Konva.Text | Konva.Shape
		disabled: boolean
		variant: "filled" | "plain"
		onClick: () => void
	}): void {
		let pointerInside = false
		let state: InteractionState = "idle"
		const refresh = () => {
			const enabled = !options.disabled && !this.config.canvas.readonly
			const resolvedState = enabled ? state : "idle"
			if (options.variant === "plain") {
				options.background.fill(TRANSPARENT_BG)
				const color = !enabled
					? BUTTON_DISABLED_TEXT_COLOR
					: resolvedState === "idle"
						? BUTTON_IDLE_TEXT_COLOR
						: BUTTON_TEXT_COLOR
				if (options.content instanceof Konva.Text) {
					options.content.fill(color)
				} else {
					options.content.stroke(color)
				}
			} else {
				options.background.fill(
					!enabled
						? BUTTON_DISABLED_BG
						: resolvedState === "active"
							? ACTIVE_BG
							: resolvedState === "hover"
								? COLORS.BUTTON_BG_HOVER
								: COLORS.BUTTON_BG,
				)
				if (options.content instanceof Konva.Text) {
					options.content.fill(enabled ? BUTTON_TEXT_COLOR : BUTTON_DISABLED_TEXT_COLOR)
				}
			}
			options.visual.scale({
				x: resolvedState === "active" ? ACTIVE_SCALE : 1,
				y: resolvedState === "active" ? ACTIVE_SCALE : 1,
			})
			this.root?.getLayer()?.batchDraw()
		}
		const setState = (nextState: InteractionState) => {
			state = nextState
			refresh()
		}
		const stop = (event: Konva.KonvaEventObject<Event>) => {
			event.cancelBubble = true
			event.evt?.stopPropagation()
		}
		const isEnabled = () => !options.disabled && !this.config.canvas.readonly

		this.interactionRefreshers.add(refresh)
		options.node.on("mouseenter", () => {
			pointerInside = true
			setState("hover")
			this.config.canvas.cursorManager?.setTemporary(isEnabled() ? "pointer" : "not-allowed")
		})
		options.node.on("mouseleave", () => {
			pointerInside = false
			setState("idle")
			this.config.canvas.cursorManager?.restoreToolCursor()
		})
		options.node.on("mousedown touchstart", (event) => {
			stop(event)
			if (isEnabled()) setState("active")
		})
		options.node.on("mouseup touchend touchcancel", (event) => {
			stop(event)
			setState(pointerInside ? "hover" : "idle")
		})
		options.node.on("click tap", (event) => {
			stop(event)
			if (!isEnabled()) return
			options.onClick()
			setState(pointerInside ? "hover" : "idle")
		})
		refresh()
	}

	private updateLayout(): void {
		if (!this.root) return
		if (!this.root.getStage()) return
		const absoluteScale = this.elementGroup.getAbsoluteScale()
		const totalScaleX = Math.abs(absoluteScale.x)
		const totalScaleY = Math.abs(absoluteScale.y)
		if (!totalScaleX || !totalScaleY) return
		const canvasOffsetX = resolveImageControlCanvasOffset(totalScaleX)
		const canvasOffsetY = resolveImageControlCanvasOffset(totalScaleY)
		const elementScreenWidth = Math.abs(this.config.width * totalScaleX)
		const elementScreenHeight = Math.abs(this.config.height * totalScaleY)
		const minElementScreenSize = Math.min(elementScreenWidth, elementScreenHeight)
		const showContentNavigation = minElementScreenSize >= LAYOUT.MIN_CONTENT_SCREEN_SIZE
		const edgeScreenOffset = canvasOffsetX * totalScaleX
		const bottomRightReservedScreenWidth = Math.max(
			0,
			this.config.bottomRightReservedScreenWidth ?? 0,
		)
		const requiredMainButtonScreenWidth =
			edgeScreenOffset +
			this.navigationScreenWidth +
			GAP +
			this.mainButtonScreenWidth +
			(bottomRightReservedScreenWidth > 0 ? GAP + bottomRightReservedScreenWidth : 0) +
			edgeScreenOffset
		this.root.scale({ x: 1 / totalScaleX, y: 1 / totalScaleY })
		this.root.position({
			x: canvasOffsetX,
			y: this.config.height - CONTROL_HEIGHT / totalScaleY - canvasOffsetY,
		})
		const showInteractiveControls =
			showContentNavigation && this.isElementHovered && this.canShowInteractiveControls()
		this.root.visible(showInteractiveControls)
		this.mainTag?.scale({ x: 1 / totalScaleX, y: 1 / totalScaleY })
		this.mainTag?.position({ x: canvasOffsetX, y: canvasOffsetY })
		this.mainTag?.visible(showContentNavigation)
		this.mainButton?.visible(
			showInteractiveControls && elementScreenWidth >= requiredMainButtonScreenWidth,
		)
		this.root.opacity(this.config.canvas.readonly ? 0.55 : 1)
		this.mainTag?.opacity(this.config.canvas.readonly ? 0.55 : 1)
		this.interactionRefreshers.forEach((refresh) => refresh())
		this.root.moveToTop()
		this.mainTag?.moveToTop()
		this.root.getLayer()?.batchDraw()
	}

	private setupListeners(): void {
		if (!this.viewportHandler) {
			this.viewportHandler = () => this.updateLayout()
			this.config.canvas.eventEmitter.on("viewport:scale", this.viewportHandler)
		}
		if (!this.transformHandler) {
			this.transformHandler = () => this.updateLayout()
			this.elementGroup.on("transform", this.transformHandler)
		}
		if (!this.readonlyHandler) {
			this.readonlyHandler = () => this.updateLayout()
			this.config.canvas.eventEmitter.on("canvas:readonly", this.readonlyHandler)
		}
		if (!this.hoverChangeHandler) {
			this.hoverChangeHandler = (event) => {
				this.isElementHovered = event.data.elementId === this.config.elementId
				this.updateLayout()
			}
			this.config.canvas.eventEmitter.on("element:hover", this.hoverChangeHandler)
		}
		if (!this.selectionChangeHandler) {
			this.selectionChangeHandler = () => this.updateLayout()
			this.config.canvas.eventEmitter.on("element:select", this.selectionChangeHandler)
			this.config.canvas.eventEmitter.on("element:deselect", this.selectionChangeHandler)
		}
		if (!this.mouseEnterHandler) {
			this.mouseEnterHandler = () => {
				this.isElementHovered = true
				this.updateLayout()
			}
			this.elementGroup.on("mouseenter", this.mouseEnterHandler)
		}
		if (!this.mouseLeaveHandler) {
			this.mouseLeaveHandler = () => {
				this.isElementHovered = false
				this.updateLayout()
			}
			this.elementGroup.on("mouseleave", this.mouseLeaveHandler)
		}
	}

	private syncHoverStateFromCanvas(): void {
		this.isElementHovered =
			this.config.canvas.hoverManager?.getHoveredElementId() === this.config.elementId
	}

	private canShowInteractiveControls(): boolean {
		return (
			this.config.canvas.permissionManager.canUseSelectionToolAffordance() &&
			this.config.canvas.connectionDragManager?.isDraggingConnection?.() !== true &&
			this.config.canvas.selectionManager.getSelectionCount() <= 1
		)
	}

	private destroyNodes(): void {
		this.interactionRefreshers.clear()
		this.root?.destroy()
		this.mainTag?.destroy()
		this.root = undefined
		this.mainTag = undefined
		this.mainButton = undefined
		this.navigationScreenWidth = 0
		this.mainButtonScreenWidth = 0
	}
}
