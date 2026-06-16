import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SetSelfMediaPostPublishStatusParams } from "./SelfMediaFileStorageService"

interface PublishStatusStorage {
	setPostPublishStatus: (params: SetSelfMediaPostPublishStatusParams) => Promise<void>
}

interface PublishStatusStore {
	updatePlatformPostPublishStatus: (
		platform: SelfMediaPlatformPostItem["platform"],
		entryId: string,
	) => void
}

export function getSelfMediaPostPublishStatus(target: SelfMediaPlatformPostItem) {
	return target.entry.publishStatus || target.post.meta.publishStatus
}

export async function clearPostPublishStatusAfterPublishedLinkBind({
	target,
	fileStorageService,
	store,
}: {
	target: SelfMediaPlatformPostItem
	fileStorageService?: PublishStatusStorage | null
	store: PublishStatusStore
}): Promise<boolean> {
	if (!fileStorageService || !getSelfMediaPostPublishStatus(target)) return false
	await fileStorageService.setPostPublishStatus({
		platform: target.platform,
		id: target.entry.id,
		entry: target.entry.entry,
	})
	store.updatePlatformPostPublishStatus(target.platform, target.entry.id)
	return true
}
