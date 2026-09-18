import { useCallback, useEffect, useRef, type ReactNode } from "react"

import { getToolDetailSelectionTarget } from "@/pages/superMagic/components/MessageList/components/Nodes/toolDetailSelection"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import PreviewDetailPopup, {
	type PreviewDetail,
	type PreviewDetailPopupRef,
} from "@/pages/superMagicMobile/components/PreviewDetailPopup"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

interface UsePublishedRuntimePreviewOptions {
	enabled: boolean
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	fileTree: AttachmentItem[]
	fileList: AttachmentItem[]
}

export function buildRuntimeFilePreviewDetail(payload: {
	fileId?: string
	fileData?: Record<string, unknown>
}): PreviewDetail | undefined {
	const fileData = payload.fileData
	const fileIdValue = fileData?.file_id ?? payload.fileId
	const fileId =
		typeof fileIdValue === "number"
			? String(fileIdValue)
			: typeof fileIdValue === "string"
				? fileIdValue
				: ""
	if (!fileId) return undefined
	const fileName =
		(typeof fileData?.file_name === "string" && fileData.file_name) ||
		(typeof fileData?.display_filename === "string" && fileData.display_filename) ||
		""
	const fileExtension =
		(typeof fileData?.file_extension === "string" && fileData.file_extension) ||
		fileName.split(".").pop() ||
		""
	return {
		type: fileExtension || "empty",
		data: {
			...fileData,
			file_id: fileId,
			file_name: fileName,
			file_extension: fileExtension,
		},
		currentFileId: fileId,
	} as PreviewDetail
}

export function usePublishedRuntimePreview({
	enabled,
	selectedProject,
	selectedTopic,
	fileTree,
	fileList,
}: UsePublishedRuntimePreviewOptions): {
	handleSelectDetail: (detail: unknown) => void
	handleOpenFile: (file?: unknown) => void
	openPreviewDetail: (detail: unknown) => void
	previewPopup: ReactNode
} {
	const previewDetailPopupRef = useRef<PreviewDetailPopupRef>(null)
	const openPreviewDetail = useCallback(
		(detail: unknown) => {
			if (!detail || typeof detail !== "object") return
			previewDetailPopupRef.current?.open(detail as PreviewDetail, fileTree, fileList)
		},
		[fileList, fileTree],
	)
	const handleSelectDetail = useCallback(
		(detail: unknown) => {
			if (getToolDetailSelectionTarget(detail) === "file") return
			openPreviewDetail(detail)
		},
		[openPreviewDetail],
	)
	const handleOpenFile = useCallback(
		(file?: unknown) => {
			if (!file || typeof file !== "object" || Array.isArray(file)) return
			const fileData = file as Record<string, unknown>
			const fileIdValue = fileData.file_id
			const detail = buildRuntimeFilePreviewDetail({
				fileId:
					typeof fileIdValue === "string" || typeof fileIdValue === "number"
						? String(fileIdValue)
						: undefined,
				fileData,
			})
			if (detail) openPreviewDetail(detail)
		},
		[openPreviewDetail],
	)

	useEffect(() => {
		if (!enabled) return
		const handleOpenFileTab = (data: {
			fileId?: string
			fileData?: Record<string, unknown>
		}) => {
			const detail = buildRuntimeFilePreviewDetail(data)
			if (detail) openPreviewDetail(detail)
		}
		const handleOpenFileTabByPath = (data: {
			filePath?: string
			fileName?: string
			action?: "open" | "download"
		}) => {
			if (data.action === "download" || !data.filePath) return
			const targetPath = data.filePath.replace(/^\//, "")
			const matched = fileList.find(
				(item) => (item.relative_file_path || "").replace(/^\//, "") === targetPath,
			)
			if (matched) handleOpenFile(matched)
		}
		pubsub.subscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
		pubsub.subscribe(PubSubEvents.Open_File_Tab_By_Path, handleOpenFileTabByPath)
		pubsub.subscribe(PubSubEvents.Open_Playback_Tab, openPreviewDetail)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab, handleOpenFileTab)
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab_By_Path, handleOpenFileTabByPath)
			pubsub.unsubscribe(PubSubEvents.Open_Playback_Tab, openPreviewDetail)
		}
	}, [enabled, fileList, handleOpenFile, openPreviewDetail])

	const previewPopup = enabled ? (
		<PreviewDetailPopup
			ref={previewDetailPopupRef}
			setUserSelectDetail={openPreviewDetail}
			selectedProject={selectedProject}
			selectedTopic={selectedTopic}
			allowEdit
		/>
	) : null

	return { handleSelectDetail, handleOpenFile, openPreviewDetail, previewPopup }
}
