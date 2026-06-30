/**
 * Iframe API 专用接口层
 *
 * 使用 iframeClient（不携带全局 401 跳转、组织校验等拦截器），
 * 确保 iframe 场景下的请求错误被抛出而非导致主站跳转登录页。
 */

import iframeClient from "@/apis/clients/iframeClient"
import type { SaveFileContentResponse } from "@/apis/modules/superMagic"
import { userStore } from "@/models/user"
import { WorkspaceStateCache } from "@/pages/superMagic/utils/superMagicCache"
import { getSuperIdState } from "@/pages/superMagic/utils/query"

// ─── 文件下载 URL ────────────────────────────────────────────────────────────

export interface IframeDownloadUrlItem {
	file_id: string
	url: string
	expires_at?: string
}

/**
 * 获取文件临时下载 URL（iframe 专用）。
 * 仅保留 iframe FS 场景必要的参数，不处理水印/高清/magic-share 等逻辑。
 */
export async function getIframeDownloadUrl(fileIds: string[]): Promise<IframeDownloadUrlItem[]> {
	const workspaceState = WorkspaceStateCache.get(userStore.user.userInfo)
	const superIdState = getSuperIdState()

	return iframeClient.post<IframeDownloadUrlItem[]>("/api/v1/super-agent/tasks/get-file-url", {
		file_ids: fileIds,
		// @ts-ignore
		token: window.temporary_token || "",
		// @ts-ignore
		topic_id: window?.topic_id || workspaceState?.topicId || superIdState?.topicId || "",
		// @ts-ignore
		project_id: window.project_id || workspaceState?.projectId || superIdState?.projectId || "",
	})
}

// ─── 文件内容保存 ────────────────────────────────────────────────────────────

/**
 * 保存文件内容（iframe 专用）。
 */
export async function saveIframeFileContent(
	data: Array<{ file_id: string; content: string }>,
): Promise<SaveFileContentResponse> {
	return iframeClient.post<SaveFileContentResponse>("/api/v1/super-agent/file/save", data)
}

// ─── 创建文件/目录 ───────────────────────────────────────────────────────────

/**
 * 创建文件或目录（iframe 专用）。
 */
export async function createIframeFile(data: {
	project_id: string
	parent_id?: string | number
	file_name: string
	is_directory: boolean
	ignore_duplicate?: boolean
}): Promise<{ file_id?: string }> {
	return iframeClient.post("/api/v1/super-agent/file", data)
}

// ─── MagicBase 数据库操作 ────────────────────────────────────────────────────

/**
 * 获取项目下所有表。
 */
export async function getMagicBaseTables(projectId: string): Promise<unknown[]> {
	return iframeClient.get(`/api/v1/magicbase/projects/${projectId}/tables`)
}

/**
 * 获取单张表详情（含字段定义）。
 */
export async function getMagicBaseTable(projectId: string, tableId: string): Promise<unknown> {
	return iframeClient.get(`/api/v1/magicbase/projects/${projectId}/tables/${tableId}`)
}

/**
 * 新增一行数据。
 */
export async function createMagicBaseRow(
	projectId: string,
	tableId: string,
	data: Record<string, unknown>,
	select?: string[],
): Promise<unknown> {
	return iframeClient.post(`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/rows`, {
		data,
		...(select ? { select: select.join(",") } : {}),
	})
}

/**
 * 分页查询行。
 */
export async function queryMagicBaseRows(
	projectId: string,
	tableId: string,
	query: Record<string, unknown>,
): Promise<unknown> {
	const requestBody = {
		...query,
		...(Array.isArray(query.select) ? { select: query.select.join(",") } : {}),
	}

	return iframeClient.post(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/query`,
		requestBody,
	)
}

/**
 * 获取单行详情。
 */
export async function getMagicBaseRow(
	projectId: string,
	tableId: string,
	recordId: string,
	select?: string[],
): Promise<unknown> {
	const params = select ? `?select=${select.join(",")}` : ""
	return iframeClient.get(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/rows/${recordId}${params}`,
	)
}

/**
 * 更新一行数据。
 */
export async function updateMagicBaseRow(
	projectId: string,
	tableId: string,
	recordId: string,
	data: Record<string, unknown>,
	select?: string[],
): Promise<unknown> {
	return iframeClient.patch(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/rows/${recordId}`,
		{
			data,
			...(select ? { select: select.join(",") } : {}),
		},
	)
}

/**
 * 删除一行数据。
 */
export async function deleteMagicBaseRow(
	projectId: string,
	tableId: string,
	recordId: string,
): Promise<void> {
	return iframeClient.delete(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/rows/${recordId}`,
	)
}

/**
 * 获取项目关系列表。
 */
export async function getMagicBaseRelations(projectId: string): Promise<unknown[]> {
	return iframeClient.get(`/api/v1/magicbase/projects/${projectId}/relations`)
}

export interface IframeFileInfo {
	file_id?: string
	file_name?: string
	relative_file_path?: string
}

/**
 * 获取文件真实信息（iframe 专用）。
 * 用于破坏性操作前按 file_id 反查服务端路径，避免只信前端 fileList。
 */
export async function getIframeFileInfo(
	file_id: string,
	project_id: string,
): Promise<IframeFileInfo> {
	const query = project_id ? `?project_id=${encodeURIComponent(project_id)}` : ""
	return iframeClient.get<IframeFileInfo>(`/api/v1/super-agent/file/${file_id}${query}`)
}

// ─── 删除文件/目录 ───────────────────────────────────────────────────────────

/**
 * 删除单个文件（iframe 专用）。
 */
export async function deleteIframeFile(file_id: string, project_id: string): Promise<unknown> {
	return iframeClient.delete(`/api/v1/super-agent/file/${file_id}`, { data: { project_id } })
}

/**
 * 批量删除文件（iframe 专用）。
 * 用于删除目录时一次性删除目录下所有文件及目录本身。
 */
export async function deleteIframeFiles(file_ids: string[], project_id: string): Promise<unknown> {
	return iframeClient.post("/api/v1/super-agent/file/batch-delete", { file_ids, project_id })
}

// ─── 移动/重命名文件 ─────────────────────────────────────────────────────────

/**
 * 移动单个文件或目录到目标父目录（iframe 专用）。
 */
export async function moveIframeFile(params: {
	file_id: string
	target_parent_id: string
	project_id: string
}): Promise<unknown> {
	const { file_id, ...data } = params
	return iframeClient.post(`/api/v1/super-agent/file/${file_id}/move`, data)
}

/**
 * 重命名文件或目录（iframe 专用）。
 */
export async function renameIframeFile(params: {
	file_id: string
	target_name: string
}): Promise<unknown> {
	const { file_id, target_name } = params
	return iframeClient.post(`/api/v1/super-agent/file/${file_id}/rename`, { target_name })
}
