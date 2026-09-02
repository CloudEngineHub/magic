import { Upload, type UploadConfig } from "@dtyq/upload-sdk"
import { RequestMethod } from "@/apis/constant"
import { FileApi, SuperMagicApi } from "@/apis"
import { userStore } from "@/models/user"
import { logger as Logger } from "@/utils/log"
import { UploadSource } from "../types"
import { superMagicUploadTokenService } from "./UploadTokenService"
import { htmlScreenshotStorage, type StoredHtmlScreenshot } from "./HtmlScreenshotStorage"
import { forgetHtmlScreenshotByStorageId } from "./HtmlScreenshotTargetStore"
import type { SaveUploadFileToProjectResponse } from "@/pages/superMagic/utils/api"

export interface StoreHtmlScreenshotParams {
	dataUrl: string
	fileName: string
	captureId?: string
}

export interface StagedHtmlScreenshot {
	storageId: string
	fileName: string
	fileSize: number
	fileKey: string
}

export interface UploadStoredScreenshotItem {
	storageId: string
	fileName: string
}

const logger = Logger.createLogger("HtmlScreenshotUpload")

/**
 * Region shots stage to OSS after confirm and batch-save on send.
 * Element shots stay local for preview and are never uploaded.
 */
class HtmlScreenshotUploadService {
	private readonly uploader = new Upload()
	private readonly stagedByStorageId = new Map<string, StagedHtmlScreenshot>()
	private readonly stagingPromises = new Map<string, Promise<StagedHtmlScreenshot>>()

	private async uploadToOss(
		file: File,
		fileName: string,
		projectId: string,
		credentials: UploadConfig["customCredentials"],
		onProgress?: (progress: number) => void,
	) {
		const { organizationCode, authorization } = userStore.user
		return new Promise<{ key: string; size: number }>((resolve, reject) => {
			const { success, fail, progress } = this.uploader.upload({
				url: superMagicUploadTokenService.getUploadTokenUrl,
				file,
				fileName,
				method: RequestMethod.POST,
				headers: {
					"Content-Type": "application/json",
					authorization: authorization ?? "",
					"Organization-Code": organizationCode ?? "",
				},
				option: { rewriteFileName: false },
				customCredentials: credentials,
				body: JSON.stringify({ project_id: projectId, expires: 3600 }),
			})

			progress?.((value) => {
				if (typeof value === "number") onProgress?.(Math.round(value))
			})
			success?.((response) => {
				const key = response?.data?.path
				if (!key) {
					reject(new Error("截图上传未返回文件路径"))
					return
				}
				resolve({ key, size: file.size })
			})
			fail?.((error) => reject(new Error(`截图上传失败：${String(error)}`)))
		})
	}

	async storeScreenshot({
		dataUrl,
		fileName,
		captureId,
	}: StoreHtmlScreenshotParams): Promise<StoredHtmlScreenshot> {
		try {
			return await htmlScreenshotStorage.store(dataUrl, fileName, captureId)
		} catch (error) {
			logger.error({
				eventKey: "html_screenshot_store_failed",
				errorKind: "storage",
				error,
				message: "html screenshot storage failed",
			})
			throw error instanceof Error ? error : new Error("截图保存失败")
		}
	}

	async stageStoredScreenshots(
		items: UploadStoredScreenshotItem[],
		projectId: string,
	): Promise<StagedHtmlScreenshot[]> {
		if (!projectId) throw new Error("当前项目不可用，无法保存截图")
		if (items.length === 0) return []

		const resolved: Array<StagedHtmlScreenshot | undefined> = Array.from({
			length: items.length,
		})
		const missing: UploadStoredScreenshotItem[] = []
		const missingIndexes: number[] = []

		for (let index = 0; index < items.length; index += 1) {
			const item = items[index]
			const cached = this.stagedByStorageId.get(item.storageId)
			if (cached) {
				resolved[index] = cached
				continue
			}
			const inflight = this.stagingPromises.get(item.storageId)
			if (inflight) {
				resolved[index] = await inflight
				continue
			}
			missing.push(item)
			missingIndexes.push(index)
		}

		if (missing.length > 0) {
			const staged = await this.stageUncachedScreenshots(missing, projectId)
			missingIndexes.forEach((itemIndex, stagedIndex) => {
				resolved[itemIndex] = staged[stagedIndex]
			})
		}

		return resolved as StagedHtmlScreenshot[]
	}

	async stageStoredScreenshot(
		item: UploadStoredScreenshotItem,
		projectId: string,
	): Promise<StagedHtmlScreenshot> {
		const [staged] = await this.stageStoredScreenshots([item], projectId)
		if (!staged) throw new Error("截图上传失败")
		return staged
	}

	async saveStagedScreenshots(
		items: StagedHtmlScreenshot[],
		{ projectId, topicId }: { projectId: string; topicId?: string },
	): Promise<Array<{ storageId: string; result: SaveUploadFileToProjectResponse }>> {
		if (!projectId) throw new Error("当前项目不可用，无法保存截图")
		if (items.length === 0) return []

		const saveResults = (await SuperMagicApi.batchSaveFiles({
			project_id: projectId,
			files: items.map((item) => ({
				project_id: projectId,
				topic_id: topicId ?? "",
				task_id: "",
				file_key: item.fileKey,
				file_name: item.fileName,
				file_size: item.fileSize,
				file_type: "user_upload",
				storage_type: "topic",
				source: UploadSource.Home,
				relative_file_path: item.fileName,
				is_hidden: true,
			})),
		})) as SaveUploadFileToProjectResponse[]
		if (!saveResults?.every((item) => item?.file_id) || saveResults.length !== items.length) {
			throw new Error("截图保存到话题失败")
		}

		return items.map((item, index) => ({
			storageId: item.storageId,
			result: { ...saveResults[index], is_hidden: true },
		}))
	}

	async uploadStoredScreenshots(
		items: UploadStoredScreenshotItem[],
		{ projectId, topicId }: { projectId: string; topicId?: string },
	): Promise<Array<{ storageId: string; result: SaveUploadFileToProjectResponse }>> {
		if (!projectId) throw new Error("当前项目不可用，无法保存截图")

		try {
			const staged = await this.stageStoredScreenshots(items, projectId)
			return await this.saveStagedScreenshots(staged, { projectId, topicId })
		} catch (error) {
			logger.error({
				eventKey: "html_screenshot_upload_failed",
				errorKind: "unknown",
				error,
				message: "html screenshot upload failed",
			})
			throw error instanceof Error ? error : new Error("截图上传失败")
		}
	}

	async uploadStoredScreenshot({
		storageId,
		fileName,
		projectId,
		topicId,
	}: {
		storageId: string
		fileName: string
		projectId: string
		topicId?: string
		onProgress?: (progress: number) => void
	}): Promise<SaveUploadFileToProjectResponse> {
		const [entry] = await this.uploadStoredScreenshots([{ storageId, fileName }], {
			projectId,
			topicId,
		})
		if (!entry) throw new Error("截图上传失败")
		return entry.result
	}

	async getStoredScreenshotBlob(storageId: string): Promise<Blob | null> {
		return htmlScreenshotStorage.getBlob(storageId)
	}

	async discardStoredScreenshot(storageId: string): Promise<void> {
		this.forgetStaged(storageId)
		try {
			await htmlScreenshotStorage.delete(storageId)
		} finally {
			forgetHtmlScreenshotByStorageId(storageId)
		}
	}

	collectStorageIds(mentionItems: Array<{ attrs?: { data?: unknown } }>): string[] {
		const storageIds: string[] = []
		for (const item of mentionItems) {
			const data = item.attrs?.data
			if (!data || typeof data !== "object") continue
			const screenshot = data as { is_html_screenshot?: boolean; storage_id?: unknown }
			if (
				screenshot.is_html_screenshot &&
				typeof screenshot.storage_id === "string" &&
				screenshot.storage_id
			) {
				storageIds.push(screenshot.storage_id)
			}
		}
		return storageIds
	}

	async releaseStoredScreenshots(storageIds: string[]): Promise<void> {
		await Promise.all(storageIds.map((storageId) => this.discardStoredScreenshot(storageId)))
	}

	resetStaging(): void {
		this.stagedByStorageId.clear()
		this.stagingPromises.clear()
	}

	private forgetStaged(storageId: string): void {
		this.stagedByStorageId.delete(storageId)
		this.stagingPromises.delete(storageId)
	}

	private async stageUncachedScreenshots(
		items: UploadStoredScreenshotItem[],
		projectId: string,
	): Promise<StagedHtmlScreenshot[]> {
		const batchPromise = this.stageBatch(items, projectId)
		const itemPromises = items.map((item) => {
			const itemPromise = batchPromise.then((staged) => {
				const match = staged.find((entry) => entry.storageId === item.storageId)
				if (!match) throw new Error("截图上传失败")
				return match
			})
			this.stagingPromises.set(item.storageId, itemPromise)
			return itemPromise
		})

		try {
			const staged = await Promise.all(itemPromises)
			for (const item of staged) {
				this.stagedByStorageId.set(item.storageId, item)
			}
			return staged
		} finally {
			for (const item of items) {
				this.stagingPromises.delete(item.storageId)
			}
		}
	}

	private async stageBatch(
		items: UploadStoredScreenshotItem[],
		projectId: string,
	): Promise<StagedHtmlScreenshot[]> {
		const files = await Promise.all(
			items.map(async (item) => {
				const blob = await htmlScreenshotStorage.getBlob(item.storageId)
				if (!blob) throw new Error("截图缓存已过期，请重新选择")
				return {
					...item,
					file: new File([blob], item.fileName, {
						type: blob.type || "image/png",
					}),
				}
			}),
		)

		const customCredentials = await superMagicUploadTokenService.getUploadToken(projectId)
		const { ids } = await SuperMagicApi.getSnowflakeIds({ count: files.length })
		if (!ids?.length || ids.length < files.length) {
			throw new Error("截图上传未获取到文件ID")
		}

		const uploadResults = await Promise.all(
			files.map((fileItem, index) =>
				this.uploadToOss(fileItem.file, ids[index], projectId, customCredentials).then(
					(upload) => ({
						storageId: fileItem.storageId,
						fileName: fileItem.fileName,
						fileSize: upload.size,
						fileKey: upload.key,
					}),
				),
			),
		)

		const reportResults = await FileApi.reportFileUploads(
			uploadResults.map((item) => ({
				file_extension: item.fileName.split(".").pop() ?? "",
				file_key: item.fileKey,
				file_size: item.fileSize,
				file_name: item.fileName,
			})),
		)
		if (!reportResults?.every((item) => item?.file_id)) {
			throw new Error("截图上报失败")
		}

		return uploadResults
	}
}

export const htmlScreenshotUploadService = new HtmlScreenshotUploadService()
