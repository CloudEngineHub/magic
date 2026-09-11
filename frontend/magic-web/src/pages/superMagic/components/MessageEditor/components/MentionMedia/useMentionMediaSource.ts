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
import { resolveSharedMediaUrl } from "@/pages/superMagic/services/sharedMediaUrlCache"
import { useSharedMediaResourceScope } from "@/pages/superMagic/services/sharedMediaResourceScope"
import { SHARED_MEDIA_THUMBNAIL_IMAGE_PROCESS } from "@/pages/superMagic/services/sharedMediaImageProcess"
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
	const projectData = isProjectFile ? (fileData as ProjectFileMentionData) : undefined
	const projectFileId = projectData?.file_id || ""
	const projectIdentity = projectData?.source_file_id || projectFileId
	const fileName = fileData?.file_name || ""
	const projectFileVersion = projectData?.file_version
	const projectUpdatedAt = projectData?.updated_at
	const projectResourceVersion =
		projectData?.resource_version ||
		(projectData?.version != null ? String(projectData.version) : undefined)
	const projectScope = useSharedMediaResourceScope()
	const projectRef = useMemo<MediaResourceRef | null>(() => {
		if (!isProjectFile || !projectFileId || !mediaType) return null
		return {
			identity: projectIdentity,
			provider: "project-file",
			scope: projectScope,
			projectId: projectData?.source_project_id || projectData?.project_id,
			fileId: projectFileId,
			fileVersion: projectFileVersion,
			updatedAt: projectUpdatedAt,
			resourceVersion: projectResourceVersion,
			path: projectData?.file_path,
			fileName,
			mediaType,
		}
	}, [
		fileName,
		isProjectFile,
		mediaType,
		projectData,
		projectFileId,
		projectFileVersion,
		projectIdentity,
		projectResourceVersion,
		projectScope,
		projectUpdatedAt,
	])

	const projectResolver = useCallback<MediaResourceResolver>(async (ref, rendition, signal) => {
		if (!ref.fileId || signal.aborted) return null
		const isImage = ref.mediaType === "image"
		const item = await resolveSharedMediaUrl({
			fileId: ref.fileId,
			scope: ref.scope,
			fileVersion: ref.fileVersion,
			updatedAt: ref.updatedAt,
			resourceVersion: ref.resourceVersion,
			allowAttachmentListUrl: isImage,
			imageProcess: isImage ? SHARED_MEDIA_THUMBNAIL_IMAGE_PROCESS : undefined,
		})
		if (signal.aborted) return null
		if (!item?.url) return { status: "error", errorCode: "url-unavailable" }

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
			snapshot.previewSize,
			snapshot.previewUrl,
			snapshot.thumbnailUrl,
			snapshot.posterUrl,
			uploadFile,
		],
	)
}
