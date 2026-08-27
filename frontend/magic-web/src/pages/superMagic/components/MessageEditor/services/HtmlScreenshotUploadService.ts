import { Upload, type UploadConfig } from "@dtyq/upload-sdk"
import { RequestMethod } from "@/apis/constant"
import { FileApi, SuperMagicApi } from "@/apis"
import { userStore } from "@/models/user"
import { logger as Logger } from "@/utils/log"
import { UploadSource } from "../types"
import { base64ToFile } from "../utils/fileConverter"
import { superMagicUploadTokenService } from "./UploadTokenService"
import type { SaveUploadFileToProjectResponse } from "@/pages/superMagic/utils/api"

const TEMP_UPLOAD_DIR_NAME = ".tmp"

export interface UploadHtmlScreenshotParams {
	dataUrl: string
	fileName: string
	projectId: string
	topicId?: string
	onProgress?: (progress: number) => void
}

const logger = Logger.createLogger("HtmlScreenshotUpload")

/**
 * Uploads inspector screenshots without entering the message editor attachment store.
 * Screenshots are implementation details of an HTML edit request, so they are saved
 * directly into the hidden workspace temp directory and only exposed as a project-file mention.
 */
class HtmlScreenshotUploadService {
	private readonly uploader = new Upload()
	private readonly tempDirectoryIds = new Map<string, string>()
	private readonly tempDirectoryPromises = new Map<string, Promise<string>>()

	private async ensureTempDirectory(projectId: string) {
		const cachedDirectoryId = this.tempDirectoryIds.get(projectId)
		if (cachedDirectoryId) return cachedDirectoryId

		const pendingDirectory = this.tempDirectoryPromises.get(projectId)
		if (pendingDirectory) return pendingDirectory

		const createDirectory = (async () => {
			const response = await SuperMagicApi.createFile({
				project_id: projectId,
				file_name: TEMP_UPLOAD_DIR_NAME,
				is_directory: true,
				ignore_duplicate: true,
			})
			if (!response?.file_id) {
				throw new Error("无法创建截图临时目录")
			}
			this.tempDirectoryIds.set(projectId, response.file_id)
			return response.file_id
		})()

		this.tempDirectoryPromises.set(projectId, createDirectory)
		try {
			return await createDirectory
		} finally {
			this.tempDirectoryPromises.delete(projectId)
		}
	}

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

	async uploadScreenshot({
		dataUrl,
		fileName,
		projectId,
		topicId,
		onProgress,
	}: UploadHtmlScreenshotParams): Promise<SaveUploadFileToProjectResponse> {
		if (!projectId) throw new Error("当前项目不可用，无法上传截图")

		try {
			const [parentId, file] = await Promise.all([
				this.ensureTempDirectory(projectId),
				base64ToFile(dataUrl, fileName),
			])
			const customCredentials = await superMagicUploadTokenService.getUploadToken(projectId)
			const tempCredentials = superMagicUploadTokenService.changeDir(
				customCredentials,
				TEMP_UPLOAD_DIR_NAME,
			)
			const uploadResult = await this.uploadToOss(
				file,
				fileName,
				projectId,
				tempCredentials,
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
				parent_id: parentId,
				files: [
					{
						project_id: projectId,
						topic_id: topicId ?? "",
						task_id: "",
						file_key: uploadResult.key,
						file_name: fileName,
						file_size: uploadResult.size,
						file_type: "user_upload",
						storage_type: "workspace",
						source: UploadSource.Home,
						relative_file_path: `${TEMP_UPLOAD_DIR_NAME}/${fileName}`,
						is_hidden: true,
					},
				],
			})) as SaveUploadFileToProjectResponse[]
			if (!saveResult?.file_id) throw new Error("截图保存到工作区失败")

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
}

export const htmlScreenshotUploadService = new HtmlScreenshotUploadService()
