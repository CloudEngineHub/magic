import Konva from "konva"
import { ElementTypeEnum } from "../../document/types"
import { BaseLabelManager, type BaseLabelManagerConfig } from "./BaseLabelManager"
import { NAME_LABEL_GROUP_PREFIX, NAME_LABEL_HIT_NAME } from "./nameLabelNodeUtils"
import type { Canvas } from "../../core/Canvas"
import type { CanvasEventMap } from "../../core/EventEmitter"

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
	/** 名称与右侧尺寸标签之间的最小间距（标签局部坐标） */
	LABEL_GAP: 4,
	/** 省略后仍保留的最小文本宽度，避免标签节点宽度为 0 */
	MIN_TEXT_WIDTH: 8,
} as const

/**
 * 名称标签管理器
 * 职责：
 * 1. 在独立的 Layer 上渲染所有元素的名称标签
 * 2. 监听元素变化，同步更新名称标签
 * 3. 管理名称标签的可见性（媒体标签默认常驻，可通过画布设置切回 hover/选中显示）
 * 4. 处理名称标签的位置和缩放
 * 5. 选择工具下命中名称：hover 手势、单击选中、双击重命名（不从名称拖动元素）
 */
export class NameLabelManager extends BaseLabelManager {
	private renamingElementId: string | null = null
	private interactionUnsubscribers: Array<() => void> = []
	private pointerHoverElementId: string | null = null
	private domLabelElementId: string | null = null
	private naturalTextWidths = new WeakMap<Konva.Text, { key: string; width: number }>()

	constructor(options: { canvas: Canvas }) {
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
		this.setupInteractionListeners()
	}

	public canStartRename(elementId: string): boolean {
		return this.shouldShowLabel(elementId)
	}

	/** 铅笔使用名称的屏幕坐标；沿用同一权限和工具条件，不为 DOM 入口绕过限制。 */
	public getRenameButtonLayout(elementId: string): { x: number; y: number } | null {
		if (
			this.renamingElementId ||
			!this.areNameLabelsInteractive() ||
			this.canvas.elementManager.getElementData(elementId)?.type !== ElementTypeEnum.Image ||
			!this.canvas.elementRenameManager.canRename(elementId)
		)
			return null
		const layout = this.getDisplayLabelLayout(elementId)
		if (!layout || !this.labelMap.get(elementId)?.visible()) return null
		if (!this.getMediaRowLayout(elementId)?.showOperation) return null
		const bounds = this.canvas.elementManager.getElementInstance(elementId)?.getBoundingRect()
		if (!bounds || layout.width + 24 > bounds.width * this.canvas.stage.scaleX()) return null
		return { x: layout.x + layout.width, y: layout.y + layout.height - 24 }
	}

	/** 只把当前可交互图片的名称交给 DOM；布局和其它元素标签仍由原管理器维护。 */
	public getImageNameLabelLayout(
		elementId: string,
	): ReturnType<NameLabelManager["getRenameInputLayout"]> {
		if (
			this.renamingElementId ||
			!this.areNameLabelsInteractive() ||
			this.canvas.elementManager.getElementData(elementId)?.type !== ElementTypeEnum.Image
		)
			return null
		const layout = this.getDisplayLabelLayout(elementId)
		return layout && this.labelMap.get(elementId)?.visible() ? layout : null
	}

	public setDOMLabelElementId(elementId: string | null): void {
		if (this.domLabelElementId === elementId) return
		const previous = this.domLabelElementId
		this.domLabelElementId = elementId
		// DOM 文字支持原生选中复制，只隐藏同一标签的 Konva 文字，避免双份文字重叠。
		if (previous) this.labelMap.get(previous)?.findOne<Konva.Text>("Text")?.opacity(1)
		if (elementId) this.labelMap.get(elementId)?.findOne<Konva.Text>("Text")?.opacity(0)
		this.canvas.runtimeScheduler.requestLayerDraw("overlay", {
			source: "NameLabelManager",
			reason: "dom-name-label",
			priority: "input",
		})
	}

	/** 浏览文字使用最终屏幕比例；编辑入口继续通过 getRenameInputLayout 读取全文。 */
	public getDisplayLabelLayout(
		elementId: string,
	): ReturnType<NameLabelManager["getRenameInputLayout"]> {
		const layout = this.getRenameInputLayout(elementId)
		const group = this.labelMap.get(elementId)
		const textNode = group?.findOne<Konva.Text>("Text")
		if (!layout || !group?.visible() || !textNode) return null
		const screenRatio = group.scaleX() * this.canvas.stage.scaleX()
		return {
			...layout,
			width: textNode.width() * screenRatio,
			height: textNode.height() * screenRatio,
			fontSize: textNode.fontSize() * screenRatio,
		}
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

		const textNode = labelGroup.findOne("Text") as Konva.Text | null
		if (!textNode) {
			return null
		}

		const scale = this.canvas.stage.scaleX()
		const stagePosition = this.canvas.stage.position()

		return {
			x: labelGroup.x() * scale + stagePosition.x,
			y: labelGroup.y() * scale + stagePosition.y,
			width: Math.ceil(
				this.canvas.elementManager.getElementData(elementId)?.type === ElementTypeEnum.Image
					? textNode.width()
					: this.getNaturalTextWidth(textNode),
			),
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

	protected override getLabelGap(): number {
		return NAME_LABEL_CONFIG.LABEL_GAP
	}

	protected override getLabelOperationScreenWidth(elementId: string): number {
		return this.canvas.elementManager.getElementData(elementId)?.type ===
			ElementTypeEnum.Image && this.canvas.elementRenameManager.canRename(elementId)
			? 24
			: 0
	}

	protected override createLabel(elementId: string): Konva.Group {
		const labelText = this.getLabelText(elementId)
		const labelGroup = new Konva.Group({
			listening: this.areNameLabelsInteractive(),
			visible: false,
			name: `${NAME_LABEL_GROUP_PREFIX}${elementId}`,
		})
		const textNode = new Konva.Text({
			text: labelText,
			fontSize: this.labelConfig.fontSize,
			fontFamily: this.labelConfig.fontFamily,
			fill: this.labelConfig.textColor,
			listening: false,
			opacity: this.domLabelElementId === elementId ? 0 : 1,
		})
		const hitRect = new Konva.Rect({
			name: NAME_LABEL_HIT_NAME,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: true,
		})
		labelGroup.add(hitRect)
		labelGroup.add(textNode)
		this.syncHitRect(labelGroup)
		this.bindLabelInteraction(labelGroup, elementId)
		return labelGroup
	}

	protected override updateLabelText(labelGroup: Konva.Group, text: string): boolean {
		const changed = super.updateLabelText(labelGroup, text)
		if (changed) {
			this.syncHitRect(labelGroup)
		}
		return changed
	}

	/**
	 * 名称与尺寸共用一行时，优先保留右侧完整尺寸信息。
	 * 名称只收窄渲染宽度并启用省略号，文本本身不改写，重命名仍能读取完整名称。
	 */
	protected override updateLabelLayout(
		elementId: string,
		element: ReturnType<typeof this.canvas.elementManager.getElementInstance>,
		labelGroup: Konva.Group,
		boundingRect: { x: number; y: number; width: number; height: number },
		inverseScale: number,
	): boolean {
		void boundingRect.x
		void boundingRect.y
		void boundingRect.height
		if (this.renamingElementId === elementId) return false

		const textNode = labelGroup.findOne("Text") as Konva.Text | null
		if (!textNode) return false

		const safeInverseScale = Math.max(inverseScale, Number.EPSILON)
		const mediaLayout = this.getMediaRowLayout(elementId)
		// 媒体使用整行的标题优先预算；下方原有尺寸预留规则只用于其它元素。
		const otherLabelSizes = this.getOtherLabelSizes(elementId)
		const reservedWidth = otherLabelSizes.reduce(
			(maxWidth, size) => Math.max(maxWidth, size.width),
			0,
		)
		// 图片名称为 24px 铅笔命中区预留空间。尺寸文本能放下时也预留其真实宽度，
		// 长标题只在标签中省略，编辑面板仍读取完整元素名，不把铅笔压到尺寸标注上。
		const buttonWidth =
			element?.getData().type === ElementTypeEnum.Image &&
			this.canvas.permissionManager.canRename(element.getData())
				? 24
				: 0
		const availableTextWidth = Math.max(
			NAME_LABEL_CONFIG.MIN_TEXT_WIDTH,
			boundingRect.width / safeInverseScale -
				reservedWidth -
				NAME_LABEL_CONFIG.LABEL_GAP -
				buttonWidth,
		)
		const naturalTextWidth = this.getNaturalTextWidth(textNode)
		const targetTextWidth = mediaLayout
			? Math.max(Number.EPSILON, mediaLayout.nameWidth)
			: Math.min(naturalTextWidth, availableTextWidth)

		textNode.wrap("none")
		textNode.ellipsis(true)
		if (textNode.width() === targetTextWidth) return false
		textNode.width(targetTextWidth)
		this.syncHitRect(labelGroup)
		return true
	}

	/** 完整文本宽度独立于省略布局；仅文本或字体变化时重新测量，缩放可以恢复全文。 */
	private getNaturalTextWidth(textNode: Konva.Text): number {
		const key = JSON.stringify([
			textNode.text(),
			textNode.fontFamily(),
			textNode.fontSize(),
			textNode.fontStyle(),
			textNode.fontVariant(),
			textNode.letterSpacing(),
		])
		const cached = this.naturalTextWidths.get(textNode)
		if (cached?.key === key) return cached.width
		const width = Math.max(
			...textNode
				.text()
				.split("\n")
				.map(
					(line) =>
						textNode.measureSize(line).width + line.length * textNode.letterSpacing(),
				),
		)
		this.naturalTextWidths.set(textNode, { key, width })
		return width
	}

	protected override shouldRetainHiddenLabel(elementId: string): boolean {
		return this.renamingElementId === elementId
	}

	public override destroy(): void {
		this.clearPointerHover()
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
		const elementType = element?.getData().type
		if (
			this.isMediaLabelsAlwaysVisible() &&
			(elementType === ElementTypeEnum.Image || elementType === ElementTypeEnum.Video)
		) {
			return null
		}

		if (
			this.renamingElementId === elementId &&
			element?.getData().type !== ElementTypeEnum.Image
		) {
			return false
		}

		// 如果基础可见性为 false，不需要检查自定义逻辑
		if (!baseVisibility) {
			return null
		}

		// 检查 name label 是否超出元素宽度
		const boundingRect = element?.getBoundingRect()
		if (boundingRect) {
			const textNode = labelGroup.findOne("Text") as Konva.Text
			if (textNode) {
				// 获取标签的实际显示尺寸（考虑缩放）
				const scaleX = labelGroup.scaleX()
				const labelWidth = textNode.width() * scaleX
				const labelX = labelGroup.x()

				// 检测 name label 是否超出元素宽度
				if (
					this.checkLabelExceedsElementWidth(
						{ x: labelX, width: labelWidth },
						boundingRect,
					)
				) {
					return false
				}
			}
		}

		// 不修改基础可见性
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
		const textNode = labelGroup.findOne("Text") as Konva.Text | null
		const hitRect = labelGroup.findOne(`.${NAME_LABEL_HIT_NAME}`) as Konva.Rect | null
		if (!textNode || !hitRect) return

		const padding = NAME_LABEL_CONFIG.HIT_PADDING
		hitRect.setAttrs({
			x: -padding,
			y: -padding,
			width: Math.max(textNode.width() + padding * 2, padding * 2),
			height: Math.max(textNode.height() + padding * 2, padding * 2),
		})
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
		labelGroup.on("mouseup", stopPointerEvent)
		labelGroup.on("click tap", (e) => {
			stopPointerEvent(e)
		})
		labelGroup.on("dblclick dbltap", (e) => {
			stopPointerEvent(e)
			if (
				this.canvas.elementManager.getElementData(elementId)?.type !== ElementTypeEnum.Image
			)
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
