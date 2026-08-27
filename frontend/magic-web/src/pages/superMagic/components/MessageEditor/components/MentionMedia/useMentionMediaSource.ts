import { useMemo } from "react"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import { getFileType } from "@/pages/superMagic/utils/handleFIle"
import { useFileUrl } from "@/pages/superMagic/hooks/useFileUrl"
import useObjectUrl from "../AtItem/hooks/useObjectURL"
import type { MediaPreviewType } from "@/components/base/MediaPreview"

export interface MentionMediaSource {
	mediaType: MediaPreviewType | null
	thumbnailUrl: string | null
	previewUrl: string | null
	audioUrl: string | null
	isLoading: boolean
	hasError: boolean
}

interface UseMentionMediaSourceOptions {
	data: TiptapMentionAttributes
	/** 编辑器内实时上传文件；用于保留生产 liveFile 优先行为。 */
	uploadFile?: File | null
	enabled?: boolean
}

function getMentionFileData(data: TiptapMentionAttributes) {
	if (data.type === MentionItemType.PROJECT_FILE) {
		return data.data as ProjectFileMentionData
	}
	if (data.type === MentionItemType.UPLOAD_FILE) {
		return data.data as UploadFileMentionData
	}
	return null
}

export function useMentionMediaSource({
	data,
	uploadFile,
	enabled = true,
}: UseMentionMediaSourceOptions): MentionMediaSource {
	const fileData = getMentionFileData(data)
	const extension =
		fileData?.file_extension ||
		uploadFile?.type.split("/").pop() ||
		fileData?.file_name.split(".").pop() ||
		""
	const fileType = getFileType(extension)
	const mediaType: MediaPreviewType | null =
		fileType === "image" || fileType === "video" || fileType === "audio" ? fileType : null
	const isProjectFile = data.type === MentionItemType.PROJECT_FILE
	const isUploadFile = data.type === MentionItemType.UPLOAD_FILE
	const projectFileId = isProjectFile ? (fileData as ProjectFileMentionData)?.file_id : ""
	const { fileUrl, isLoading, hasError } = useFileUrl({
		file_id: projectFileId || "",
		enabled: enabled && isProjectFile && Boolean(mediaType),
	})
	const objectUrl = useObjectUrl(enabled && isUploadFile && mediaType ? uploadFile || null : null)
	const url = isProjectFile ? fileUrl : objectUrl

	return useMemo(
		() => ({
			mediaType,
			thumbnailUrl: url,
			previewUrl: url,
			audioUrl: mediaType === "audio" ? url : null,
			isLoading: isProjectFile ? isLoading : false,
			hasError: isProjectFile
				? hasError
				: Boolean(isUploadFile && mediaType && !url && uploadFile),
		}),
		[hasError, isLoading, isProjectFile, isUploadFile, mediaType, uploadFile, url],
	)
}
