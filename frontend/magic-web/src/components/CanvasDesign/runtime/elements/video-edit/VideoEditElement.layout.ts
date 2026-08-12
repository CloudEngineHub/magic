import {
	resolveResponsiveElementLayout,
	type LayoutRect,
	type ResponsiveLayoutMode,
} from "../../shared/layout/ResponsiveElementLayout"
import { VIDEO_EDIT_CONFIG } from "./VideoEditElement.config"

export const VIDEO_EDIT_LAYOUT_DESIGN = {
	width: 1920,
	height: 1080,
	baseRem: 16,
	/** 视频卡片为正方形边长。 */
	videoCardSize: 560,
	videoCardInfoHeight: 72,
	videoGripSize: 48,
	videoScrollbarHeight: 8,
	audioSectionMinHeight: 160,
	audioRowHeight: 92,
	audioPlayButtonSize: 56,
	audioProgressHeight: 8,
	/** 时长列最大宽度；实际渲染会按文案收紧并右对齐。 */
	audioInfoWidth: 160,
	/** 未提供 sectionTitles 时的标题列回退宽度。 */
	sectionTitleWidth: 200,
	// 与分镜参数行一致：固定控件尺寸，不随 footer 剩余空间拉伸。
	footerParameterWidth: 300,
	footerParameterHeight: 92,
	/** 「画面比例：」等完整 label，避免大字阶换行。 */
	footerParameterLabelWidth: 160,
	footerParameterResolutionLabelWidth: 130,
	footerParameterHorizontalPadding: 20,
	footerParameterSuffixIconSize: 16,
	mergeButtonWidth: 200,
	mergeButtonHeight: 92,
} as const

export interface VideoEditLayoutOptions {
	/** 视频/音频区块标题文案；按最长项测宽，保证两行标题列对齐。 */
	sectionTitles?: string[]
}

export interface VideoEditFooterParameterLayout {
	rect: LayoutRect
	backgroundRect: LayoutRect
	labelRect: LayoutRect
	triggerRect: LayoutRect
	valueTextRect: LayoutRect
	suffixRect: LayoutRect
	showLabel: boolean
	horizontalPadding: number
	suffixGap: number
	suffixIconSize: number
	fontSize: number
	labelFontSize: number
	cornerRadius: number
}

export interface VideoEditElementLayout {
	mode: ResponsiveLayoutMode
	scale: number
	bounds: LayoutRect
	sectionHorizontalPadding: number
	videoSection: LayoutRect
	videoTitle: LayoutRect
	videoCount: LayoutRect
	videoViewport: LayoutRect
	videoCardViewport: LayoutRect
	videoScrollbar: LayoutRect
	videoCard: {
		width: number
		height: number
		infoHeight: number
		gap: number
		padding: number
		gripSize: number
	}
	audioSection: LayoutRect
	audioTitle: LayoutRect
	audioCount: LayoutRect
	/** 标题下方可用内容区；空状态 placeholder 铺满此区域。 */
	audioPlaceholder: LayoutRect
	/** 有音频时的控件行（在 audioPlaceholder 内垂直居中）。 */
	audioRow: LayoutRect
	audioPlayButton: LayoutRect
	audioProgress: LayoutRect
	audioInfo: LayoutRect
	footer: LayoutRect
	footerOutput: LayoutRect
	footerParameterRows: {
		aspectRatio: VideoEditFooterParameterLayout
		resolution: VideoEditFooterParameterLayout
		format: VideoEditFooterParameterLayout
	}
	mergeButton: LayoutRect
	mergeButtonCornerRadius: number
	mergeButtonFontSize: number
	fonts: {
		title: number
		count: number
		cardName: number
		cardDuration: number
		audioName: number
		audioDuration: number
		button: number
	}
}

const VIDEO_EDIT_LAYOUT_SPEC = {
	designSize: {
		width: VIDEO_EDIT_LAYOUT_DESIGN.width,
		height: VIDEO_EDIT_LAYOUT_DESIGN.height,
	},
	baseRem: VIDEO_EDIT_LAYOUT_DESIGN.baseRem,
	scale: {
		strategy: { type: "weighted" as const, inlineWeight: 0.65 },
		min: 0.55,
		max: 1.35,
	},
	mode: {
		compactBelow: 0.8,
		condensedBelow: 0.5,
	},
} as const

function resolveDimension(value: number): number {
	return Number.isFinite(value) ? Math.max(1, value) : 1
}

/** 按实际字形测宽；无 canvas 时用字数估算，避免标题列被估窄。 */
let sectionTitleMeasureContext: CanvasRenderingContext2D | null | false = null

function getSectionTitleMeasureContext(): CanvasRenderingContext2D | null {
	if (sectionTitleMeasureContext === false) return null
	if (sectionTitleMeasureContext) return sectionTitleMeasureContext
	if (typeof document === "undefined") {
		sectionTitleMeasureContext = false
		return null
	}
	try {
		const canvas = document.createElement("canvas")
		const context = canvas.getContext("2d")
		if (!context) {
			sectionTitleMeasureContext = false
			return null
		}
		sectionTitleMeasureContext = context
		return context
	} catch {
		sectionTitleMeasureContext = false
		return null
	}
}

function measureSectionTitleWidth(text: string, fontSize: number): number {
	const normalized = text.trim()
	if (!normalized) return 0
	const context = getSectionTitleMeasureContext()
	if (context) {
		context.font = `${fontSize}px ${VIDEO_EDIT_CONFIG.FONT_FAMILY}`
		const measured = context.measureText(normalized).width
		if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured)
	}
	return Math.ceil(normalized.length * fontSize)
}

function resolveFooterParameterLayout(options: {
	row: LayoutRect
	labelWidth: number
	showLabel: boolean
	valueFontSize: number
	labelFontSize: number
	scale: number
	responsive: ReturnType<typeof resolveResponsiveElementLayout>
}): VideoEditFooterParameterLayout {
	const { row, labelWidth, showLabel, valueFontSize, labelFontSize, scale, responsive } = options
	const horizontalPadding = Math.min(
		scale * VIDEO_EDIT_LAYOUT_DESIGN.footerParameterHorizontalPadding,
		row.width * 0.12,
	)
	const suffixGap = responsive.design.gap.control
	const suffixIconSize = scale * VIDEO_EDIT_LAYOUT_DESIGN.footerParameterSuffixIconSize
	const backgroundRect = responsive.insetRect(row, {
		top: responsive.design.space.xs,
		bottom: responsive.design.space.xs,
	})
	const contentRect = responsive.insetRect(row, {
		left: horizontalPadding,
		right: horizontalPadding,
	})
	// 大字阶下 label 需要更大占比，否则「画面比例：」会在槽内换行。
	const resolvedLabelWidth = showLabel ? Math.min(labelWidth, contentRect.width * 0.55) : 0
	const labelRect = {
		x: contentRect.x,
		y: contentRect.y,
		width: resolvedLabelWidth,
		height: contentRect.height,
	}
	const triggerRect = {
		x: contentRect.x + resolvedLabelWidth,
		y: contentRect.y,
		width: Math.max(1, contentRect.width - resolvedLabelWidth),
		height: contentRect.height,
	}
	const triggerContent = responsive.insetRect(triggerRect, {
		left: showLabel ? 0 : horizontalPadding * 0.5,
		right: horizontalPadding * 0.5,
	})
	const suffixRect = responsive.alignRect(
		{ width: suffixIconSize, height: suffixIconSize },
		triggerContent,
		{ inline: "end", block: "center" },
	)
	const valueTextRect = responsive.constrainRect(
		{
			x: triggerContent.x,
			y: triggerContent.y + Math.max(0, (triggerContent.height - valueFontSize) / 2),
			width: Math.max(1, suffixRect.x - suffixGap - triggerContent.x),
			height: Math.min(triggerContent.height, Math.max(1, valueFontSize * 1.35)),
		},
		triggerContent,
	)

	return {
		rect: row,
		backgroundRect,
		labelRect,
		triggerRect,
		valueTextRect,
		suffixRect,
		showLabel,
		horizontalPadding,
		suffixGap,
		suffixIconSize,
		fontSize: valueFontSize,
		labelFontSize,
		cornerRadius: responsive.design.radius.control,
	}
}

/** 视频编辑节点只根据元素逻辑宽高排版，viewport zoom 不参与计算。 */
export function resolveVideoEditElementLayout(
	width: number,
	height: number,
	options?: VideoEditLayoutOptions,
): VideoEditElementLayout {
	const responsive = resolveResponsiveElementLayout(
		{ width: resolveDimension(width), height: resolveDimension(height) },
		VIDEO_EDIT_LAYOUT_SPEC,
	)
	const scale = responsive.scale
	const px = (value: number) => responsive.designPx(value)
	const { design } = responsive
	const sectionHorizontalPadding = responsive.clamp(
		design.pad.section,
		Math.min(responsive.width, responsive.height) * 0.035,
		design.pad.sectionInline,
	)
	const sectionVerticalPadding = design.pad.section
	const footerVerticalPadding = design.pad.sectionInline
	// 「使用视频 / 使用音频」与右侧次要信息同档 caption，行高按实际显示字号算。
	const sectionTitleFontSize = design.type.caption
	const headingHeight = Math.max(sectionTitleFontSize * 1.35, design.space.lg)
	const headingGap = design.gap.content
	const scrollbarHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.videoScrollbarHeight)
	const scrollbarGap = design.gap.control
	const preferredVideoCardSize = px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardSize)
	const preferredAudioRowHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.audioRowHeight)

	// 1) 页脚按内容定高
	const footerControlHeight = Math.max(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterHeight),
		px(VIDEO_EDIT_LAYOUT_DESIGN.mergeButtonHeight),
	)
	const preferredFooterHeight = footerVerticalPadding * 2 + footerControlHeight
	const footerHeight = Math.min(preferredFooterHeight, responsive.height)

	// 2) 视频按内容定高（正方形卡片）；必要时压缩边长，给音频留出最小内容高度
	const videoChromeHeight = sectionVerticalPadding * 2 + headingHeight + headingGap
	const preferredVideoHeight = videoChromeHeight + preferredVideoCardSize
	const audioContentMinHeight = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.audioSectionMinHeight),
		sectionVerticalPadding * 2 + headingHeight + headingGap + preferredAudioRowHeight,
	)
	const availableForVideo = Math.max(0, responsive.height - footerHeight - audioContentMinHeight)
	const videoHeight = Math.min(preferredVideoHeight, availableForVideo)
	const videoCardSize = Math.max(0, videoHeight - videoChromeHeight)
	const videoCardHeight = videoCardSize
	const videoCardWidth = videoCardSize

	// 3) 音频吃掉剩余高度，贴底页脚之上
	const audioHeight = Math.max(0, responsive.height - videoHeight - footerHeight)

	const videoSection: LayoutRect = {
		x: 0,
		y: 0,
		width: responsive.width,
		height: videoHeight,
	}
	const audioSection: LayoutRect = {
		x: 0,
		y: videoSection.y + videoSection.height,
		width: responsive.width,
		height: audioHeight,
	}
	const footer: LayoutRect = {
		x: 0,
		y: audioSection.y + audioSection.height,
		width: responsive.width,
		height: footerHeight,
	}

	const headingWidth = Math.max(0, responsive.width - sectionHorizontalPadding * 2)
	// 视频 / 音频共用同一标题列宽：按传入文案测最长项，再加 content gap 与右侧次要信息隔开。
	const sectionTitles = options?.sectionTitles?.filter((title) => title.trim().length > 0) ?? []
	const measuredTitleWidth =
		sectionTitles.length > 0
			? Math.max(
					...sectionTitles.map((title) =>
						measureSectionTitleWidth(title, sectionTitleFontSize),
					),
				) + design.gap.content
			: px(VIDEO_EDIT_LAYOUT_DESIGN.sectionTitleWidth)
	const sectionTitleWidth = Math.min(Math.max(1, measuredTitleWidth), headingWidth * 0.55)
	const videoTitle: LayoutRect = {
		x: sectionHorizontalPadding,
		y: videoSection.y + sectionVerticalPadding,
		width: sectionTitleWidth,
		height: Math.min(headingHeight, Math.max(0, videoHeight - sectionVerticalPadding * 2)),
	}
	const videoCount: LayoutRect = {
		x: videoTitle.x + videoTitle.width,
		y: videoTitle.y,
		width: Math.max(0, headingWidth - videoTitle.width),
		height: videoTitle.height,
	}
	const videoViewport: LayoutRect = {
		x: sectionHorizontalPadding,
		y: videoTitle.y + videoTitle.height + headingGap,
		width: headingWidth,
		height: videoCardHeight,
	}
	const videoCardViewport: LayoutRect = {
		x: videoViewport.x,
		y: videoViewport.y,
		width: videoViewport.width,
		height: videoViewport.height,
	}
	// 顶对齐：标题 → headingGap → 内容；滚动条叠在卡片下 gap 处（落在底 padding 内）。
	const videoCardTop = videoViewport.y
	const videoScrollbar: LayoutRect = {
		x: videoViewport.x,
		y: Math.min(
			videoCardTop + videoCardHeight + scrollbarGap,
			videoSection.y + videoSection.height - scrollbarHeight,
		),
		width: videoViewport.width,
		height: Math.min(scrollbarHeight, Math.max(0, videoSection.height)),
	}

	const audioTitle: LayoutRect = {
		x: sectionHorizontalPadding,
		y: audioSection.y + sectionVerticalPadding,
		width: sectionTitleWidth,
		height: Math.min(
			headingHeight,
			Math.max(0, audioSection.height - sectionVerticalPadding * 2),
		),
	}
	const audioCount: LayoutRect = {
		x: audioTitle.x + audioTitle.width,
		y: audioTitle.y,
		width: Math.max(0, headingWidth - audioTitle.width),
		height: audioTitle.height,
	}
	const audioRowContainer: LayoutRect = {
		x: sectionHorizontalPadding,
		y: audioTitle.y + audioTitle.height + headingGap,
		width: headingWidth,
		height: Math.max(
			0,
			audioSection.y +
				audioSection.height -
				sectionVerticalPadding -
				(audioTitle.y + audioTitle.height + headingGap),
		),
	}
	const audioPlaceholder = audioRowContainer
	const audioRow = responsive.alignRect(
		{
			width: audioRowContainer.width,
			height: Math.min(px(VIDEO_EDIT_LAYOUT_DESIGN.audioRowHeight), audioRowContainer.height),
		},
		audioRowContainer,
		{ inline: "start", block: "center" },
	)
	const audioRowPadding = Math.min(design.space.sm, audioRow.width / 4)
	const audioColumnGap = design.gap.section
	const audioPlaySize = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.audioPlayButtonSize),
		Math.max(0, audioRow.height - audioRowPadding * 2),
	)
	const audioPlayButton = responsive.alignRect(
		{ width: audioPlaySize, height: audioPlaySize },
		responsive.insetRect(audioRow, { left: audioRowPadding, right: audioRowPadding }),
		{ inline: "start", block: "center" },
	)
	const desiredAudioInfoWidth = px(VIDEO_EDIT_LAYOUT_DESIGN.audioInfoWidth)
	const remainingAfterButton = Math.max(
		0,
		audioRow.x + audioRow.width - audioRowPadding - audioPlayButton.x - audioPlayButton.width,
	)
	const resolvedAudioGap = Math.min(audioColumnGap, remainingAfterButton / 6)
	const maxAudioInfoWidth = Math.max(0, remainingAfterButton - resolvedAudioGap * 2)
	const audioInfoWidth = Math.min(desiredAudioInfoWidth, maxAudioInfoWidth)
	const audioInfo: LayoutRect = {
		x: audioRow.x + audioRow.width - audioRowPadding - audioInfoWidth,
		y: audioRow.y,
		width: audioInfoWidth,
		height: audioRow.height,
	}
	const audioProgressHeight = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.audioProgressHeight),
		Math.max(2, audioRow.height * 0.18),
	)
	// 进度条左右使用同一间距：播放按钮 | gap | 进度条 | gap | 时长
	const audioProgressStart = audioPlayButton.x + audioPlayButton.width + resolvedAudioGap
	const audioProgressEnd = audioInfo.x - resolvedAudioGap
	const audioProgress: LayoutRect = {
		x: audioProgressStart,
		y: audioRow.y + (audioRow.height - audioProgressHeight) / 2,
		width: Math.max(0, audioProgressEnd - audioProgressStart),
		height: audioProgressHeight,
	}

	const footerContent = responsive.insetRect(footer, {
		left: sectionHorizontalPadding,
		right: sectionHorizontalPadding,
		top: footerVerticalPadding,
		bottom: footerVerticalPadding,
	})
	const footerColumnGap = Math.min(design.pad.sectionInline, footerContent.width * 0.04)
	const mergeButtonFit = responsive.fitUniform(
		{
			width: VIDEO_EDIT_LAYOUT_DESIGN.mergeButtonWidth,
			height: VIDEO_EDIT_LAYOUT_DESIGN.mergeButtonHeight,
		},
		footerContent,
		{ preferredScale: scale, inline: "end", block: "center" },
	)
	const mergeButton = responsive.constrainRect(mergeButtonFit.rect, footerContent)
	const mergeButtonCornerRadius =
		design.radius.control * (mergeButtonFit.scale / Math.max(scale, 0.0001))
	const mergeButtonFontSize = design.minType(
		design.type.caption * (mergeButtonFit.scale / Math.max(scale, 0.0001)),
		"caption",
	)
	const footerOutput: LayoutRect = {
		x: footerContent.x,
		y: footerContent.y,
		width: Math.max(0, mergeButton.x - footerColumnGap - footerContent.x),
		height: footerContent.height,
	}

	const footerParameterGap = Math.min(design.space.md, footerOutput.width * 0.035)
	const footerParameterColumnCount = 3
	const footerParameterColumnWidth = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterWidth),
		Math.max(
			0,
			(footerOutput.width - footerParameterGap * (footerParameterColumnCount - 1)) /
				footerParameterColumnCount,
		),
	)
	const footerParameterColumnHeight = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterHeight),
		footerOutput.height,
	)
	const footerParameterCluster = responsive.alignRect(
		{
			width:
				footerParameterColumnWidth * footerParameterColumnCount +
				footerParameterGap * (footerParameterColumnCount - 1),
			height: footerParameterColumnHeight,
		},
		footerOutput,
		{ inline: "start", block: "center" },
	)
	const aspectColumn: LayoutRect = {
		x: footerParameterCluster.x,
		y: footerParameterCluster.y,
		width: footerParameterColumnWidth,
		height: footerParameterColumnHeight,
	}
	const resolutionColumn: LayoutRect = {
		x: aspectColumn.x + aspectColumn.width + footerParameterGap,
		y: footerParameterCluster.y,
		width: footerParameterColumnWidth,
		height: footerParameterColumnHeight,
	}
	const formatColumn: LayoutRect = {
		x: resolutionColumn.x + resolutionColumn.width + footerParameterGap,
		y: footerParameterCluster.y,
		width: footerParameterColumnWidth,
		height: footerParameterColumnHeight,
	}
	const showFooterParameterLabels = responsive.mode !== "condensed"
	// label / value 同字号，避免底部控件视觉不齐。
	const footerParameterLabelFontSize = design.type.caption
	const footerParameterValueFontSize = footerParameterLabelFontSize
	const footerParameterRows = {
		aspectRatio: resolveFooterParameterLayout({
			row: aspectColumn,
			labelWidth: px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterLabelWidth),
			showLabel: showFooterParameterLabels,
			valueFontSize: footerParameterValueFontSize,
			labelFontSize: footerParameterLabelFontSize,
			scale,
			responsive,
		}),
		resolution: resolveFooterParameterLayout({
			row: resolutionColumn,
			labelWidth: px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterResolutionLabelWidth),
			showLabel: showFooterParameterLabels,
			valueFontSize: footerParameterValueFontSize,
			labelFontSize: footerParameterLabelFontSize,
			scale,
			responsive,
		}),
		format: resolveFooterParameterLayout({
			row: formatColumn,
			labelWidth: px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterResolutionLabelWidth),
			showLabel: showFooterParameterLabels,
			valueFontSize: footerParameterValueFontSize,
			labelFontSize: footerParameterLabelFontSize,
			scale,
			responsive,
		}),
	}

	return {
		mode: responsive.mode,
		scale,
		bounds: responsive.bounds,
		sectionHorizontalPadding,
		videoSection,
		videoTitle,
		videoCount,
		videoViewport,
		videoCardViewport,
		videoScrollbar,
		videoCard: {
			width: videoCardWidth,
			height: videoCardHeight,
			infoHeight: Math.min(
				px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardInfoHeight),
				videoCardHeight * 0.34,
			),
			gap: design.space.md,
			padding: design.space.sm,
			gripSize: px(VIDEO_EDIT_LAYOUT_DESIGN.videoGripSize),
		},
		audioSection,
		audioTitle,
		audioCount,
		audioPlaceholder,
		audioRow,
		audioPlayButton,
		audioProgress,
		audioInfo,
		footer,
		footerOutput,
		footerParameterRows,
		mergeButton,
		mergeButtonCornerRadius,
		mergeButtonFontSize,
		fonts: {
			title: sectionTitleFontSize,
			count: design.type.caption,
			cardName: design.type.caption,
			cardDuration: design.type.caption,
			audioName: design.type.caption,
			audioDuration: design.type.caption,
			button: mergeButtonFontSize,
		},
	}
}
