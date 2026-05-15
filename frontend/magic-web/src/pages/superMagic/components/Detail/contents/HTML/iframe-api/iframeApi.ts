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
		...data,
		...(select ? { _select: select } : {}),
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
	return iframeClient.post(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/query`,
		query,
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
			...data,
			...(select ? { _select: select } : {}),
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
