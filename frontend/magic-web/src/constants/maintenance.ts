import type { GlobalConfig } from "@/apis/types"

export const MaintenanceType = {
	GlobalNotice: "global_notice",
	SiteClose: "site_close",
} as const

export type MaintenanceType = (typeof MaintenanceType)[keyof typeof MaintenanceType]

export const DEFAULT_MAINTENANCE_CONFIG: GlobalConfig = {
	is_maintenance: false,
	maintenance_type: MaintenanceType.GlobalNotice,
	maintenance_description: "",
	need_initial: false,
}

export function shouldShowGlobalMaintenanceNotice(
	config?: Pick<GlobalConfig, "is_maintenance" | "maintenance_type">,
) {
	return !!config?.is_maintenance && config.maintenance_type === MaintenanceType.GlobalNotice
}

export function shouldForceSiteClose(
	config?: Pick<GlobalConfig, "is_maintenance" | "maintenance_type">,
) {
	return !!config?.is_maintenance && config.maintenance_type === MaintenanceType.SiteClose
}
