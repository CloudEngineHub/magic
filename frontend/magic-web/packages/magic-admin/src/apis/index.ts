import { useMemo } from "react"
import { useAdmin } from "@admin/provider/AdminProvider"
import { generateCommonApi } from "./modules/common"
import { generateAIManageApi } from "./modules/aiManage"
import { generateSecurityApi } from "./modules/security"
import { generatePlatformPackageApi } from "./modules/platformPackage"
import { generatePlatformInfoApi } from "./modules/platformInfo"
import { generateFileApi } from "./modules/file"
import { generateAppMenuApi } from "./modules/appMenu"
import { generateSlidesTemplateApi } from "./modules/slidesTemplate"

export function useApis() {
	const { apiClients } = useAdmin()
	const magicClient = apiClients?.magicClient

	const apis = useMemo(() => {
		if (!magicClient) return null

		return {
			/** 通用 - API */
			CommonApi: generateCommonApi(magicClient),
			/** AI管理 - API */
			AIManageApi: generateAIManageApi(magicClient),
			/** 安全控制 - API */
			SecurityApi: generateSecurityApi(magicClient),
			/** 平台套餐 - API */
			PlatformPackageApi: generatePlatformPackageApi(magicClient),
			/** 平台信息 - API */
			PlatformInfoApi: generatePlatformInfoApi(magicClient),

			/** 文件 - API */
			FileApi: generateFileApi(magicClient),
			/** 应用菜单 - API */
			AppMenuApi: generateAppMenuApi(magicClient),
			/** PPT模板 - API */
			SlidesTemplateApi: generateSlidesTemplateApi(magicClient),
		}
	}, [magicClient])

	if (!apis) {
		throw new Error("apiClients is not defined")
	}

	return apis
}
