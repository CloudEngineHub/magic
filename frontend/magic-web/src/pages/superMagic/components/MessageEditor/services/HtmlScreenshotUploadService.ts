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

const logger = Logger.createLogger("HtmlScreenshotUpload")

/**
 * Screenshots are transient inspector context, not workspace files. Keep the bitmap in the
 * existing IndexedDB image store until the message is sent, then save it as a topic attachment.
 * This avoids creating a project folder during selection while retaining a server-side file
 * reference for the agent request.
 */
class HtmlScreenshotUploadService {
	private readonly uploader = new Upload()

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

	async uploadStoredScreenshot({
		storageId,
		fileName,
		projectId,
		topicId,
		onProgress,
	}: {
		storageId: string
		fileName: string
		projectId: string
		topicId?: string
		onProgress?: (progress: number) => void
	}): Promise<SaveUploadFileToProjectResponse> {
		if (!projectId) throw new Error("当前项目不可用，无法保存截图")

		try {
			const blob = await htmlScreenshotStorage.getBlob(storageId)
			if (!blob) throw new Error("截图缓存已过期，请重新选择")
			const file = new File([blob], fileName, {
				type: blob.type || "image/png",
			})
			const customCredentials = await superMagicUploadTokenService.getUploadToken(projectId)
			// OSS object name uses a snowflake ID to avoid collisions.
			const { ids } = await SuperMagicApi.getSnowflakeIds({ count: 1 })
			const snowflakeId = ids[0]
			if (!snowflakeId) throw new Error("截图上传未获取到文件ID")
			const uploadResult = await this.uploadToOss(
				file,
				snowflakeId,
				projectId,
				customCredentials,
				onProgress,
			)
			const [reportResult] = await FileApi.reportFileUploads([
				{
					file_extension: fileName.split(".").pop() ?? "",
					file_key: uploadResult.key,
					file_size: uploadResult.size,
					file_name: fileName,
				},
			])
			if (!reportResult?.file_id) throw new Error("截图上报失败")

			const [saveResult] = (await SuperMagicApi.batchSaveFiles({
				project_id: projectId,
				files: [
					{
						project_id: projectId,
						topic_id: topicId ?? "",
						task_id: "",
						file_key: uploadResult.key,
						file_name: fileName,
						file_size: uploadResult.size,
						file_type: "user_upload",
						storage_type: "topic",
						source: UploadSource.Home,
						relative_file_path: fileName,
						is_hidden: true,
					},
				],
			})) as SaveUploadFileToProjectResponse[]
			if (!saveResult?.file_id) throw new Error("截图保存到话题失败")

			try {
				await htmlScreenshotStorage.delete(storageId)
				forgetHtmlScreenshotByStorageId(storageId)
			} catch (cleanupError) {
				logger.error({
					eventKey: "html_screenshot_cleanup_failed",
					errorKind: "storage_cleanup",
					error: cleanupError,
					message: "html screenshot cleanup failed after successful upload",
				})
			}

			return { ...saveResult, is_hidden: true }
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

	async getStoredScreenshotBlob(storageId: string): Promise<Blob | null> {
		return htmlScreenshotStorage.getBlob(storageId)
	}

	async discardStoredScreenshot(storageId: string): Promise<void> {
		try {
			await htmlScreenshotStorage.delete(storageId)
		} finally {
			forgetHtmlScreenshotByStorageId(storageId)
		}
	}
}

export const htmlScreenshotUploadService = new HtmlScreenshotUploadService()
