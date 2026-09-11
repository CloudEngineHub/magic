import type { GetTemporaryDownloadUrlItem } from "@/pages/superMagic/utils/api"
import {
	getCachedSharedMediaUrls,
	requestSharedMediaUrls,
	seedSharedMediaUrls,
} from "@/pages/superMagic/services/sharedMediaUrlCache"
import { SHARED_MEDIA_THUMBNAIL_IMAGE_PROCESS } from "@/pages/superMagic/services/sharedMediaImageProcess"

const MENTION_PREVIEW_IMAGE_PROCESS = SHARED_MEDIA_THUMBNAIL_IMAGE_PROCESS

function buildMentionPreviewOptions(
	fileUpdatedAtMap?: ReadonlyMap<string, string>,
	fileResourceVersionMap?: ReadonlyMap<string, string>,
	fileVersions?: ReadonlyMap<string, number>,
) {
	return {
		imageProcess: MENTION_PREVIEW_IMAGE_PROCESS,
		allowAttachmentListUrl: true,
		fileUpdatedAtMap,
		fileResourceVersionMap,
		fileVersions,
	}
}

export function getCachedMentionPreviewUrls(params: {
	fileIds: string[]
	fileUpdatedAtMap?: ReadonlyMap<string, string>
	fileResourceVersionMap?: ReadonlyMap<string, string>
	fileVersions?: ReadonlyMap<string, number>
}): {
	cached: GetTemporaryDownloadUrlItem[]
	missing: string[]
} {
	return getCachedSharedMediaUrls({
		fileIds: params.fileIds,
		options: buildMentionPreviewOptions(
			params.fileUpdatedAtMap,
			params.fileResourceVersionMap,
			params.fileVersions,
		),
	})
}

export function updateMentionPreviewUrlCache(params: {
	urlData: GetTemporaryDownloadUrlItem[]
	fileUpdatedAtMap?: ReadonlyMap<string, string>
	fileResourceVersionMap?: ReadonlyMap<string, string>
	fileVersions?: ReadonlyMap<string, number>
}): void {
	seedSharedMediaUrls({
		items: params.urlData,
		options: buildMentionPreviewOptions(
			params.fileUpdatedAtMap,
			params.fileResourceVersionMap,
			params.fileVersions,
		),
	})
}

export function requestMentionPreviewUrls(
	fileIds: string[],
	params?: {
		fileUpdatedAtMap?: ReadonlyMap<string, string>
		fileResourceVersionMap?: ReadonlyMap<string, string>
		fileVersions?: ReadonlyMap<string, number>
	},
): Promise<GetTemporaryDownloadUrlItem[]> {
	return requestSharedMediaUrls(
		fileIds,
		buildMentionPreviewOptions(
			params?.fileUpdatedAtMap,
			params?.fileResourceVersionMap,
			params?.fileVersions,
		),
	)
}
