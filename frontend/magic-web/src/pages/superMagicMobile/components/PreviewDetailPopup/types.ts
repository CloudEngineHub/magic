import type { DetailData } from "@/pages/superMagic/components/Detail/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

export interface PreviewDetail<T extends keyof DetailData = keyof DetailData> {
	type: T
	data: DetailData[T]
	currentFileId: string
	isFromNode?: boolean
	topicId?: string
	name?: string
}

export interface PreviewDetailPopupRef {
	open: (
		options: PreviewDetail,
		attachmentTree: AttachmentItem[],
		attachmentList: AttachmentItem[],
	) => void
}

export interface PreviewDetailPopupProps {
	setUserSelectDetail: (detail: PreviewDetail | null) => void
	onClose?: () => void
	selectedTopic?: Topic | null
	isFileShare?: boolean
	enableImmersiveShareChrome?: boolean
	isImmersiveFullscreen?: boolean
	selectedProject?: ProjectListItem | null
	onOpenNewPopup?: (
		detail: PreviewDetail,
		attachmentTree: AttachmentItem[],
		attachmentList: AttachmentItem[],
	) => void
	projectId?: string
	allowDownload?: boolean
	hideHeader?: boolean
	showFileHeader?: boolean
	forceFullscreenMode?: boolean
	/** Allows pure-share preview content to expand into the browser page. */
	documentFlowFullscreen?: boolean
	allowEdit?: boolean
	onPreviewFileChange?: (fileId: string | null) => void
	onPreviewFullscreenChange?: (isFullscreen: boolean) => void
}
