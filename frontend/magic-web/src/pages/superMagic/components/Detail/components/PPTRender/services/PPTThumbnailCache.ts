import cryptoUtils from "@/utils/crypto"
import {
	pptThumbnailCacheRepository,
	type PPTThumbnailCacheKey,
} from "@/services/superMagic/repositories/PPTThumbnailCacheRepository"

/** 仅随截图算法／注入逻辑变化更新，不随产品发版失效。 */
const RENDERER_VERSION = 1
const CACHE_READ_BUDGET_MS = 200

export type PPTThumbnailCacheMode = "use" | "refresh"

export interface PPTThumbnailCacheScope {
	clusterCode: string
	userId: string
	organizationCode: string
	projectId: string
	mainFileId: string
}

export interface PPTThumbnailCacheContext {
	scope: PPTThumbnailCacheScope
	slideIdentity: string
	path: string
	rawContent: string
	resourceVersionSignature: string
}

export interface PPTThumbnailRenderOptions {
	width: number
	height: number
	scale: number
	mimeType: string
	quality: number
}

export function createPPTThumbnailCacheKey(
	context: PPTThumbnailCacheContext,
	render: PPTThumbnailRenderOptions,
): PPTThumbnailCacheKey {
	const { clusterCode, userId, organizationCode, projectId, mainFileId } = context.scope
	const scope = JSON.stringify([clusterCode, userId, organizationCode, projectId, mainFileId])
	const contentHash = cryptoUtils.SHA256encryption(context.rawContent)
	return {
		key: JSON.stringify([
			scope,
			context.slideIdentity,
			contentHash,
			context.resourceVersionSignature,
			[
				RENDERER_VERSION,
				render.width,
				render.height,
				render.scale,
				render.mimeType,
				render.quality,
			],
		]),
		scope,
		slideIdentity: context.slideIdentity,
		path: context.path,
	}
}

/** 慢数据库只放弃本次加速；迟到读取不创建 URL，也不会覆盖新页面。 */
export async function readPPTThumbnail(key: string): Promise<Blob | null> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			pptThumbnailCacheRepository.getThumbnail(key),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), CACHE_READ_BUDGET_MS)
			}),
		])
	} catch {
		return null
	} finally {
		if (timer !== undefined) clearTimeout(timer)
	}
}

/** 在服务仍持有本地 URL 时取得字节；不从外网下载图片，不持久保存 blob URL。 */
export async function savePPTThumbnail(
	identity: PPTThumbnailCacheKey,
	thumbnailUrl: string,
	shouldCommit: () => boolean,
): Promise<void> {
	if (!shouldCommit() || !/^(blob:|data:image\/)/.test(thumbnailUrl)) return
	try {
		const response = await fetch(thumbnailUrl)
		const blob = await response.blob()
		if (!shouldCommit()) return
		await pptThumbnailCacheRepository.putThumbnail(identity, blob, shouldCommit)
	} catch {
		// URL 可能已随页面释放；持久化失败不改变本次截图结果。
	}
}

export function deletePPTThumbnail(key: string): Promise<void> {
	return pptThumbnailCacheRepository.deleteThumbnail(key)
}
