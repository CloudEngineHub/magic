import { buildImageProcessQuery, type ImageProcessOptions } from "@/utils/image-processing"

interface AttachmentCacheFile {
	file_id: string
	relative_file_path: string
	file_name: string
}

export interface CardFrameSourceResult {
	processedContent: string
}

const cardFrameSourceCache = new Map<string, Promise<CardFrameSourceResult>>()

export function invalidateCardFrameSourceCache(fileId?: string) {
	if (!fileId) return

	for (const cacheKey of Array.from(cardFrameSourceCache.keys())) {
		if (!cacheKey.startsWith(`${fileId}::`)) continue
		cardFrameSourceCache.delete(cacheKey)
	}
}

export function createAttachmentSignature(files: AttachmentCacheFile[]) {
	return files
		.map((item) => `${item.file_id}:${item.relative_file_path}:${item.file_name}`)
		.sort()
		.join("|")
}

export function createImageProcessSignature(options?: ImageProcessOptions) {
	return options ? buildImageProcessQuery(options) : "original"
}

export function createCardFrameCacheKey({
	fileId,
	version,
	relativeFolderPath,
	attachmentSignature,
	imageProcessSignature,
}: {
	fileId?: string
	version?: string
	relativeFolderPath: string
	attachmentSignature: string
	imageProcessSignature: string
}) {
	if (!fileId) return null
	return `${fileId}::${version ?? ""}::${relativeFolderPath}::${attachmentSignature}::${imageProcessSignature}`
}

export function getCachedCardFrameSource(
	cacheKey: string,
	loadSource: () => Promise<CardFrameSourceResult>,
) {
	const cachedPromise = cardFrameSourceCache.get(cacheKey)
	if (cachedPromise) return cachedPromise

	const nextPromise = loadSource().catch((error) => {
		cardFrameSourceCache.delete(cacheKey)
		throw error
	})
	cardFrameSourceCache.set(cacheKey, nextPromise)
	return nextPromise
}
