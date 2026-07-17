import type { HttpClient } from "../core/HttpClient"
import { RequestUrl } from "../constant"
import { genRequestUrl } from "../utils"

export interface ReportFileUploadsData {
	file_extension?: string
	file_key: string
	file_size: number
	file_name: string
}

export interface ReportFileUploadsResponse {
	file_id: string
	user_id: string
	magic_message_id: string
	organization_code: string
	file_extension: string
	file_key: string
	file_name: string
	file_size: number
	created_at: string
	updated_at: string
}

export const generateFileApi = (fetch: HttpClient) => ({
	/**
	 * 检查文件上传状态
	 */
	checkFileUploadStatus(params: any) {
		return fetch.post(genRequestUrl(RequestUrl.checkFileUploadStatus), params)
	},

	/**
	 * 上报文件上传
	 */
	reportFileUploads(data: ReportFileUploadsData[]) {
		return fetch.post<ReportFileUploadsResponse[]>(
			genRequestUrl(RequestUrl.reportFileUpload),
			data,
		)
	},

	/**
	 * 文件链接下载
	 */
	getFileUrl(file_key: string) {
		return fetch.post<{
			path: string
			url: string
			expires: number
			download_name: string
		}>(genRequestUrl(RequestUrl.getFileDownloadLink), { file_key })
	},

	/**
	 * 获取上传token
	 * @returns
	 */
	fetchUploadToken() {
		return fetch.get<{
			temporary_credential: {
				dir: string
			}
		}>(RequestUrl.getUploadToken, {
			method: "get",
			headers: {
				"Content-Type": "application/json",
				"request-id": Date.now().toString(),
			},
		})
	},

	/**
	 * 获取上传临时凭证（与 @dtyq/upload-sdk 的凭证请求一致）
	 * 返回的 `temporary_credential.dir` 可在前端按业务目录前缀改写后再交给 SDK，
	 * SDK 在 customCredentials 模式下会跳过自身凭证请求直接使用调用方提供的凭证。
	 * 注意：仅当下游对象存储后端不强校验 dir 进签名 policy 时（如 MinIO 预签名），
	 * 客户端改写 dir 才能成功上传；否则需后端代签。
	 */
	getTemporaryCredential(params: {
		storage: "private" | "public"
		content_type?: string
		sts?: boolean
	}) {
		return fetch.post<{
			platform: string
			expires?: number
			temporary_credential: {
				dir: string
				[key: string]: unknown
			}
			[key: string]: unknown
		}>(RequestUrl.getUploadCredentials, {
			storage: params.storage,
			sts: params.sts ?? false,
			...(params.content_type ? { content_type: params.content_type } : {}),
		})
	},
})
