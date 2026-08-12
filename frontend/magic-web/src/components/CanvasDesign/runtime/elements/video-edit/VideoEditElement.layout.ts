import {
	resolveResponsiveElementLayout,
	type LayoutRect,
	type ResponsiveLayoutMode,
} from "../../shared/layout/ResponsiveElementLayout"

export const VIDEO_EDIT_LAYOUT_DESIGN = {
	width: 1280,
	height: 720,
	baseRem: 16,
	sectionHorizontalPadding: 24,
	videoPaddingTop: 20,
	videoPaddingBottom: 16,
	audioVerticalPadding: 8,
	headingHeight: 22,
	headingGap: 10,
	audioHeadingGap: 4,
	videoCardWidth: 176,
	videoCardHeight: 300,
	videoCardInfoHeight: 42,
	videoCardGap: 12,
	videoCardPadding: 10,
	videoGripSize: 24,
	videoScrollbarHeight: 6,
	videoScrollbarGap: 8,
	audioSectionMinHeight: 112,
	audioSectionMaxHeight: 144,
	audioRowHeight: 64,
	audioRowHorizontalPadding: 14,
	audioColumnGap: 18,
	audioPlayButtonSize: 42,
	audioInfoWidth: 72,
	footerMinHeight: 112,
	footerMaxHeight: 158,
	footerColumnGap: 24,
	footerParameterColumnGap: 10,
	// 与分镜参数行一致：固定控件尺寸，不随 footer 剩余空间拉伸。
	footerParameterWidth: 176,
	footerParameterHeight: 46,
	footerParameterLabelWidth: 56,
	footerParameterResolutionLabelWidth: 48,
	footerParameterHorizontalPadding: 8,
	footerParameterSuffixGap: 6,
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
	buttonFontSize: 14,
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
	audioRow: LayoutRect
	audioPlayButton: LayoutRect
	audioWaveform: LayoutRect
	audioInfo: LayoutRect
	footer: LayoutRect
	footerOutput: LayoutRect
	footerParameterRows: {
		aspectRatio: VideoEditFooterParameterLayout
		resolution: VideoEditFooterParameterLayout
		format: VideoEditFooterParameterLayout
	}
	mergeButton: LayoutRect
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
		px(16),
		Math.min(responsive.width, responsive.height) * 0.035,
		px(VIDEO_EDIT_LAYOUT_DESIGN.sectionHorizontalPadding),
	)
	const audioHeight = responsive.clamp(
		px(VIDEO_EDIT_LAYOUT_DESIGN.audioSectionMinHeight),
		responsive.height * 0.2,
		px(VIDEO_EDIT_LAYOUT_DESIGN.audioSectionMaxHeight),
	)
	const footerHeight = responsive.clamp(
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerMinHeight),
		responsive.height * 0.22,
		px(VIDEO_EDIT_LAYOUT_DESIGN.footerMaxHeight),
	)
	const videoHeight = Math.max(0, responsive.height - audioHeight - footerHeight)
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

	const headingHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.headingHeight)
	const headingGap = px(VIDEO_EDIT_LAYOUT_DESIGN.headingGap)
	const videoPaddingTop = px(VIDEO_EDIT_LAYOUT_DESIGN.videoPaddingTop)
	const videoPaddingBottom = px(VIDEO_EDIT_LAYOUT_DESIGN.videoPaddingBottom)
	const headingWidth = Math.max(0, responsive.width - sectionHorizontalPadding * 2)
	const videoTitle: LayoutRect = {
		x: sectionHorizontalPadding,
		y: videoSection.y + videoPaddingTop,
		width: headingWidth * 0.7,
		height: headingHeight,
	}
	const videoCount: LayoutRect = {
		x: videoTitle.x + videoTitle.width,
		y: videoTitle.y,
		width: headingWidth - videoTitle.width,
		height: headingHeight,
	}
	const scrollbarHeight = px(VIDEO_EDIT_LAYOUT_DESIGN.videoScrollbarHeight)
	const scrollbarGap = px(VIDEO_EDIT_LAYOUT_DESIGN.videoScrollbarGap)
	const videoViewport: LayoutRect = {
		x: sectionHorizontalPadding,
		y: videoTitle.y + videoTitle.height + headingGap,
		width: headingWidth,
		height: Math.max(
			0,
			videoSection.y +
				videoSection.height -
				videoPaddingBottom -
				(videoTitle.y + videoTitle.height + headingGap),
		),
	}
	const videoScrollbar: LayoutRect = {
		x: videoViewport.x,
		y: Math.max(videoViewport.y, videoViewport.y + videoViewport.height - scrollbarHeight),
		width: videoViewport.width,
		height: Math.min(scrollbarHeight, videoViewport.height),
	}
	const videoCardViewport: LayoutRect = {
		x: videoViewport.x,
		y: videoViewport.y,
		width: videoViewport.width,
		height: Math.max(0, videoViewport.height - scrollbarGap - videoScrollbar.height),
	}
	const videoCardHeight = Math.min(
		px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardHeight),
		videoCardViewport.height,
	)

	const audioVerticalPadding = px(VIDEO_EDIT_LAYOUT_DESIGN.audioVerticalPadding)
	const audioHeadingGap = px(VIDEO_EDIT_LAYOUT_DESIGN.audioHeadingGap)
	const audioTitleGap = px(10)
	const audioTitleWidth = Math.min(px(72), headingWidth * 0.28)
	const audioTitle: LayoutRect = {
		x: sectionHorizontalPadding,
		y: audioSection.y + audioVerticalPadding,
		width: audioTitleWidth,
		height: Math.min(
			headingHeight,
			Math.max(0, audioSection.height - audioVerticalPadding * 2),
		),
	}
	const audioCount: LayoutRect = {
		x: audioTitle.x + audioTitle.width + audioTitleGap,
		y: audioTitle.y,
		width: Math.max(0, headingWidth - audioTitle.width - audioTitleGap),
		height: audioTitle.height,
	}
	const audioRowContainer: LayoutRect = {
		x: sectionHorizontalPadding,
		y: audioTitle.y + audioTitle.height + audioHeadingGap,
		width: headingWidth,
		height: Math.max(
			0,
			audioSection.y +
				audioSection.height -
				audioVerticalPadding -
				(audioTitle.y + audioTitle.height + audioHeadingGap),
		),
	}
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
	const maxAudioInfoWidth = Math.max(0, remainingAfterButton * 0.28)
	const audioInfoWidth = Math.min(desiredAudioInfoWidth, maxAudioInfoWidth)
	const audioInfo: LayoutRect = {
		x: audioRow.x + audioRow.width - audioRowPadding - audioInfoWidth,
		y: audioRow.y,
		width: audioInfoWidth,
		height: audioRow.height,
	}
	const audioWaveform: LayoutRect = {
		x: audioPlayButton.x + audioPlayButton.width + resolvedAudioGap,
		y: audioRow.y + audioRow.height * 0.21,
		width: Math.max(
			0,
			audioInfo.x -
				resolvedAudioGap -
				(audioPlayButton.x + audioPlayButton.width + resolvedAudioGap),
		),
		height: audioRow.height * 0.58,
	}

	const footerContent = responsive.insetRect(footer, {
		left: sectionHorizontalPadding,
		right: sectionHorizontalPadding,
		top: px(12),
		bottom: px(12),
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
			width: px(VIDEO_EDIT_LAYOUT_DESIGN.videoCardWidth),
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
		audioRow,
		audioPlayButton,
		audioWaveform,
		audioInfo,
		footer,
		footerOutput,
		footerParameterRows,
		mergeButton,
		fonts: {
			title: px(VIDEO_EDIT_LAYOUT_DESIGN.titleFontSize),
			count: px(VIDEO_EDIT_LAYOUT_DESIGN.countFontSize),
			cardName: px(VIDEO_EDIT_LAYOUT_DESIGN.cardNameFontSize),
			cardDuration: px(VIDEO_EDIT_LAYOUT_DESIGN.cardDurationFontSize),
			audioName: px(VIDEO_EDIT_LAYOUT_DESIGN.audioNameFontSize),
			audioDuration: px(VIDEO_EDIT_LAYOUT_DESIGN.audioDurationFontSize),
			button: px(VIDEO_EDIT_LAYOUT_DESIGN.buttonFontSize),
		},
	}
}
