import Konva from "konva"
import { ElementTypeEnum } from "../../document/types"
import { getActiveContent } from "../../document/elementContent"
import { BaseLabelManager, type BaseLabelManagerConfig, type LabelSize } from "./BaseLabelManager"
import {
	NAME_LABEL_GROUP_PREFIX,
	NAME_LABEL_HIT_NAME,
	NAME_LABEL_ICON_NAME,
	NAME_LABEL_SUFFIX_NAME,
	NAME_LABEL_TEXT_NAME,
} from "./nameLabelNodeUtils"
import type { Canvas } from "../../core/Canvas"
import type { CanvasEventMap } from "../../core/EventEmitter"
import type { NameLabelContent } from "../../elements/core/BaseElement"
import type { NameLabelIconContext, NameLabelIconResolver } from "./nameLabelTypes"
import {
	getMediaAssetId,
	resolveMediaComplianceFailedReason,
	resolveMediaComplianceStatus,
	type MediaComplianceContentLike,
} from "../../resources/asset/assetComplianceState"
import type { MediaLabelLayout } from "./mediaLabelLayout"

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
	ICON_GAP: 2,
	/** 文本宽度变化达到该粒度时才重新布局，避免缩放每帧触发文本重排 */
	TEXT_WIDTH_BUCKET: 2,
	/** 名称标签与右侧尺寸标签之间的最小间距（标签局部坐标） */
	LABEL_GAP: 4,
	/** 让 size label 在边界附近保持稳定，避免缩放时反复切换可见性 */
	SIZE_LABEL_PRIORITY_EPSILON: 2,
	/** 状态后缀紧跟主名称，保持与原有拼接文案一致 */
	SUFFIX_GAP: 0,
	STATUS_FONT_RATIO: 5 / 6,
	STATUS_PADDING_X: 4,
	STATUS_PADDING_Y: 2,
	/** 省略后仍保留的最小文本宽度，避免标签节点宽度为 0 */
	MIN_TEXT_WIDTH: 1,
} as const

interface NameLabelLayoutState {
	iconKey: string | null
	iconWidth: number
	iconHeight: number
	iconGap: number
	iconVisible: boolean
	canRename: boolean
	showOperation: boolean
	textOffsetX: number
	naturalTextWidth: number
	textWidth: number
	complianceFailed: boolean
	complianceFailedReason: string | null
	suffixText: string
	suffixNaturalTextWidth: number
	suffixHeight: number
	suffixOffsetX: number
	sizeLabelSuppressedByName: boolean
	canRenderText: boolean
}

export interface NameLabelScreenLayout {
	x: number
	y: number
	width: number
	height: number
	text: string
	fontSize: number
	fontFamily: string
	color: string
}

export interface ImageNameLabelLayout extends NameLabelScreenLayout {
	rowWidth: number
	canRename: boolean
	showRenameButton: boolean
	renameButtonGap: number
	hitPadding: number
	/** Screen-space hit region for a failed-compliance icon, when one is visible. */
	complianceIcon?: {
		x: number
		y: number
		width: number
		height: number
		failedReason: string
	}
}

export type NameLabelIconRefreshListener = (elementIds?: readonly string[]) => void

/**
 * 名称标签管理器
 * 职责：
 * 1. 在独立的 Layer 上渲染所有元素的名称标签
 * 2. 监听元素变化，同步更新名称标签
 * 3. 管理名称标签的可见性（媒体标签默认按 hover/选中显示，可通过画布设置常驻）
 * 4. 处理名称标签的位置和缩放
 * 5. 选择工具下命中名称：hover 手势、单击选中、双击重命名（不从名称拖动元素）
 */
export class NameLabelManager extends BaseLabelManager {
	private renamingElementId: string | null = null
	private interactionUnsubscribers: Array<() => void> = []
	private pointerHoverElementId: string | null = null
	private iconHoverElementId: string | null = null
	private readonly iconResolver?: NameLabelIconResolver
	private readonly iconRefreshListeners = new Set<NameLabelIconRefreshListener>()
	private readonly labelLayoutStates = new WeakMap<Konva.Group, NameLabelLayoutState>()
	private domLabelElementId: string | null = null
	private renameButtonElementId: string | null = null

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

	/** 铅笔使用名称的屏幕坐标；沿用同一权限和工具条件，不为 DOM 入口绕过限制。 */
	public getRenameButtonLayout(elementId: string): { x: number; y: number } | null {
		// This is an explicit, cold-path API. The DOM overlay uses the cached variant below during
		// motion so callers that request the button on demand retain the previous lazy-create behavior.
		const layout = this.getImageNameLabelLayout(elementId)
		if (!layout?.showRenameButton) return null
		return {
			x: layout.x + layout.width + layout.renameButtonGap,
			y: layout.y,
		}
	}

	/** 只把当前可交互图片的名称交给 DOM；布局和其它元素标签仍由原管理器维护。 */
	public getImageNameLabelLayout(elementId: string): ImageNameLabelLayout | null {
		if (
			this.renamingElementId ||
			!this.areNameLabelsInteractive() ||
			this.canvas.elementManager.getElementData(elementId)?.type !== ElementTypeEnum.Image
		)
			return null
		this.createOrUpdateLabel(elementId, { forceCreate: true })
		return this.getCachedImageNameLabelLayout(elementId)
	}

	/**
	 * Reads the already reconciled Konva label without triggering geometry, spatial, or text layout.
	 * Viewport and transform hot paths use this method after BaseLabelManager has updated the label.
	 */
	public getCachedImageNameLabelLayout(elementId: string): ImageNameLabelLayout | null {
		const labelGroup = this.labelMap.get(elementId)
		const state = labelGroup ? this.labelLayoutStates.get(labelGroup) : undefined
		if (this.renamingElementId || !labelGroup?.visible() || !labelGroup.listening() || !state)
			return null
		const layout = this.readDisplayLabelLayout(elementId)
		if (!layout) return null
		const viewportScale = this.canvas.stage.scaleX()
		const labelSize = this.getLabelSize(labelGroup)
		const labelScreenRight =
			labelGroup.x() * viewportScale +
			this.canvas.stage.position().x +
			(labelSize?.width ?? 0) * labelGroup.scaleX() * viewportScale
		const iconNode = this.getIconNode(labelGroup)
		const iconScaleX = labelGroup.scaleX() * viewportScale
		const iconScaleY = labelGroup.scaleY() * viewportScale
		const stagePosition = this.canvas.stage.position()
		const complianceIcon =
			state.complianceFailed && state.iconVisible && iconNode?.visible()
				? {
						x:
							labelGroup.x() * viewportScale +
							stagePosition.x +
							iconNode.x() * iconScaleX,
						y:
							labelGroup.y() * viewportScale +
							stagePosition.y +
							iconNode.y() * iconScaleY,
						width: state.iconWidth * iconScaleX,
						height: state.iconHeight * iconScaleY,
						failedReason: state.complianceFailedReason ?? "",
					}
				: undefined
		return {
			...layout,
			rowWidth: Math.max(layout.width, labelScreenRight - layout.x),
			canRename: state.canRename,
			showRenameButton: state.canRename && state.showOperation,
			renameButtonGap:
				Math.max(0, labelScreenRight - layout.x - layout.width) +
				(state.showOperation
					? NAME_LABEL_CONFIG.ICON_GAP * labelGroup.scaleX() * viewportScale
					: 0),
			hitPadding: NAME_LABEL_CONFIG.HIT_PADDING * labelGroup.scaleX() * viewportScale,
			...(complianceIcon ? { complianceIcon } : {}),
		}
	}

	/** DOM 标题悬浮或键盘聚焦期间，名称与分辨率沿用同一个交互目标。 */
	public isDOMLabelInteracting(elementId: string): boolean {
		return this.domLabelElementId === elementId && this.renameButtonElementId === elementId
	}

	/** 只有标题悬浮或键盘聚焦才占用铅笔宽度；图片选中本身不挤压标题。 */
	public setRenameButtonElementId(elementId: string | null): void {
		if (this.renameButtonElementId === elementId) return
		const previous = this.renameButtonElementId
		this.renameButtonElementId = elementId
		for (const id of [previous, elementId]) {
			if (!id) continue
			// 名称与尺寸共用操作区预算；释放按钮空间后，两者必须一起恢复布局。
			this.refreshLabelLayout(id)
			this.canvas.sizeLabelManager.refreshLabelLayout(id)
		}
	}

	public setDOMLabelElementId(elementId: string | null): void {
		if (this.domLabelElementId === elementId) return
		const previous = this.domLabelElementId
		this.domLabelElementId = elementId
		// DOM 文字支持原生选中复制，只隐藏同一标签的 Konva 文字，避免双份文字重叠。
		// 文字和命中一起交接，避免 DOM 文字光标与下方透明区域的手形光标竞争。
		if (previous) {
			const group = this.labelMap.get(previous)
			this.getTextNode(group)?.opacity(1)
			group?.findOne<Konva.Rect>(`.${NAME_LABEL_HIT_NAME}`)?.listening(true)
		}
		if (elementId) {
			const group = this.labelMap.get(elementId)
			this.getTextNode(group)?.opacity(0)
			group?.findOne<Konva.Rect>(`.${NAME_LABEL_HIT_NAME}`)?.listening(false)
			if (this.pointerHoverElementId === elementId) this.clearPointerHover()
		}
		this.canvas.runtimeScheduler.requestLayerDraw("overlay", {
			source: "NameLabelManager",
			reason: "dom-name-label",
			priority: "input",
		})
	}

	/** 浏览文字使用最终屏幕比例；编辑入口继续通过 getRenameInputLayout 读取全文。 */
	public getDisplayLabelLayout(elementId: string): NameLabelScreenLayout | null {
		this.createOrUpdateLabel(elementId, { forceCreate: true })
		return this.readDisplayLabelLayout(elementId)
	}

	private readDisplayLabelLayout(elementId: string): NameLabelScreenLayout | null {
		const layout = this.readRenameInputLayout(elementId)
		const group = this.labelMap.get(elementId)
		const textNode = group ? this.getTextNode(group) : null
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
		return this.readRenameInputLayout(elementId)
	}

	private readRenameInputLayout(elementId: string): NameLabelScreenLayout | null {
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
			// Rename input uses the full name; the canvas label may be ellipsized.
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
		return this.getLabelContent(elementId).primaryText
	}

	private getLabelContent(elementId: string): NameLabelContent {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		if (!element) return { primaryText: "" }

		// The fallback keeps lightweight test doubles and older integrations
		// compatible while real elements use the structured runtime content.
		const content = element.getNameLabelContent?.()
		return content ?? { primaryText: element.getNameLabelText?.() || "" }
	}

	protected override createOrUpdateLabel(
		elementId: string,
		options?: {
			skipReorder?: boolean
			skipNotify?: boolean
			skipBatchDraw?: boolean
			forceCreate?: boolean
		},
	): boolean {
		const labelGroup = this.labelMap.get(elementId)
		if (labelGroup) {
			this.syncLabelContent(elementId, labelGroup)
		}
		return super.createOrUpdateLabel(elementId, options)
	}

	protected override getLabelGap(): number {
		return NAME_LABEL_CONFIG.LABEL_GAP
	}

	/**
	 * Share the cached icon footprint with the media row calculator. Resolving the icon itself is
	 * intentionally kept out of this method so pan/zoom never invokes a user supplied resolver.
	 */
	protected override getLabelLeadingSize(elementId: string): LabelSize {
		const labelGroup = this.labelMap.get(elementId)
		const state = labelGroup ? this.labelLayoutStates.get(labelGroup) : undefined
		if (!state || state.iconKey === null) return { width: 0, height: 0 }
		return {
			width: state.iconWidth + state.iconGap,
			height: state.iconHeight,
		}
	}

	protected override getLabelOperationScreenWidth(elementId: string): number {
		return this.canvas.elementManager.getElementData(elementId)?.type ===
			ElementTypeEnum.Image &&
			(this.canvas.elementRenameManager?.canRename(elementId) ?? false)
			? 24
			: 0
	}

	protected override createLabel(elementId: string): Konva.Group {
		const labelGroup = new Konva.Group({
			listening: this.areNameLabelsInteractive(),
			visible: false,
			name: `${NAME_LABEL_GROUP_PREFIX}${elementId}`,
		})
		const textNode = new Konva.Text({
			name: NAME_LABEL_TEXT_NAME,
			text: "",
			fontSize: this.labelConfig.fontSize,
			fontFamily: this.labelConfig.fontFamily,
			fill: this.labelConfig.textColor,
			wrap: "none",
			ellipsis: true,
			listening: false,
			opacity: this.domLabelElementId === elementId ? 0 : 1,
		})
		const hitRect = new Konva.Rect({
			name: NAME_LABEL_HIT_NAME,
			fill: "rgba(0, 0, 0, 0.001)",
			listening: this.domLabelElementId !== elementId,
		})
		labelGroup.add(hitRect)
		labelGroup.add(textNode)
		this.labelLayoutStates.set(labelGroup, {
			iconKey: null,
			iconWidth: 0,
			iconHeight: 0,
			iconGap: 0,
			iconVisible: false,
			canRename: false,
			showOperation: false,
			textOffsetX: 0,
			naturalTextWidth: 0,
			textWidth: NAME_LABEL_CONFIG.MIN_TEXT_WIDTH,
			complianceFailed: false,
			complianceFailedReason: null,
			suffixText: "",
			suffixNaturalTextWidth: 0,
			suffixHeight: 0,
			suffixOffsetX: 0,
			sizeLabelSuppressedByName: false,
			canRenderText: true,
		})
		this.syncLabelContent(elementId, labelGroup)
		this.syncIcon(elementId, labelGroup)
		this.syncHitRect(labelGroup)
		this.bindLabelInteraction(labelGroup, elementId)
		return labelGroup
	}

	private syncLabelContent(elementId: string, labelGroup: Konva.Group): boolean {
		const textNode = this.getTextNode(labelGroup)
		const state = this.labelLayoutStates.get(labelGroup)
		if (!textNode || !state) return false

		const content = this.getLabelContent(elementId)
		const primaryText = content.primaryText || ""
		const suffixText = content.suffix?.text || ""
		let changed = false

		if (textNode.text() !== primaryText) {
			textNode.text(primaryText)
			state.naturalTextWidth = this.measureNaturalTextWidth(textNode)
			state.textWidth = 0
			changed = true
		}

		let suffixNode = this.getSuffixNode(labelGroup)
		if (suffixText) {
			if (!suffixNode) {
				suffixNode = new Konva.Text({
					name: NAME_LABEL_SUFFIX_NAME,
					text: suffixText,
					fontSize: textNode.fontSize() * NAME_LABEL_CONFIG.STATUS_FONT_RATIO,
					fontFamily: this.labelConfig.fontFamily,
					fill: this.labelConfig.textColor,
					wrap: "none",
					listening: false,
				})
				labelGroup.add(suffixNode)
				labelGroup.add(
					new Konva.Rect({
						name: "name-label-status-background",
						cornerRadius: 7,
						listening: false,
					}),
				)
				suffixNode.moveToTop()
				changed = true
			} else if (suffixNode.text() !== suffixText) {
				suffixNode.text(suffixText)
				changed = true
			}

			// 进行中的任务使用画布蓝色；终态保留中性色，避免继续传达正在处理。
			const statusColor = content.suffix?.inProgress ? "#3B82F6" : this.labelConfig.textColor
			const background = labelGroup.findOne<Konva.Rect>(".name-label-status-background")
			const backgroundColor = content.suffix?.inProgress
				? "rgba(59, 130, 246, 0.08)"
				: "rgba(115, 115, 115, 0.08)"
			if (background?.fill() !== backgroundColor) {
				background?.fill(backgroundColor)
				changed = true
			}
			if (suffixNode.fill() !== statusColor) {
				suffixNode.fill(statusColor)
				changed = true
			}

			if (state.suffixText !== suffixText || changed) {
				state.suffixNaturalTextWidth =
					this.measureNaturalTextWidth(suffixNode) +
					NAME_LABEL_CONFIG.STATUS_PADDING_X * 2
				state.suffixHeight = suffixNode.height() + NAME_LABEL_CONFIG.STATUS_PADDING_Y * 2
				changed = true
			}
		} else {
			if (suffixNode) {
				suffixNode.destroy()
				labelGroup.findOne(".name-label-status-background")?.destroy()
				changed = true
			}
			if (state.suffixText || state.suffixNaturalTextWidth || state.suffixHeight) {
				state.suffixNaturalTextWidth = 0
				state.suffixHeight = 0
				state.suffixOffsetX = 0
				changed = true
			}
		}

		if (state.suffixText !== suffixText) {
			state.suffixText = suffixText
			state.textWidth = 0
			changed = true
		}

		if (changed) this.syncHitRect(labelGroup)
		return changed
	}

	/**
	 * Content is synchronized at event boundaries in createOrUpdateLabel and
	 * refreshIcons. Geometry-only updates reuse the cached nodes and widths.
	 */
	protected override updateLabelContent(): boolean {
		return false
	}

	/**
	 * 名称与尺寸共用一行时优先保证名称（含状态后缀）；只有完整名称和尺寸都能容纳时
	 * 才显示尺寸。这里只收窄主名称的渲染宽度，重命名仍读取完整名称。
	 */
	protected override updateLabelLayout(
		elementId: string,
		element: ReturnType<typeof this.canvas.elementManager.getElementInstance>,
		labelGroup: Konva.Group,
		boundingRect: { x: number; y: number; width: number; height: number },
		inverseScale: number,
		mediaLayout?: MediaLabelLayout | null,
	): boolean {
		void boundingRect.x
		void boundingRect.y
		void boundingRect.height
		if (this.renamingElementId === elementId) return false
		const textNode = this.getTextNode(labelGroup)
		const state = this.labelLayoutStates.get(labelGroup)
		if (!textNode || !state) return false

		const naturalTextWidth = state.naturalTextWidth
		const suffixReservation = state.suffixText
			? state.suffixNaturalTextWidth + NAME_LABEL_CONFIG.SUFFIX_GAP
			: 0
		const previousSizeLabelSuppression = state.sizeLabelSuppressedByName
		const safeInverseScale = Math.max(inverseScale, Number.EPSILON)
		const resolvedMediaLayout = mediaLayout ?? this.getMediaRowLayout(elementId)
		const canRename =
			element?.getData().type === ElementTypeEnum.Image &&
			(this.canvas.permissionManager?.canRename(element.getData()) ?? false)
		state.canRename = canRename
		state.showOperation = resolvedMediaLayout?.showOperation === true
		let sizeLabelSuppressionChanged = false
		let availableLabelWidth: number
		if (resolvedMediaLayout) {
			availableLabelWidth = Math.max(0, resolvedMediaLayout.nameWidth)
			if (state.sizeLabelSuppressedByName) {
				state.sizeLabelSuppressedByName = false
				sizeLabelSuppressionChanged = true
			}
		} else {
			// getBoundingRect() is layer-relative, while the label uses inverse stage
			// scaling. Convert the element width into the label's local coordinates.
			const elementLabelWidth = Math.max(
				0,
				(boundingRect.width - this.labelConfig.offsetLeft) / safeInverseScale,
			)
			const sizeLabelDecision = this.getSizeLabelPriorityDecision(
				elementId,
				elementLabelWidth,
			)
			sizeLabelSuppressionChanged =
				previousSizeLabelSuppression !== sizeLabelDecision.suppressed
			const sizeLabelReservation = sizeLabelDecision.suppressed
				? 0
				: sizeLabelDecision.reservation
			availableLabelWidth = Math.max(0, elementLabelWidth - sizeLabelReservation)
		}
		const hasIcon = state.iconKey !== null
		const fullIconWidth = hasIcon ? state.iconWidth + state.iconGap : 0
		const minimumVisibleTextWidth =
			naturalTextWidth > 0
				? Math.min(naturalTextWidth, NAME_LABEL_CONFIG.FONT_SIZE)
				: NAME_LABEL_CONFIG.MIN_TEXT_WIDTH
		const iconCanFit =
			hasIcon &&
			availableLabelWidth - fullIconWidth - suffixReservation >= minimumVisibleTextWidth
		const textOffsetX = iconCanFit ? fullIconWidth : 0
		const availableTextWidth = Math.max(
			0,
			availableLabelWidth - textOffsetX - suffixReservation,
		)
		const canRenderText = availableTextWidth >= NAME_LABEL_CONFIG.MIN_TEXT_WIDTH
		const targetTextWidth = this.getRenderedTextWidth(naturalTextWidth, availableTextWidth)
		const suffixOffsetX =
			textOffsetX + targetTextWidth + (state.suffixText ? NAME_LABEL_CONFIG.SUFFIX_GAP : 0)
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
		if (state.suffixOffsetX !== suffixOffsetX) {
			state.suffixOffsetX = suffixOffsetX
			changed = true
		}

		textNode.wrap("none")
		textNode.ellipsis(true)
		const iconNode = this.getIconNode(labelGroup)
		const suffixNode = this.getSuffixNode(labelGroup)
		const labelHeight = Math.max(
			textNode.height(),
			state.suffixText ? state.suffixHeight : 0,
			iconCanFit ? state.iconHeight : 0,
		)
		const iconY = iconCanFit ? Math.max(0, (labelHeight - state.iconHeight) / 2) : 0
		const textY = Math.max(0, (labelHeight - textNode.height()) / 2)
		if (iconNode) {
			// The label group already starts at the element's left edge. Keep the
			// icon slot at x=0 and preserve the resolver's natural drawing geometry.
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
		if (suffixNode) {
			// 胶囊整体与标题居中，内部文字独立居中；字号较小也不会沿标题底部排列。
			const suffixY = (labelHeight - state.suffixHeight) / 2
			const suffixTextX = suffixOffsetX
			const suffixTextY = suffixY + NAME_LABEL_CONFIG.STATUS_PADDING_Y
			const background = labelGroup.findOne<Konva.Rect>(".name-label-status-background")
			if (
				suffixNode.x() !== suffixTextX ||
				suffixNode.y() !== suffixTextY ||
				background?.x() !== suffixOffsetX ||
				background?.y() !== suffixY ||
				background?.width() !== state.suffixNaturalTextWidth ||
				background?.height() !== state.suffixHeight
			) {
				suffixNode.position({ x: suffixTextX, y: suffixTextY })
				background?.setAttrs({
					x: suffixOffsetX - NAME_LABEL_CONFIG.STATUS_PADDING_X,
					y: suffixY,
					width: state.suffixNaturalTextWidth,
					height: state.suffixHeight,
				})
				changed = true
			}
			if (suffixNode.visible() !== Boolean(state.suffixText)) {
				suffixNode.visible(Boolean(state.suffixText))
				changed = true
			}
		}
		if (sizeLabelSuppressionChanged) {
			const sizeVisibilityChanged =
				this.canvas.sizeLabelManager?.refreshVisibilityForNamePriority?.(elementId, true) ??
				false
			changed = sizeVisibilityChanged || changed
		}
		if (changed) this.syncHitRect(labelGroup)
		return changed
	}

	protected override getLabelSize(labelGroup: Konva.Group): LabelSize | null {
		const textNode = this.getTextNode(labelGroup)
		if (!textNode) return null

		const state = this.labelLayoutStates.get(labelGroup)
		return {
			width:
				(state?.textOffsetX ?? 0) +
				textNode.width() +
				(state?.suffixText
					? NAME_LABEL_CONFIG.SUFFIX_GAP + (state.suffixNaturalTextWidth ?? 0)
					: 0),
			height: Math.max(
				textNode.height(),
				state?.suffixText ? (state.suffixHeight ?? 0) : 0,
				state?.iconVisible ? state.iconHeight : 0,
			),
		}
	}

	/** Media row budgeting includes the mandatory status suffix in the full name width. */
	protected override getIntrinsicLabelSize(elementId: string): LabelSize {
		const primarySize = super.getIntrinsicLabelSize(elementId)
		const labelGroup = this.labelMap.get(elementId)
		const state = labelGroup ? this.labelLayoutStates.get(labelGroup) : undefined
		if (!state?.suffixText) return primarySize

		return {
			width: primarySize.width + NAME_LABEL_CONFIG.SUFFIX_GAP + state.suffixNaturalTextWidth,
			height: Math.max(primarySize.height, state.suffixHeight),
		}
	}

	private getTextNode(labelGroup: Konva.Group | null | undefined): Konva.Text | null {
		return (labelGroup?.findOne(`.${NAME_LABEL_TEXT_NAME}`) as Konva.Text | undefined) ?? null
	}

	private getSuffixNode(labelGroup: Konva.Group): Konva.Text | null {
		return labelGroup.findOne(`.${NAME_LABEL_SUFFIX_NAME}`) as Konva.Text | null
	}

	private measureNaturalTextWidth(textNode: Konva.Text): number {
		// Measure the full string without changing the constrained render width.
		// This keeps text measurement out of the viewport hot path.
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

		// Round down so a cached width never makes the label exceed its element.
		const bucketedWidth =
			Math.floor(availableWidth / NAME_LABEL_CONFIG.TEXT_WIDTH_BUCKET) *
			NAME_LABEL_CONFIG.TEXT_WIDTH_BUCKET
		return Math.max(bucketedWidth, NAME_LABEL_CONFIG.MIN_TEXT_WIDTH)
	}

	/**
	 * Reports whether the size label should yield space to this name label.
	 *
	 * The decision deliberately uses the size label's independent eligibility
	 * rather than its current `visible` flag. A size label hidden by this rule
	 * must still be considered when the element grows again, otherwise it could
	 * never recover without an unrelated visibility event.
	 */
	public shouldSuppressSizeLabel(elementId: string): boolean {
		return this.getSizeLabelPriorityDecision(elementId).suppressed
	}

	private getSizeLabelPriorityDecision(
		elementId: string,
		elementLabelWidth?: number,
	): { reservation: number; suppressed: boolean } {
		const labelGroup = this.labelMap.get(elementId)
		const state = labelGroup ? this.labelLayoutStates.get(labelGroup) : undefined
		const sizeLabelManager = this.canvas.sizeLabelManager
		const element = this.canvas.elementManager.getElementInstance(elementId)
		// Keep lightweight integrations and test doubles compatible while the
		// runtime uses the independent eligibility query above the fallback.
		const sizeLabelIsEligible = sizeLabelManager
			? (sizeLabelManager.isLabelEligibleForNamePriority?.(elementId) ??
				sizeLabelManager.isLabelVisibleForElement?.(elementId) ??
				false)
			: false
		if (
			!state ||
			!element ||
			this.renamingElementId === elementId ||
			this.calculateBaseVisibility(elementId, element) !== true ||
			!sizeLabelIsEligible
		) {
			if (state) state.sizeLabelSuppressedByName = false
			return { reservation: 0, suppressed: false }
		}

		const sizeLabelSize = sizeLabelManager.getLabelSizeForElement(elementId)
		if (!sizeLabelSize || !Number.isFinite(sizeLabelSize.width)) {
			state.sizeLabelSuppressedByName = false
			return { reservation: 0, suppressed: false }
		}

		const reservation = Math.max(0, sizeLabelSize.width) + NAME_LABEL_CONFIG.LABEL_GAP
		const availableElementWidth = elementLabelWidth ?? this.getElementLabelWidth(elementId)
		if (sizeLabelSize.width > availableElementWidth) {
			state.sizeLabelSuppressedByName = false
			return { reservation: 0, suppressed: false }
		}
		const primaryNameHasContent = state.naturalTextWidth > 0
		const suffixHasContent = Boolean(state.suffixText)
		if (!primaryNameHasContent && !suffixHasContent) {
			state.sizeLabelSuppressedByName = false
			return { reservation, suppressed: false }
		}

		const availableWithSize = Math.max(0, availableElementWidth - reservation)
		const requiredNameWidth =
			state.naturalTextWidth +
			(state.suffixText ? state.suffixNaturalTextWidth + NAME_LABEL_CONFIG.SUFFIX_GAP : 0)
		// The icon is optional; it can yield before the mandatory name and suffix.
		// Use the cached natural width so Konva's ellipsis does not hide the fact
		// that the size label consumed the name's available space.
		const restoreThreshold = state.sizeLabelSuppressedByName
			? requiredNameWidth + NAME_LABEL_CONFIG.SIZE_LABEL_PRIORITY_EPSILON
			: requiredNameWidth
		const suppressed = availableWithSize < restoreThreshold
		state.sizeLabelSuppressedByName = suppressed

		return { reservation, suppressed }
	}

	private getElementLabelWidth(elementId: string): number {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		if (!element) return 0

		const boundingRect = element.getBoundingRect()
		if (!boundingRect) return 0
		const safeViewportScale = Math.max(this.canvas.stage.scaleX(), Number.EPSILON)
		return Math.max(0, (boundingRect.width - this.labelConfig.offsetLeft) * safeViewportScale)
	}

	private getIconContext(elementId: string): NameLabelIconContext | null {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		if (!element) return null
		const data = element.getData()
		const content = "contents" in data ? getActiveContent(data) : undefined
		const complianceContent = content as MediaComplianceContentLike | undefined
		const complianceStatus = resolveMediaComplianceStatus(this.canvas, complianceContent)

		return {
			elementId,
			element,
			data,
			selected: this.canvas.selectionManager.isSelected(elementId),
			hovered: this.canvas.hoverManager.getHoveredElementId() === elementId,
			isAssetLibrary: Boolean(getMediaAssetId(complianceContent)),
			complianceStatus,
			complianceFailedReason:
				complianceStatus === "FAILED"
					? resolveMediaComplianceFailedReason(this.canvas, complianceContent)
					: undefined,
		}
	}

	/** Resolve icons only on discrete state changes; pan/scale only reuse this cache. */
	private syncIcon(elementId: string, labelGroup: Konva.Group): boolean {
		if (!this.iconResolver) return false
		const state = this.labelLayoutStates.get(labelGroup)
		if (!state) return false

		const context = this.getIconContext(elementId)
		const descriptor = context ? this.iconResolver(context) : null
		const currentNode = this.getIconNode(labelGroup)
		let changed = false
		const complianceFailed = context?.complianceStatus === "FAILED"
		const complianceFailedReason = complianceFailed
			? (context?.complianceFailedReason ?? null)
			: null
		if (state.complianceFailed !== complianceFailed) {
			state.complianceFailed = complianceFailed
			changed = true
		}
		if (state.complianceFailedReason !== complianceFailedReason) {
			state.complianceFailedReason = complianceFailedReason
			changed = true
		}

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

	/** Refreshes cached icon and runtime text state for discrete label changes. */
	public refreshIcons(elementIds?: readonly string[]): void {
		const ids = elementIds ? Array.from(new Set(elementIds)) : Array.from(this.labelMap.keys())
		let requiresDraw = false

		for (const elementId of ids) {
			const labelGroup = this.labelMap.get(elementId)
			if (!labelGroup) continue
			const contentChanged = this.syncLabelContent(elementId, labelGroup)
			const iconChanged = this.syncIcon(elementId, labelGroup)
			requiresDraw = contentChanged || iconChanged || requiresDraw
			// Compliance text can change while the shield icon keeps the same shape;
			// only changed content needs a layout pass.
			if (contentChanged || iconChanged) {
				requiresDraw = this.updateLabelPosition(elementId, true) || requiresDraw
			}
		}

		if (requiresDraw)
			this.canvas.runtimeScheduler.requestLayerDraw("overlay", {
				source: "NameLabelManager",
				reason: "name-label-icons",
				priority: "input",
			})

		// React overlays cannot observe Konva's cached state directly. Notify them after
		// the cache and geometry are reconciled so a visible compliance tooltip reads the
		// same failure reason as the shield icon.
		for (const listener of this.iconRefreshListeners) listener(elementIds)
	}

	/** Subscribe to discrete icon/compliance refreshes without adding another Canvas event. */
	public subscribeIconRefresh(listener: NameLabelIconRefreshListener): () => void {
		this.iconRefreshListeners.add(listener)
		return () => {
			this.iconRefreshListeners.delete(listener)
		}
	}

	public override refreshAfterLocaleChange(): void {
		for (const [elementId, labelGroup] of this.labelMap) {
			this.syncLabelContent(elementId, labelGroup)
		}
		super.refreshAfterLocaleChange()
	}

	protected override shouldRetainHiddenLabel(elementId: string): boolean {
		return this.renamingElementId === elementId
	}

	public override destroy(): void {
		this.clearPointerHover()
		this.iconHoverElementId = null
		this.domLabelElementId = null
		this.renameButtonElementId = null
		for (const unsubscribe of this.interactionUnsubscribers) {
			unsubscribe()
		}
		this.interactionUnsubscribers = []
		this.iconRefreshListeners.clear()
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
		mediaLayout?: MediaLabelLayout | null,
	): boolean | null {
		void mediaLayout
		const elementType = element?.getData().type
		if (
			this.isMediaLabelsAlwaysVisible() &&
			(elementType === ElementTypeEnum.Image || elementType === ElementTypeEnum.Video)
		) {
			return null
		}

		if (this.renamingElementId === elementId) return false

		// 如果基础可见性为 false，不需要检查自定义逻辑
		if (!baseVisibility) {
			return null
		}

		// 文本已经按可用宽度设置 ellipsis；只有连最小文本宽度都没有时才隐藏。
		const state = this.labelLayoutStates.get(labelGroup)
		if (state && !state.canRenderText) return false
		// Keep the defensive path for callers that provide a label group created by
		// another implementation or a test double without layout state.
		if (!state) {
			const boundingRect = element?.getBoundingRect()
			const textNode = labelGroup.findOne("Text") as Konva.Text | null
			if (boundingRect && textNode) {
				const labelWidth = textNode.width() * labelGroup.scaleX()
				if (
					this.checkLabelExceedsElementWidth(
						{ x: labelGroup.x(), width: labelWidth },
						boundingRect,
					)
				)
					return false
			}
		}

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
		labelGroup.on("mouseup", (event) => {
			// 只截断 Konva 冒泡；原生 mouseup 必须到达 window，Konva 才能派发 dragend。
			event.cancelBubble = true
		})
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

	public selectElementFromLabel(elementId: string, autoFocus = true): void {
		const elementData = this.canvas.elementManager.getElementData(elementId)
		if (!this.canvas.permissionManager.canSelect(elementData)) {
			return
		}
		if (this.canvas.selectionManager.isSelected(elementId)) {
			if (this.canvas.selectionManager.getSelectionCount() > 1) {
				this.canvas.selectionManager.replaceSelection([elementId], autoFocus)
			}
			return
		}
		this.canvas.connectionManager?.deselectConnection()
		this.canvas.selectionManager.replaceSelection([elementId], autoFocus)
	}

	private clearPointerHover(): void {
		if (!this.pointerHoverElementId) return
		this.pointerHoverElementId = null
		this.canvas.cursorManager?.restoreToolCursor()
	}
}
