import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import { buildImageProcessQuery, type ImageProcessOptions } from "@/utils/image-processing"
import { UrlCacheManager } from "./urlCache"

interface ResolveCachedResourceUrlsOptions {
	fileIds: string[]
	imageFileIds: Set<string>
	fileUpdatedAtMap: Map<string, string>
	imageProcessOptions?: ImageProcessOptions
}

const originalUrlCacheManager = new UrlCacheManager()
const processedImageUrlCacheManagers = new Map<string, UrlCacheManager>()

function getProcessedImageUrlCacheManager(options?: ImageProcessOptions): UrlCacheManager {
	if (!options) return originalUrlCacheManager

	const signature = buildImageProcessQuery(options)
	const cachedManager = processedImageUrlCacheManagers.get(signature)
	if (cachedManager) return cachedManager

	const manager = new UrlCacheManager()
	processedImageUrlCacheManagers.set(signature, manager)
	return manager
}

export async function resolveCachedResourceUrls({
	fileIds,
	imageFileIds,
	fileUpdatedAtMap,
	imageProcessOptions,
}: ResolveCachedResourceUrlsOptions): Promise<GetTemporaryDownloadUrlItem[]> {
	const imageIds = fileIds.filter((id) => imageFileIds.has(id))
	const otherIds = fileIds.filter((id) => !imageFileIds.has(id))
	const imageUrlCacheManager = getProcessedImageUrlCacheManager(imageProcessOptions)
	const { cached: cachedImageUrls, missing: missingImageIds } =
		imageUrlCacheManager.getCachedUrls(imageIds, fileUpdatedAtMap)
	const { cached: cachedOtherUrls, missing: missingOtherIds } =
		originalUrlCacheManager.getCachedUrls(otherIds, fileUpdatedAtMap)

	const [fetchedImageUrls, fetchedOtherUrls] = await Promise.all([
		missingImageIds.length > 0
			? getTemporaryDownloadUrl({
					file_ids: missingImageIds,
					...(imageProcessOptions && {
						options: { xMagicImageProcess: imageProcessOptions },
					}),
				}).then((result) => result || [])
			: Promise.resolve([]),
		missingOtherIds.length > 0
			? getTemporaryDownloadUrl({ file_ids: missingOtherIds }).then((result) => result || [])
			: Promise.resolve([]),
	])

	imageUrlCacheManager.updateUrlCache(fetchedImageUrls, fileUpdatedAtMap)
	originalUrlCacheManager.updateUrlCache(fetchedOtherUrls, fileUpdatedAtMap)

	return [...cachedImageUrls, ...cachedOtherUrls, ...fetchedImageUrls, ...fetchedOtherUrls]
}
