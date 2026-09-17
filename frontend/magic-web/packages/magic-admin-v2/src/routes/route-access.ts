import { PERMISSION_KEY_MAP } from "@magic-admin-v2/constants/permissions"
import {
	and,
	allowMagic,
	denyPersonalOrganization,
	officialOrganization,
} from "@magic-admin-v2/routes/access"

function allowOfficialMagic(...permissionKeys: string[]) {
	return and(officialOrganization, allowMagic(...permissionKeys))
}

export const platformInfoAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.PLATFORM_INFO_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.PLATFORM_INFO_MANAGEMENT_EDIT,
)

export const platformAppMenuAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.APP_MENU_QUERY,
	PERMISSION_KEY_MAP.APP_MENU_EDIT,
)

// 后端目前没有独立的 AI 水印资源权限，按平台全局信息设置权限保护。
export const platformAiWatermarkAccess = platformInfoAccess

// 自定义服务商白名单复用旧版 PlatformProviderAccess 的平台信息接口。
export const platformCustomProviderLicenseAccess = platformInfoAccess

export const platformMaintenanceAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.INFO_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.INFO_MANAGEMENT_EDIT,
)

export const platformResourceAlertsAccess = allowMagic(
	PERMISSION_KEY_MAP.RESOURCE_ALERT_QUERY,
	PERMISSION_KEY_MAP.RESOURCE_ALERT_EDIT,
)

export const platformPackageAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.PACKAGE_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.PACKAGE_MANAGEMENT_EDIT,
)

export const platformOrderAccess = allowOfficialMagic(PERMISSION_KEY_MAP.ORDER_MANAGEMENT_QUERY)

export const platformInvoiceAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.INVOICE_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.INVOICE_MANAGEMENT_EDIT,
)

export const platformModelAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.PLATFORM_MODEL_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.PLATFORM_MODEL_MANAGEMENT_EDIT,
)

export const platformSystemCapabilitiesAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.AI_ABILITY_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.AI_ABILITY_MANAGEMENT_EDIT,
)

/** PPT 模板仅允许官方组织访问，查询/编辑任一权限即可进入。 */
export const platformSlidesTemplateAccess = and(
	officialOrganization,
	denyPersonalOrganization,
	allowMagic(PERMISSION_KEY_MAP.SLIDES_TEMPLATE_QUERY, PERMISSION_KEY_MAP.SLIDES_TEMPLATE_EDIT),
)

export const platformOfficialStaffAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.MODE_MANAGEMENT_QUERY,
	PERMISSION_KEY_MAP.MODE_MANAGEMENT_EDIT,
)

export const platformMarketplaceAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_MARKET_QUERY,
	PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_MARKET_EDIT,
	PERMISSION_KEY_MAP.PLATFORM_SKILL_MARKET_QUERY,
	PERMISSION_KEY_MAP.PLATFORM_SKILL_MARKET_EDIT,
)

export const platformPublishReviewAccess = allowOfficialMagic(
	PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_REVIEW_QUERY,
	PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_REVIEW_EDIT,
	PERMISSION_KEY_MAP.PLATFORM_SKILL_REVIEW_QUERY,
	PERMISSION_KEY_MAP.PLATFORM_SKILL_REVIEW_EDIT,
)

export const internalPublishReviewAccess = and(
	denyPersonalOrganization,
	allowMagic(
		PERMISSION_KEY_MAP.AGENT_REVIEW_QUERY,
		PERMISSION_KEY_MAP.AGENT_REVIEW_EDIT,
		PERMISSION_KEY_MAP.SKILL_REVIEW_QUERY,
		PERMISSION_KEY_MAP.SKILL_REVIEW_EDIT,
	),
)
