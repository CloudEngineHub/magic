import { makeAutoObservable, runInAction } from "mobx"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type { FileContentKind } from "../utils/fileContentType"

const CONTENT_KIND_CACHE_MAX_ENTRIES = 512

/**
 * 文件图标 URL 缓存 Store
 * 统一管理 custom 项目 icon（相对路径解析后）的临时下载 URL，避免重复请求
 */
class FileIconStore {
	/** file_id -> temporaryDownloadUrl 映射缓存 */
	private urlCache = new Map<string, string>()

	/** 正在请求的 file_id 集合，避免并发重复请求 */
	private pendingRequests = new Map<string, Promise<string | undefined>>()

	/** 作用域与版本组成的 key -> 分类；只影响图标，不能替代重新预览时的内容读取。 */
	private contentKinds = new Map<string, Exclude<FileContentKind, "unknown">>()

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	getContentKind(key: string): FileContentKind {
		return this.contentKinds.get(key) ?? "unknown"
	}

	setContentKind(key: string, kind: Exclude<FileContentKind, "unknown">): void {
		this.contentKinds.delete(key)
		this.contentKinds.set(key, kind)
		if (this.contentKinds.size > CONTENT_KIND_CACHE_MAX_ENTRIES) {
			const oldestKey = this.contentKinds.keys().next().value
			if (oldestKey !== undefined) this.contentKinds.delete(oldestKey)
		}
	}

	invalidateContentKind(key: string): void {
		this.contentKinds.delete(key)
	}

	/**
	 * 获取文件图标临时 URL（带缓存）
	 * @param fileId - 图标文件的 file_id
	 * @returns 临时下载 URL，失败返回 undefined
	 */
	async getFileIconUrl(fileId: string): Promise<string | undefined> {
		if (!fileId) return undefined

		// 1. 检查缓存
		const cached = this.urlCache.get(fileId)
		if (cached) return cached

		// 2. 检查是否已有正在进行的请求
		const pending = this.pendingRequests.get(fileId)
		if (pending) return pending

		// 3. 发起新请求
		const request = this.fetchFileIconUrl(fileId)
		this.pendingRequests.set(fileId, request)

		try {
			const url = await request
			return url
		} finally {
			this.pendingRequests.delete(fileId)
		}
	}

	/**
	 * 实际请求并缓存
	 */
	private async fetchFileIconUrl(fileId: string): Promise<string | undefined> {
		try {
			const res = await getTemporaryDownloadUrl({ file_ids: [fileId] })
			const url = res?.[0]?.url
			if (typeof url === "string" && url) {
				runInAction(() => {
					this.urlCache.set(fileId, url)
				})
				return url
			}
			return undefined
		} catch (error) {
			console.warn(`[FileIconStore] Failed to fetch icon URL for file ${fileId}:`, error)
			return undefined
		}
	}

	/**
	 * 手动清除指定文件的缓存（例如文件更新后）
	 */
	invalidate(fileId: string) {
		this.urlCache.delete(fileId)
		this.pendingRequests.delete(fileId)
	}

	/**
	 * 清空所有缓存
	 */
	clearAll() {
		this.urlCache.clear()
		this.pendingRequests.clear()
		this.contentKinds.clear()
	}

	/**
	 * 获取缓存统计
	 */
	get stats() {
		return {
			cached: this.urlCache.size,
			pending: this.pendingRequests.size,
		}
	}
}

export const fileIconStore = new FileIconStore()
