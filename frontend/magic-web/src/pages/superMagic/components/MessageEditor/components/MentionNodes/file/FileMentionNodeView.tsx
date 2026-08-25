import { NodeViewWrapper } from "@/infrastructure/editors/tiptap/react"
import { observer } from "mobx-react-lite"
import { useCallback, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import { MediaPreviewThumbnail, MediaPreviewTooltip } from "@/components/base/MediaPreview"
import {
	getMentionDisplayName,
	type MentionNodeViewRendererProps,
	type TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/utils/cn"
import { useOptionalMessageEditorStore } from "../../../stores"
import { toDisplayUploadProgress } from "../../../utils/uploadProgress"
import { useMentionMediaSource } from "../../MentionMedia/useMentionMediaSource"
import {
	DEFAULT_FILE_MENTION_RENDER_CONFIG,
	getFileMentionRenderType,
	isFileMentionFeatureEnabled,
} from "../../MentionMedia/fileMentionRenderConfig"

type FileMentionData = ProjectFileMentionData | UploadFileMentionData

function FileMentionNodeView({ attrs, deleteNode, selected }: MentionNodeViewRendererProps) {
	const isMobile = useIsMobile()
	const { t } = useTranslation("super")
	const editorStore = useOptionalMessageEditorStore()
	const mention = attrs as TiptapMentionAttributes
	const data = attrs.data as FileMentionData
	const isUpload = attrs.type === MentionItemType.UPLOAD_FILE
	const uploadData = isUpload ? (data as UploadFileMentionData) : undefined
	const liveFile = uploadData
		? editorStore?.fileUploadStore.getFileById(uploadData.file_id)
		: undefined
	const fileName = liveFile?.name || getMentionDisplayName(mention)
	const file = liveFile?.file || uploadData?.file || null
	const mediaSource = useMentionMediaSource({ data: mention, uploadFile: file })
	const { mediaType, thumbnailUrl: mediaUrl, isLoading, hasError } = mediaSource
	const status = liveFile?.status ?? uploadData?.upload_status
	const progress = toDisplayUploadProgress(liveFile?.progress ?? uploadData?.upload_progress) ?? 0
	const isUploading = isUpload && (status === "init" || status === "uploading")
	const isError = isUpload && status === "error"

	const handleMouseDown = useCallback((event: MouseEvent) => {
		event.preventDefault()
	}, [])

	const handleRemove = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.preventDefault()
			event.stopPropagation()
			deleteNode?.()
		},
		[deleteNode],
	)

	const fileIcon = (
		<MagicFileIcon
			type={data.file_extension || fileName.split(".").pop() || ""}
			size={16}
			className="shrink-0"
		/>
	)
	const showIcon = isFileMentionFeatureEnabled(
		"icon",
		getFileMentionRenderType(mediaType),
		DEFAULT_FILE_MENTION_RENDER_CONFIG,
	)
	const showMediaTooltip =
		!isMobile &&
		isFileMentionFeatureEnabled(
			"tooltip",
			getFileMentionRenderType(mediaType),
			DEFAULT_FILE_MENTION_RENDER_CONFIG,
		)
	const thumbnail =
		showIcon && mediaType ? (
			<MediaPreviewThumbnail
				mediaType={mediaType}
				thumbnailUrl={mediaUrl}
				alt={fileName}
				fallback={fileIcon}
				className="size-4 shrink-0 rounded object-cover"
			/>
		) : (
			fileIcon
		)

	const visual = (
		<span
			className={cn(
				"relative inline-flex min-w-0 max-w-[220px] items-center gap-1 overflow-hidden",
				isMobile
					? "mb-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-sm text-foreground"
					: "h-[18px] rounded bg-primary-10 px-1 leading-none text-primary",
				!isMobile && isUploading && "bg-muted text-muted-foreground",
				isError && "bg-destructive/10 text-destructive",
				selected && "ring-1 ring-primary/40",
			)}
			data-testid={isUpload ? "upload-file-mention-visual" : "file-mention-visual"}
		>
			{isUploading && (
				<span
					className={cn(
						"pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-200 ease-out",
						isMobile ? "bg-primary/10" : "bg-primary/15",
					)}
					style={{ width: `${progress}%` }}
					data-testid={
						isUpload
							? "upload-file-mention-progress-background"
							: "file-mention-progress-background"
					}
				/>
			)}
			{thumbnail && (
				<span className="relative z-10 flex shrink-0 items-center">{thumbnail}</span>
			)}
			<span className="relative z-10 min-w-0 truncate" title={fileName}>
				{fileName}
			</span>
			{isUploading && (
				<span
					className="relative z-10 shrink-0 text-[0.85em] tabular-nums leading-none text-muted-foreground"
					data-testid={
						isUpload ? "upload-file-mention-progress" : "file-mention-progress"
					}
				>
					{progress}%
				</span>
			)}
			{isError && (
				<span className="relative z-10 shrink-0 text-xs">
					{t("fileUpload.uploadFailed")}
				</span>
			)}
			{isMobile && (
				<button
					type="button"
					className="relative z-10 inline-flex size-4 shrink-0 items-center justify-center rounded-full"
					onMouseDown={handleMouseDown}
					onClick={handleRemove}
					aria-label={t("uploadModal.removeFile")}
				>
					<X size={16} />
				</button>
			)}
		</span>
	)

	const content =
		showMediaTooltip && mediaType ? (
			<MediaPreviewTooltip
				mediaType={mediaType}
				fileName={fileName}
				previewUrl={mediaUrl}
				audioUrl={mediaSource.audioUrl}
				isLoading={isLoading}
				hasError={hasError || Boolean(mediaType && !mediaUrl && !isLoading)}
				errorMessage={t("filePreview.loadFailed", "预览加载失败")}
				closeLabel={t("filePreview.close", "关闭预览")}
				audioLabels={{
					play: t("filePreview.play", "播放"),
					pause: t("filePreview.pause", "暂停"),
					progress: t("filePreview.progress", "播放进度"),
				}}
			>
				{visual}
			</MediaPreviewTooltip>
		) : (
			visual
		)

	return (
		<NodeViewWrapper
			as="span"
			className="magic-mention relative !-top-px !inline-flex max-w-full !overflow-visible !bg-transparent !p-0 !align-middle"
			contentEditable={false}
			data-mention-node-view="file"
			data-type={attrs.type}
			data-data={JSON.stringify(attrs.data || {})}
			onMouseDown={handleMouseDown}
		>
			{content}
		</NodeViewWrapper>
	)
}

export default observer(FileMentionNodeView)
