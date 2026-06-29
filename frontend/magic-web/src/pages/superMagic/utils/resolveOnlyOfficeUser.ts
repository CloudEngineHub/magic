import type { User } from "@/components/onlyoffice-web-comp"
import { userStore } from "@/models/user"

/** 从登录态解析 OnlyOffice editorConfig.user / 协作用户信息 */
export function resolveOnlyOfficeUser(): User {
	const userInfo = userStore.user.userInfo
	const id = userInfo?.user_id || userInfo?.magic_id || "uid"
	const name =
		userInfo?.nickname?.trim() ||
		userInfo?.real_name?.trim() ||
		"Me"

	return { id, name }
}
