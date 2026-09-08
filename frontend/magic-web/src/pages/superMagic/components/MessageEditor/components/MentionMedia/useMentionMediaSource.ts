import { useCallback, useMemo } from "react"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { MediaPreviewSource, MediaPreviewType } from "@/components/base/MediaPreview"
import {
	mediaResourceRegistry,
	useMediaResourceSnapshot,
	type MediaResourceRef,
	type MediaResourceResolver,
} from "@/services/media/MediaResourceRegistry"
import { resolveSharedFileUrl } from "@/pages/superMagic/services/sharedFileUrlCache"
import { getFileType } from "@/pages/superMagic/utils/handleFIle"
import useObjectUrl from "../AtItem/hooks/useObjectURL"

export interface MentionMediaSource extends Omit<MediaPreviewSource, "mediaType"> {
	mediaType: MediaPreviewType | null
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

function isResourceError(status: string | undefined) {
	return status === "error" || status === "forbidden" || status === "deleted"
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
	const projectIdentity =
		(isProjectFile ? (fileData as ProjectFileMentionData)?.source_file_id : undefined) ||
		projectFileId
	const fileName = fileData?.file_name || ""

	const projectRef = useMemo<MediaResourceRef | null>(() => {
		if (!isProjectFile || !projectFileId || !mediaType) return null
		return {
			identity: projectIdentity,
			provider: "project-file",
			projectId:
				(fileData as ProjectFileMentionData)?.source_project_id ||
				(fileData as ProjectFileMentionData)?.project_id,
			fileId: projectFileId,
			path: (fileData as ProjectFileMentionData)?.file_path,
			fileName,
			mediaType,
		}
	}, [fileData, fileName, isProjectFile, mediaType, projectFileId, projectIdentity])

	const projectResolver = useCallback<MediaResourceResolver>(async (ref, rendition, signal) => {
		if (!ref.fileId || signal.aborted) return null
		const item = await resolveSharedFileUrl({ fileId: ref.fileId })
		if (signal.aborted) return null
		if (!item?.url) return { status: "error", errorCode: "url-unavailable" }

		// The current project-file endpoint returns one temporary URL. Reuse it for
		// image thumbnail and preview so opening an image mention does not issue a
		// second request. Video/audio remain preview-on-open only.
		return {
			status: "ready" as const,
			thumbnailUrl: rendition === "thumbnail" ? item.url : undefined,
			previewUrl:
				rendition === "preview" || (ref.mediaType === "image" && rendition === "thumbnail")
					? item.url
					: undefined,
			audioUrl: ref.mediaType === "audio" && rendition === "preview" ? item.url : undefined,
			expiresAt: item.expires_at,
		}
	}, [])

	const projectResource = useMediaResourceSnapshot(projectRef, {
		enabled: enabled && isProjectFile && Boolean(mediaType),
		loadThumbnail: mediaType === "image",
		resolver: projectResolver,
	})

	const objectUrl = useObjectUrl(enabled && isUploadFile && mediaType ? uploadFile || null : null)
	const snapshot = projectResource.snapshot
	const projectUrl = snapshot.previewUrl ?? snapshot.thumbnailUrl
	const isProjectLoading = isProjectFile && snapshot.status === "loading"
	const isProjectError = isProjectFile && isResourceError(snapshot.status)
	const loadPreview = useCallback(() => {
		if (!enabled || !projectRef) return Promise.resolve()
		return mediaResourceRegistry.ensurePreview(projectRef, projectResolver)
	}, [enabled, projectRef, projectResolver])

	return useMemo(
		() => ({
			mediaType,
			thumbnailUrl: isUploadFile ? objectUrl : snapshot.thumbnailUrl,
			previewUrl: isUploadFile ? objectUrl : projectUrl,
			audioUrl:
				mediaType === "audio"
					? isUploadFile
						? objectUrl
						: (snapshot.audioUrl ?? snapshot.previewUrl)
					: null,
			isLoading: isProjectFile ? isProjectLoading : false,
			hasError: isProjectFile
				? isProjectError
				: Boolean(isUploadFile && mediaType && !objectUrl && uploadFile),
			loadPreview: isProjectFile ? loadPreview : undefined,
			previewSize: snapshot.previewSize,
			posterUrl: snapshot.posterUrl,
		}),
		[
			isProjectError,
			isProjectFile,
			isProjectLoading,
			isUploadFile,
			loadPreview,
			mediaType,
			objectUrl,
			projectUrl,
			snapshot.audioUrl,
			snapshot.previewUrl,
			snapshot.previewSize,
			snapshot.posterUrl,
			snapshot.thumbnailUrl,
			uploadFile,
		],
	)
}
