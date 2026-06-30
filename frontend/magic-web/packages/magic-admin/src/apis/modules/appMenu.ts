import type { WithPage } from "@admin/types/common"
import type { AppMenu } from "@admin/types/appMenu"
import { RequestUrl } from "../constant"
import type { HttpClient } from "../core/HttpClient"

export const generateAppMenuApi = (client: HttpClient) => {
	return {
		/** 分页查询应用菜单列表 */
		getAppMenuList(params: AppMenu.GetListParams) {
			return client.post<WithPage<AppMenu.MenuItem>>(RequestUrl.getAppMenuList, params)
		},

		/** 获取应用菜单详情 */
		getAppMenuDetail(id: string) {
			return client.get<AppMenu.MenuItem>(RequestUrl.getAppMenuDetail.replace("${id}", id))
		},

		/** 保存应用菜单（有 id 则编辑，无 id 则新增） */
		saveAppMenu(data: AppMenu.SaveParams) {
			return client.post<AppMenu.MenuItem>(RequestUrl.saveAppMenu, data)
		},

		/** 删除应用菜单 */
		deleteAppMenu(id: string) {
			return client.post<boolean>(RequestUrl.deleteAppMenu, { id })
		},

		/** 设置应用菜单状态（启用/禁用） */
		updateAppMenuStatus(id: string, status: AppMenu.Status) {
			return client.post<AppMenu.MenuItem>(RequestUrl.updateAppMenuStatus, { id, status })
		},

		/** 非官方组织后台 - 分页查询应用菜单列表 */
		getOrganizationAppMenuList(params: AppMenu.GetListParams) {
			return client.post<WithPage<AppMenu.MenuItem>>(
				RequestUrl.getOrganizationAppMenuList,
				params,
			)
		},

		/** 非官方组织后台 - 获取应用菜单详情 */
		getOrganizationAppMenuDetail(id: string) {
			return client.get<AppMenu.MenuItem>(
				RequestUrl.getOrganizationAppMenuDetail.replace("${id}", id),
			)
		},

		/** 非官方组织后台 - 保存应用菜单 */
		saveOrganizationAppMenu(data: AppMenu.SaveParams) {
			return client.post<AppMenu.MenuItem>(RequestUrl.saveOrganizationAppMenu, data)
		},

		/** 非官方组织后台 - 删除应用菜单 */
		deleteOrganizationAppMenu(id: string) {
			return client.post<boolean>(RequestUrl.deleteOrganizationAppMenu, { id })
		},

		/** 非官方组织后台 - 设置应用菜单状态 */
		updateOrganizationAppMenuStatus(id: string, status: AppMenu.Status) {
			return client.post<AppMenu.MenuItem>(RequestUrl.updateOrganizationAppMenuStatus, {
				id,
				status,
			})
		},
	}
}
