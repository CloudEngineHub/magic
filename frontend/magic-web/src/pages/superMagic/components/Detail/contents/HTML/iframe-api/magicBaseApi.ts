/**
 * Iframe MagicBase 专用接口层。
 *
 * 这些请求通过 iframeClient 发起，避免 iframe 场景的错误触发主站全局跳转。
 */

import iframeClient from "@/apis/clients/iframeClient"

function withMagicBaseShareToken() {
	const token = (window as Window & { temporary_token?: string }).temporary_token || ""
	if (!token) return undefined
	return {
		headers: {
			token,
		},
	}
}

/**
 * 检查当前真实登录用户是否拥有当前项目的管理员权限。
 * 分享 token 由 host 自动携带，但不会被当作管理员身份。
 */
export async function getMagicBaseProjectAdminAccess(projectId: string): Promise<{
	project_id: string
	is_admin: boolean
}> {
	return iframeClient.get(
		`/api/v1/magicbase/projects/${projectId}/admin-access`,
		withMagicBaseShareToken(),
	)
}

/**
 * 获取项目下所有表。
 */
export async function getMagicBaseTables(projectId: string): Promise<unknown[]> {
	return iframeClient.get(
		`/api/v1/magicbase/projects/${projectId}/tables`,
		withMagicBaseShareToken(),
	)
}

/**
 * 获取单张表详情（含字段定义）。
 */
export async function getMagicBaseTable(projectId: string, tableId: string): Promise<unknown> {
	return iframeClient.get(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}`,
		withMagicBaseShareToken(),
	)
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
	return iframeClient.post(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/rows`,
		{
			data,
			...(select ? { select: select.join(",") } : {}),
		},
		withMagicBaseShareToken(),
	)
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
		withMagicBaseShareToken(),
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
	const result = await iframeClient.post<{ list?: unknown[] }>(
		`/api/v1/magicbase/projects/${projectId}/tables/${tableId}/query`,
		{
			filter: { id: { eq: recordId } },
			page: 1,
			page_size: 1,
			...(select?.length ? { select: select.join(",") } : {}),
		},
		withMagicBaseShareToken(),
	)

	const row = result.list?.[0]
	if (row === undefined) {
		throw new Error("MagicBase row not found")
	}

	return row
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
		withMagicBaseShareToken(),
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
		undefined,
		withMagicBaseShareToken(),
	)
}

/**
 * 获取项目关系列表。
 */
export async function getMagicBaseRelations(projectId: string): Promise<unknown[]> {
	return iframeClient.get(
		`/api/v1/magicbase/projects/${projectId}/relations`,
		withMagicBaseShareToken(),
	)
}
