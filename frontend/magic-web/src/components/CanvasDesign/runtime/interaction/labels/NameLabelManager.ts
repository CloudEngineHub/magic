import Konva from "konva"
import { ElementTypeEnum } from "../../document/types"
import { BaseLabelManager, type BaseLabelManagerConfig, type LabelSize } from "./BaseLabelManager"
import {
	NAME_LABEL_GROUP_PREFIX,
	NAME_LABEL_HIT_NAME,
	NAME_LABEL_ICON_NAME,
	NAME_LABEL_TEXT_NAME,
} from "./nameLabelNodeUtils"
import type { Canvas } from "../../core/Canvas"
import type { CanvasEventMap } from "../../core/EventEmitter"
import type { NameLabelIconContext, NameLabelIconResolver } from "./nameLabelTypes"

/**
 * 名称标签配置
 */
const NAME_LABEL_CONFIG = {
	/** 字体大小（像素） */
	FONT_SIZE: 12,
	/** 文本颜色 */
	TEXT_COLOR: "#737373",
	/** 字体族 */
	FONT_FAMILY: "Arial, sans-serif",
	/** 标签距离元素顶部的距离（像素） */
	OFFSET_TOP: 5,
	/** 标签左侧对齐偏移（像素） */
	OFFSET_LEFT: 0,
	/** 透明命中区相对文字的内边距，避免短名称难以点中 */
	HIT_PADDING: 2,
	/** icon 与文本之间的默认间距（标签局部坐标） */
	ICON_GAP: 4,
	/** 文本宽度变化达到该粒度时才重新布局，避免缩放每帧触发文本重排 */
	TEXT_WIDTH_BUCKET: 2,
	/** 名称标签与右侧尺寸标签之间的最小间距（标签局部坐标） */
	SIZE_LABEL_GAP: 4,
	/** 至少保留一个局部像素，避免 Konva 将宽度 0 视为自动宽度 */
	MIN_TEXT_WIDTH: 1,
} as const

interface NameLabelLayoutState {
	iconKey: string | null
	iconWidth: number
	iconHeight: number
	iconGap: number
	iconVisible: boolean
	textOffsetX: number
	naturalTextWidth: number
	textWidth: number
	canRenderText: boolean
}

/**
 * 名称标签管理器
 * 职责：
 * 1. 在独立的 Layer 上渲染所有元素的名称标签
 * 2. 监听元素变化，同步更新名称标签
 * 3. 管理名称标签的可见性（Frame/Audio 一直显示，Image 只在 hover 时显示）
 * 4. 处理名称标签的位置和缩放
 * 5. 选择工具下命中名称：hover 手势、单击选中、双击重命名（不从名称拖动元素）
 */
export class NameLabelManager extends BaseLabelManager {
	private renamingElementId: string | null = null
	private interactionUnsubscribers: Array<() => void> = []
	private pointerHoverElementId: string | null = null
	private iconHoverElementId: string | null = null
	private readonly iconResolver?: NameLabelIconResolver
	private readonly labelLayoutStates = new WeakMap<Konva.Group, NameLabelLayoutState>()

	constructor(options: { canvas: Canvas; iconResolver?: NameLabelIconResolver }) {
		const { canvas } = options
		// 构建基类配置
		const baseConfig: BaseLabelManagerConfig = {
			canvas,
			labelConfig: {
				fontSize: NAME_LABEL_CONFIG.FONT_SIZE,
				textColor: NAME_LABEL_CONFIG.TEXT_COLOR,
				fontFamily: NAME_LABEL_CONFIG.FONT_FAMILY,
				offsetTop: NAME_LABEL_CONFIG.OFFSET_TOP,
				offsetLeft: NAME_LABEL_CONFIG.OFFSET_LEFT,
			},
			visibilityConfig: {
				// 只有业务容器与媒体元素显示名称标签
				elementTypes: new Set([
					ElementTypeEnum.Frame,
					ElementTypeEnum.Image,
					ElementTypeEnum.Video,
					ElementTypeEnum.Audio,
					ElementTypeEnum.Storyboard,
					ElementTypeEnum.VideoEdit,
				]),
				// Frame、Audio 和函数型分镜节点始终显示名称。
				alwaysVisibleTypes: new Set([
					ElementTypeEnum.Frame,
					ElementTypeEnum.Audio,
					ElementTypeEnum.Storyboard,
					ElementTypeEnum.VideoEdit,
				]),
				// 图片和视频在选中或 hover 时显示
				hoverOrSelectTypes: new Set([ElementTypeEnum.Image, ElementTypeEnum.Video]),
			},
		}

		super(baseConfig)
		this.iconResolver = options.iconResolver
		this.setupInteractionListeners()
	}

	public canStartRename(elementId: string): boolean {
		return this.shouldShowLabel(elementId)
	}

	public setRenamingElementId(elementId: string | null): void {
		const previousElementId = this.renamingElementId
		this.renamingElementId = elementId

		if (previousElementId) {
			this.updateLabelVisibility(previousElementId)
		}
		if (elementId) {
			this.updateLabelVisibility(elementId)
		}
	}

	public getRenameInputLayout(elementId: string): {
		x: number
		y: number
		width: number
		height: number
		text: string
		fontSize: number
		fontFamily: string
		color: string
	} | null {
		this.createOrUpdateLabel(elementId, { forceCreate: true })

		const labelGroup = this.labelMap.get(elementId)
		if (!labelGroup) {
			return null
		}

		const textNode = this.getTextNode(labelGroup)
		if (!textNode) {
			return null
		}

		const scale = this.canvas.stage.scaleX()
		const stagePosition = this.canvas.stage.position()
		const layoutState = this.labelLayoutStates.get(labelGroup)
		const textOffsetX = layoutState?.textOffsetX ?? 0
		const textWidth = Math.max(
			layoutState?.naturalTextWidth ?? this.measureNaturalTextWidth(textNode),
			NAME_LABEL_CONFIG.MIN_TEXT_WIDTH,
		)

		return {
			x: labelGroup.x() * scale + stagePosition.x + textOffsetX * labelGroup.scaleX() * scale,
			y:
				labelGroup.y() * scale +
				stagePosition.y +
				textNode.y() * labelGroup.scaleY() * scale,
			// Rename input must use the full name width, not the truncated render width.
			width: Math.ceil(textWidth),
			height: Math.ceil(textNode.height()),
			text: textNode.text(),
			fontSize: this.labelConfig.fontSize,
			fontFamily: this.labelConfig.fontFamily,
			color: this.labelConfig.textColor,
		}
	}

	/**
	 * 获取标签文本
	 */
	protected getLabelText(elementId: string): string {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		return element?.getNameLabelText() || ""
	}

	protected override createLabel(elementId: string): Konva.Group {
		const labelText = this.getLabelText(elementId)
		const labelGroup = new Konva.Group({
			listening: this.areNameLabelsInteractive(),
			visible: false,
			name: `${NAME_LABEL_GROUP_PREFIX}${elementId}`,
		})
		const textNode = new Konva.Text({
			name: NAME_LABEL_TEXT_NAME,
			text: labelText,
			fontSize: this.labelConfig.fontSize,
			fontFamily: this.labelConfig.fontFamily,
			fill: this.labelConfig.textColor,
			wrap: "none",
			ellipsis: true,
			listening: false,
		})
		const hitRect = new Konva.Rect({
			name: NAME_LABEL_HIT_NAME,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
		})
		labelGroup.add(hitRect)
		labelGroup.add(textNode)
		this.labelLayoutStates.set(labelGroup, {
			iconKey: null,
			iconWidth: 0,
			iconHeight: 0,
			iconGap: 0,
			iconVisible: false,
			textOffsetX: 0,
			// The node is auto-sized during creation, so reuse Konva's measured
			// natural width instead of measuring the same text a second time.
			naturalTextWidth: textNode.getTextWidth(),
			textWidth: Math.max(textNode.width(), NAME_LABEL_CONFIG.MIN_TEXT_WIDTH),
			canRenderText: true,
		})
		this.syncIcon(elementId, labelGroup)
		this.syncHitRect(labelGroup)
		this.bindLabelInteraction(labelGroup, elementId)
		return labelGroup
	}

	protected override updateLabelText(labelGroup: Konva.Group, text: string): boolean {
		const textNode = this.getTextNode(labelGroup)
		if (!textNode || textNode.text() === text) return false

		textNode.text(text)
		const state = this.labelLayoutStates.get(labelGroup)
		if (state) {
			state.naturalTextWidth = this.measureNaturalTextWidth(textNode)
			state.textWidth = 0
		}
		this.syncHitRect(labelGroup)
		return true
	}

	/**
	 * Constrains only the rendered text width. The original text remains on the
	 * Konva.Text node, so rename can still read and display the complete name.
	 */
	protected override updateLabelLayout(
		elementId: string,
		element: ReturnType<typeof this.canvas.elementManager.getElementInstance>,
		labelGroup: Konva.Group,
		boundingRect: { x: number; y: number; width: number; height: number },
		inverseScale: number,
	): boolean {
		void elementId
		void element
		const textNode = this.getTextNode(labelGroup)
		const state = this.labelLayoutStates.get(labelGroup)
		if (!textNode || !state) return false

		const naturalTextWidth = state.naturalTextWidth

		const safeInverseScale = Math.max(inverseScale, Number.EPSILON)
		// getBoundingRect() is layer-relative, while the label uses inverse stage
		// scaling. Convert the element width into the label's local coordinates.
		const elementLabelWidth = Math.max(
			0,
			(boundingRect.width - this.labelConfig.offsetLeft) / safeInverseScale,
		)
		const sizeLabelReservation = this.getSizeLabelReservation(elementId)
		const availableLabelWidth = Math.max(0, elementLabelWidth - sizeLabelReservation)
		const hasIcon = state.iconKey !== null
		const fullIconWidth = hasIcon ? state.iconWidth + state.iconGap : 0
		const iconCanFit =
			hasIcon && availableLabelWidth - fullIconWidth >= NAME_LABEL_CONFIG.MIN_TEXT_WIDTH
		const textOffsetX = iconCanFit ? fullIconWidth : 0
		const availableTextWidth = Math.max(0, availableLabelWidth - textOffsetX)
		const canRenderText = availableTextWidth >= NAME_LABEL_CONFIG.MIN_TEXT_WIDTH
		const targetTextWidth = this.getRenderedTextWidth(naturalTextWidth, availableTextWidth)
		let changed = false

		if (state.textOffsetX !== textOffsetX) {
			state.textOffsetX = textOffsetX
			changed = true
		}
		if (state.iconVisible !== iconCanFit) {
			state.iconVisible = iconCanFit
			changed = true
		}
		if (state.canRenderText !== canRenderText) {
			state.canRenderText = canRenderText
			changed = true
		}
		if (state.textWidth !== targetTextWidth) {
			textNode.width(targetTextWidth)
			state.textWidth = targetTextWidth
			changed = true
		}

		const iconNode = this.getIconNode(labelGroup)
		const labelHeight = Math.max(textNode.height(), iconCanFit ? state.iconHeight : 0)
		const iconY = iconCanFit ? Math.max(0, (labelHeight - state.iconHeight) / 2) : 0
		const textY = iconCanFit ? Math.max(0, (labelHeight - textNode.height()) / 2) : 0
		if (iconNode) {
			if (iconNode.x() !== 0 || iconNode.y() !== iconY) {
				iconNode.position({ x: 0, y: iconY })
				changed = true
			}
			if (iconNode.visible() !== iconCanFit) {
				iconNode.visible(iconCanFit)
				changed = true
			}
		}
		if (textNode.x() !== textOffsetX) {
			textNode.x(textOffsetX)
			changed = true
		}
		if (textNode.y() !== textY) {
			textNode.y(textY)
			changed = true
		}

		if (changed) this.syncHitRect(labelGroup)
		return changed
	}

	protected override getLabelSize(labelGroup: Konva.Group): LabelSize | null {
		const textNode = this.getTextNode(labelGroup)
		if (!textNode) return null

		const state = this.labelLayoutStates.get(labelGroup)
		return {
			width: (state?.textOffsetX ?? 0) + textNode.width(),
			height: Math.max(textNode.height(), state?.iconVisible ? state.iconHeight : 0),
		}
	}

	private getTextNode(labelGroup: Konva.Group): Konva.Text | null {
		return labelGroup.findOne(`.${NAME_LABEL_TEXT_NAME}`) as Konva.Text | null
	}

	private measureNaturalTextWidth(textNode: Konva.Text): number {
		// Measure the full string without changing the constrained render width.
		// This keeps text measurement out of the viewport hot path and avoids
		// depending on Konva's internal "auto" width sentinel.
		const naturalWidth = textNode
			.text()
			.split("\n")
			.reduce((maxWidth, line) => Math.max(maxWidth, textNode.measureSize(line).width), 0)
		return Number.isFinite(naturalWidth) ? Math.max(0, naturalWidth) : 0
	}

	private getIconNode(labelGroup: Konva.Group): Konva.Shape | Konva.Group | null {
		return labelGroup.findOne(`.${NAME_LABEL_ICON_NAME}`) as Konva.Shape | Konva.Group | null
	}

	private getRenderedTextWidth(naturalWidth: number, availableWidth: number): number {
		if (naturalWidth <= availableWidth) {
			return Math.max(naturalWidth, NAME_LABEL_CONFIG.MIN_TEXT_WIDTH)
		}

		// Round down so a cached bucket never makes the label exceed its element.
		const bucketedWidth =
			Math.floor(availableWidth / NAME_LABEL_CONFIG.TEXT_WIDTH_BUCKET) *
			NAME_LABEL_CONFIG.TEXT_WIDTH_BUCKET
		return Math.max(bucketedWidth, NAME_LABEL_CONFIG.MIN_TEXT_WIDTH)
	}

	/**
	 * Reserve the right-side size label only while it is actually visible. The
	 * size is already reported in label-local coordinates, so it can be
	 * subtracted directly from the name label's available width.
	 */
	private getSizeLabelReservation(elementId: string): number {
		const sizeLabelManager = this.canvas.sizeLabelManager
		if (!sizeLabelManager?.isLabelVisibleForElement(elementId)) return 0

		const sizeLabelSize = sizeLabelManager.getLabelSizeForElement(elementId)
		if (!sizeLabelSize || !Number.isFinite(sizeLabelSize.width)) return 0

		return Math.max(0, sizeLabelSize.width) + NAME_LABEL_CONFIG.SIZE_LABEL_GAP
	}

	private getIconContext(elementId: string): NameLabelIconContext | null {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		if (!element) return null

		return {
			elementId,
			element,
			data: element.getData(),
			selected: this.canvas.selectionManager.isSelected(elementId),
			hovered: this.canvas.hoverManager.getHoveredElementId() === elementId,
		}
	}

	/**
	 * Resolves icons only on discrete element/state changes. Pan and scale use
	 * the cached descriptor and never invoke user code in their hot path.
	 */
	private syncIcon(elementId: string, labelGroup: Konva.Group): boolean {
		if (!this.iconResolver) return false
		const state = this.labelLayoutStates.get(labelGroup)
		if (!state) return false

		const context = this.getIconContext(elementId)
		const descriptor = context ? this.iconResolver(context) : null
		const currentNode = this.getIconNode(labelGroup)
		let changed = false

		if (!descriptor) {
			if (currentNode) {
				currentNode.destroy()
				changed = true
			}
			if (
				state.iconKey !== null ||
				state.iconWidth !== 0 ||
				state.iconHeight !== 0 ||
				state.iconGap !== 0
			) {
				state.iconKey = null
				state.iconWidth = 0
				state.iconHeight = 0
				state.iconGap = 0
				state.iconVisible = false
				state.textOffsetX = 0
				state.textWidth = 0
				changed = true
			}
			return changed
		}
		if (!context) return false

		const width = this.normalizeIconDimension(descriptor.width)
		const height = this.normalizeIconDimension(descriptor.height)
		const gap = Math.max(0, descriptor.gap ?? NAME_LABEL_CONFIG.ICON_GAP)
		const needsNewNode = !currentNode || state.iconKey !== descriptor.key
		let iconNode = currentNode

		if (needsNewNode) {
			currentNode?.destroy()
			iconNode = descriptor.create(context)
			if (!iconNode) {
				state.iconKey = null
				state.iconWidth = 0
				state.iconHeight = 0
				state.iconGap = 0
				state.iconVisible = false
				state.textOffsetX = 0
				state.textWidth = 0
				return true
			}
			iconNode.addName(NAME_LABEL_ICON_NAME)
			iconNode.listening(false)
			iconNode.visible(true)
			labelGroup.add(iconNode)
			changed = true
		} else {
			if (!iconNode) return false
			descriptor.update?.(iconNode, context)
			// update() may change the icon pixels without changing its key.
			changed = descriptor.update !== undefined
		}

		const dimensionsChanged =
			state.iconKey !== descriptor.key ||
			state.iconWidth !== width ||
			state.iconHeight !== height ||
			state.iconGap !== gap
		changed = dimensionsChanged || changed
		state.iconKey = descriptor.key
		state.iconWidth = width
		state.iconHeight = height
		state.iconGap = gap
		if (dimensionsChanged) state.textWidth = 0
		return changed
	}

	private normalizeIconDimension(value: number): number {
		return Number.isFinite(value) ? Math.max(0, value) : 0
	}

	/** Refreshes cached icon state for selected/hovered/data-changed labels. */
	public refreshIcons(elementIds?: readonly string[]): void {
		if (!this.iconResolver) return
		const ids = elementIds ? Array.from(new Set(elementIds)) : Array.from(this.labelMap.keys())
		let requiresDraw = false

		for (const elementId of ids) {
			const labelGroup = this.labelMap.get(elementId)
			if (!labelGroup) continue
			const iconChanged = this.syncIcon(elementId, labelGroup)
			requiresDraw = iconChanged || requiresDraw
			if (iconChanged) {
				requiresDraw = this.updateLabelPosition(elementId, true) || requiresDraw
			}
		}

		if (requiresDraw) {
			this.requestOverlayDraw("name-label-icons")
		}
	}

	protected override shouldRetainHiddenLabel(elementId: string): boolean {
		return this.renamingElementId === elementId
	}

	public override destroy(): void {
		this.clearPointerHover()
		this.iconHoverElementId = null
		for (const unsubscribe of this.interactionUnsubscribers) {
			unsubscribe()
		}
		this.interactionUnsubscribers = []
		super.destroy()
	}

	/**
	 * 计算标签位置（元素左上角上方）
	 */
	protected calculateLabelPosition(
		boundingRect: { x: number; y: number; width: number; height: number },
		labelSize: { width: number; height: number },
		inverseScale: number,
	): { x: number; y: number } {
		const offsetTop = this.labelConfig.offsetTop
		const offsetLeft = this.labelConfig.offsetLeft

		// 由于标签应用了 inverseScale，在计算位置时需要将 labelHeight 和 offsetTop 也应用 inverseScale
		// 这样才能保证在不同缩放级别下，标签的视觉位置保持一致
		const scaledLabelHeight = labelSize.height * inverseScale
		const scaledOffsetTop = offsetTop * inverseScale

		// 计算标签位置（元素左上角上方）
		// 标签的 y 坐标 = 元素顶部 - 间距 - 标签高度
		// 这样标签的底部会距离元素顶部 offsetTop 的距离
		return {
			x: boundingRect.x + offsetLeft,
			y: boundingRect.y - scaledLabelHeight - scaledOffsetTop,
		}
	}

	/**
	 * 计算自定义可见性（检查 name label 是否超出元素宽度）
	 * @param elementId - 元素 ID
	 * @param element - 元素实例
	 * @param labelGroup - 标签组
	 * @param baseVisibility - 基础可见性
	 * @returns 自定义可见性
	 */
	protected calculateCustomVisibility(
		elementId: string,
		element: ReturnType<typeof this.canvas.elementManager.getElementInstance>,
		labelGroup: Konva.Group,
		baseVisibility: boolean,
	): boolean | null {
		void labelGroup
		void element
		if (this.renamingElementId === elementId) {
			return false
		}

		// 如果基础可见性为 false，不需要检查自定义逻辑
		if (!baseVisibility) {
			return null
		}

		const state = this.labelLayoutStates.get(labelGroup)
		if (state && !state.canRenderText) {
			return false
		}

		// 文本已经按元素宽度设置了 ellipsis，宽度不足不再隐藏整个标签。
		return null
	}

	private setupInteractionListeners(): void {
		this.listenInteraction("tool:change")
		this.listenInteraction("crop:enter")
		this.listenInteraction("crop:exit")
		this.listenInteraction("extend:enter")
		this.listenInteraction("extend:exit")
		this.listenInteraction("eraser:enter")
		this.listenInteraction("eraser:exit")
		this.listenInteraction("text:editing-state-change")
		this.listenInteraction("permission:changed")
		if (!this.iconResolver) return

		this.interactionUnsubscribers.push(
			this.canvas.eventEmitter.on("element:select", ({ data }) => {
				this.refreshIcons(data.elementIds)
			}),
			this.canvas.eventEmitter.on("element:deselect", ({ data }) => {
				this.refreshIcons(data?.elementIds)
			}),
			this.canvas.eventEmitter.on("element:hover", ({ data }) => {
				const previousHoveredElementId = this.iconHoverElementId
				this.iconHoverElementId = data.elementId
				this.refreshIcons(
					[previousHoveredElementId, data.elementId].filter(Boolean) as string[],
				)
			}),
			this.canvas.eventEmitter.on("element:updated", ({ data }) => {
				this.refreshIcons([data.elementId])
			}),
			this.canvas.eventEmitter.on("document:restored", () => {
				this.refreshIcons()
			}),
		)
	}

	private listenInteraction<K extends keyof CanvasEventMap>(eventType: K): void {
		this.interactionUnsubscribers.push(
			this.canvas.eventEmitter.on(eventType, () => {
				this.syncLabelListening()
			}),
		)
	}

	/**
	 * 仅在选择工具且无独占编辑会话时接收命中。
	 * 平移/形状/裁剪等工具下必须关闭，避免挡住落笔或手柄。
	 */
	private areNameLabelsInteractive(): boolean {
		const { toolManager, cropManager, extendManager, eraserManager, textEditingManager } =
			this.canvas
		if (!toolManager?.getSelectionTool) return false
		if (toolManager.getActiveTool() !== toolManager.getSelectionTool()) return false
		if (cropManager?.getCroppingElementId()) return false
		if (extendManager?.getExtendingElementId()) return false
		if (eraserManager?.getErasingElementId()) return false
		if (textEditingManager?.isEditing()) return false
		return true
	}

	private syncLabelListening(): void {
		const listening = this.areNameLabelsInteractive()
		for (const labelGroup of this.labelMap.values()) {
			labelGroup.listening(listening)
		}
		if (
			this.pointerHoverElementId &&
			(!listening || !this.canvas.elementRenameManager?.canRename(this.pointerHoverElementId))
		) {
			this.clearPointerHover()
		}
	}

	private syncHitRect(labelGroup: Konva.Group): void {
		const labelSize = this.getLabelSize(labelGroup)
		const hitRect = labelGroup.findOne(`.${NAME_LABEL_HIT_NAME}`) as Konva.Rect | null
		if (!labelSize || !hitRect) return

		const padding = NAME_LABEL_CONFIG.HIT_PADDING
		const attrs = {
			x: -padding,
			y: -padding,
			width: Math.max(labelSize.width + padding * 2, padding * 2),
			height: Math.max(labelSize.height + padding * 2, padding * 2),
		}
		if (
			hitRect.x() !== attrs.x ||
			hitRect.y() !== attrs.y ||
			hitRect.width() !== attrs.width ||
			hitRect.height() !== attrs.height
		) {
			hitRect.setAttrs(attrs)
		}
	}

	private bindLabelInteraction(labelGroup: Konva.Group, elementId: string): void {
		const stopPointerEvent = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			e.cancelBubble = true
			e.evt?.stopPropagation()
		}

		labelGroup.on("mousedown touchstart", (e) => {
			stopPointerEvent(e)
			this.selectElementFromLabel(elementId)
		})
		labelGroup.on("mouseup click tap", stopPointerEvent)
		labelGroup.on("dblclick dbltap", (e) => {
			stopPointerEvent(e)
			this.canvas.elementRenameManager?.startRename(elementId)
		})
		labelGroup.on("contextmenu", (e) => {
			e.evt.preventDefault()
			stopPointerEvent(e)
			this.selectElementFromLabel(elementId)
			this.canvas.eventEmitter.emit({
				type: "element:contextmenu",
				data: {
					elementId,
					x: e.evt.clientX,
					y: e.evt.clientY,
				},
			})
		})
		labelGroup.on("mouseenter", () => {
			this.pointerHoverElementId = elementId
			if (this.canvas.elementRenameManager?.canRename(elementId)) {
				this.canvas.cursorManager.setTemporary("pointer")
			}
		})
		labelGroup.on("mouseleave", () => {
			if (this.pointerHoverElementId === elementId) {
				this.clearPointerHover()
			}
		})
	}

	private selectElementFromLabel(elementId: string): void {
		const elementData = this.canvas.elementManager.getElementData(elementId)
		if (!this.canvas.permissionManager.canSelect(elementData)) {
			return
		}
		if (this.canvas.selectionManager.isSelected(elementId)) {
			if (this.canvas.selectionManager.getSelectionCount() > 1) {
				this.canvas.selectionManager.replaceSelection([elementId])
			}
			return
		}
		this.canvas.connectionManager?.deselectConnection()
		this.canvas.selectionManager.replaceSelection([elementId])
	}

	private clearPointerHover(): void {
		if (!this.pointerHoverElementId) return
		this.pointerHoverElementId = null
		this.canvas.cursorManager?.restoreToolCursor()
	}
}
