import type { ReactElement } from "react"
import { useTranslation } from "react-i18next"
import { Tooltip, type TooltipProps } from "antd"
import { useIsMobile } from "@/hooks/useIsMobile"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import {
	type CanvasMarkerMentionData,
	MentionItemType,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import MarkerTooltip from "../../MentionNodes/marker"
import { MentionTooltipContent } from "./MentionTooltipContent"
import { MediaPreviewTooltip } from "@/components/base/MediaPreview"
import {
	useMentionMediaSource,
	type MentionMediaSource,
} from "../../MentionMedia/useMentionMediaSource"
import {
	DEFAULT_FILE_MENTION_RENDER_CONFIG,
	isFileMentionFeatureEnabled,
	getFileMentionRenderType,
	type FileMentionRenderConfig,
} from "../../MentionMedia/fileMentionRenderConfig"

interface MentionTooltipWrapperProps {
	children: ReactElement
	data: TiptapMentionAttributes
	displayName?: string
	description?: string
	isInMessageList: boolean
	placement?: TooltipProps["placement"]
	tooltipProps?: Partial<TooltipProps>
	markerTooltipProps?: {
		popoverClassName?: string
		parentPopoverOpen?: boolean
		side?: "top" | "right" | "bottom" | "left"
	}
	transformedMarkerData?: CanvasMarkerMentionData | null
	markerLoading?: boolean
	markerImageUrl?: string | null
	mediaSource?: MentionMediaSource
	fileMentionRenderConfig?: FileMentionRenderConfig
}

export function MentionTooltipWrapper(props: MentionTooltipWrapperProps) {
	const {
		children,
		data,
		displayName,
		description,
		isInMessageList,
		placement,
		tooltipProps,
		markerTooltipProps,
		transformedMarkerData,
		markerLoading,
		markerImageUrl,
		mediaSource: providedMediaSource,
		fileMentionRenderConfig = DEFAULT_FILE_MENTION_RENDER_CONFIG,
	} = props

	const isMobile = useIsMobile()
	const { t } = useTranslation("super")
	const ownMediaSource = useMentionMediaSource({
		data,
		uploadFile:
			data.type === MentionItemType.UPLOAD_FILE
				? (data.data as UploadFileMentionData).file
				: null,
		enabled: !isMobile && !providedMediaSource,
	})
	const mediaSource = providedMediaSource ?? ownMediaSource
	const mediaType = mediaSource.mediaType

	if (isMobile) {
		return children
	}

	if (data.type === MentionItemType.DESIGN_MARKER) {
		return (
			<MarkerTooltip
				markerData={transformedMarkerData ?? null}
				isInMessageList={isInMessageList}
				loading={markerLoading}
				popoverClassName={markerTooltipProps?.popoverClassName}
				parentPopoverOpen={markerTooltipProps?.parentPopoverOpen}
				side={markerTooltipProps?.side}
				imageUrl={markerImageUrl}
			>
				{children}
			</MarkerTooltip>
		)
	}

	const renderType = getFileMentionRenderType(mediaType)

	if (mediaType && isFileMentionFeatureEnabled("tooltip", renderType, fileMentionRenderConfig)) {
		return (
			<MediaPreviewTooltip
				mediaType={mediaType}
				fileName={displayName || ""}
				previewUrl={mediaSource.previewUrl}
				audioUrl={mediaSource.audioUrl}
				isLoading={mediaSource.isLoading}
				hasError={
					mediaSource.hasError || (!mediaSource.previewUrl && !mediaSource.isLoading)
				}
				errorMessage={t("common.fileUrlFetchFailed", "预览加载失败")}
				closeLabel={t("common.close", "关闭")}
				audioLabels={{
					play: t("common.play", "播放"),
					pause: t("common.pause", "暂停"),
					progress: t("common.progress", "播放进度"),
				}}
				side={
					placement?.startsWith("left")
						? "left"
						: placement?.startsWith("right")
							? "right"
							: placement?.startsWith("bottom")
								? "bottom"
								: "top"
				}
			>
				{children}
			</MediaPreviewTooltip>
		)
	}

	// 文件 Mention 的 Tooltip 由文件类型配置独立控制；未启用时保持原节点。
	const isFileMention =
		data.type === MentionItemType.PROJECT_FILE || data.type === MentionItemType.UPLOAD_FILE
	if (isFileMention) return children

	return (
		<Tooltip
			{...tooltipProps}
			title={
				<MentionTooltipContent
					data={data}
					displayName={displayName}
					description={description}
				/>
			}
			placement={placement}
		>
			{children}
		</Tooltip>
	)
}
