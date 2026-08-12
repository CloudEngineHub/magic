import {
	resolveResponsiveElementLayout,
	type LayoutRect,
	type ResponsiveLayoutMode,
} from "../../shared/layout/ResponsiveElementLayout"

export const VIDEO_EDIT_LAYOUT_DESIGN = {
	width: 1280,
	height: 720,
	baseRem: 16,
	/**
	 * 间距尺度（设计稿 px）：xs=4 / sm=8 / md=12 / lg=16 / xl=24
	 * 同语义只用一档，避免 10/14/18 等碎台阶。
	 */
	spaceXs: 4,
	spaceSm: 8,
	spaceMd: 12,
	spaceLg: 16,
	spaceXl: 24,
	sectionHorizontalPadding: 24,
	/** 视频 / 音频 / 页脚区块上下内边距统一。 */
	sectionVerticalPadding: 16,
	headingHeight: 22,
	/** 区块标题 → 内容。 */
	headingGap: 12,
	/** 视频卡片为正方形边长。 */
	videoCardSize: 300,
	videoCardInfoHeight: 42,
	videoCardGap: 12,
	videoCardPadding: 12,
	videoGripSize: 24,
	videoScrollbarHeight: 6,
	/** 卡片与滚动条；滚动条绝对定位，不挤占列表空间。 */
	videoScrollbarGap: 8,
	audioSectionMinHeight: 128,
	audioRowHeight: 64,
	audioRowHorizontalPadding: 12,
	audioColumnGap: 16,
	audioPlayButtonSize: 42,
	audioProgressHeight: 6,
	/** 时长列最大宽度；实际渲染会按文案收紧并右对齐。 */
	audioInfoWidth: 96,
	/** 页脚按内容定高：上下 padding + max(参数行, 合并按钮)。 */
	footerColumnGap: 24,
	footerParameterColumnGap: 12,
	// 与分镜参数行一致：固定控件尺寸，不随 footer 剩余空间拉伸。
	footerParameterWidth: 176,
	footerParameterHeight: 46,
	footerParameterLabelWidth: 56,
	footerParameterResolutionLabelWidth: 48,
	footerParameterHorizontalPadding: 8,
	footerParameterSuffixGap: 8,
	footerParameterSuffixIconSize: 12,
	mergeButtonWidth: 150,
	mergeButtonHeight: 46,
	titleFontSize: 15,
	countFontSize: 12,
	cardNameFontSize: 12,
	cardDurationFontSize: 11,
	audioNameFontSize: 13,
	audioDurationFontSize: 12,
	footerSecondaryFontSize: 11,
	footerParameterValueFontSize: 12,
	buttonFontSize: 16,
} as const

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
	const suffixGap = scale * VIDEO_EDIT_LAYOUT_DESIGN.footerParameterSuffixGap
	const suffixIconSize = scale * VIDEO_EDIT_LAYOUT_DESIGN.footerParameterSuffixIconSize
	const backgroundRect = responsive.insetRect(row, {
		top: 2 * scale,
		bottom: 2 * scale,
	})
	const contentRect = responsive.insetRect(row, {
		left: horizontalPadding,
		right: horizontalPadding,
	})
	const resolvedLabelWidth = showLabel ? Math.min(labelWidth, contentRect.width * 0.42) : 0
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
		cornerRadius: 6 * scale,
	}
}

/** 视频编辑节点只根据元素逻辑宽高排版，viewport zoom 不参与计算。 */
export function resolveVideoEditElementLayout(
	width: number,
	height: number,
): VideoEditElementLayout {
	const responsive = resolveResponsiveElementLayout(
		{ width: resolveDimension(width), height: resolveDimension(height) },
		VIDEO_EDIT_LAYOUT_SPEC,
	)
	const scale = responsive.scale
	const px = (value: number) => responsive.designPx(value)
	const sectionHorizontalPadding = responsive.clamp(
		px(VIDEO_EDIT_LAYOUT_DESIGN.spaceLg),
		Math.min(responsive.width, responsive.height) * 0.035,
		px(VIDEO_EDIT_LAYOUT_DESIGN.sectionHorizontalPadding),
	)
	const sectionVerticalPadding = px(VIDEO_EDIT_LAYOUT_DESIGN.sectionVerticalPadding)
	const headingHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.headingHeight)
	const headingGap = px(VIDEO_EDIT_LAYOUT_DESIGN.headingGap)
	const scrollbarHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.videoScrollbarHeight)
	const scrollbarGap = px(VIDEO_EDIT_LAYOUT_DESIGN.videoScrollbarGap)
	const preferredVideoCardSize = px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardSize)
	const preferredAudioRowHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.audioRowHeight)

	// 1) 页脚按内容定高
	const footerControlHeight = Math.max(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterHeight),
		px(VIDEO_EDIT_LAYOUT_DESIGN.mergeButtonHeight),
	)
	const preferredFooterHeight = sectionVerticalPadding * 2 + footerControlHeight
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
	// 视频 / 音频共用同一标题列宽；右侧留给数量或音频名。
	const sectionTitleWidth = Math.min(px(88), headingWidth * 0.4)
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
	const audioRowPadding = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.audioRowHorizontalPadding),
		audioRow.width / 4,
	)
	const audioColumnGap = px(VIDEO_EDIT_LAYOUT_DESIGN.audioColumnGap)
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
		top: sectionVerticalPadding,
		bottom: sectionVerticalPadding,
	})
	const footerColumnGap = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerColumnGap),
		footerContent.width * 0.04,
	)
	const mergeButtonFit = responsive.fitUniform(
		{
			width: VIDEO_EDIT_LAYOUT_DESIGN.mergeButtonWidth,
			height: VIDEO_EDIT_LAYOUT_DESIGN.mergeButtonHeight,
		},
		footerContent,
		{ preferredScale: scale, inline: "end", block: "center" },
	)
	const mergeButton = responsive.constrainRect(mergeButtonFit.rect, footerContent)
	const mergeButtonCornerRadius = 10 * mergeButtonFit.scale
	const mergeButtonFontSize = Math.max(
		px(VIDEO_EDIT_LAYOUT_DESIGN.buttonFontSize),
		20 * mergeButtonFit.scale,
	)
	const footerOutput: LayoutRect = {
		x: footerContent.x,
		y: footerContent.y,
		width: Math.max(0, mergeButton.x - footerColumnGap - footerContent.x),
		height: footerContent.height,
	}

	const footerParameterGap = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterColumnGap),
		footerOutput.width * 0.035,
	)
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
	const footerParameterValueFontSize = px(VIDEO_EDIT_LAYOUT_DESIGN.footerParameterValueFontSize)
	const footerParameterLabelFontSize = px(VIDEO_EDIT_LAYOUT_DESIGN.footerSecondaryFontSize)
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
			gap: px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardGap),
			padding: px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardPadding),
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
			title: px(VIDEO_EDIT_LAYOUT_DESIGN.titleFontSize),
			count: px(VIDEO_EDIT_LAYOUT_DESIGN.countFontSize),
			cardName: px(VIDEO_EDIT_LAYOUT_DESIGN.cardNameFontSize),
			cardDuration: px(VIDEO_EDIT_LAYOUT_DESIGN.cardDurationFontSize),
			audioName: px(VIDEO_EDIT_LAYOUT_DESIGN.audioNameFontSize),
			audioDuration: px(VIDEO_EDIT_LAYOUT_DESIGN.audioDurationFontSize),
			button: mergeButtonFontSize,
		},
	}
}
