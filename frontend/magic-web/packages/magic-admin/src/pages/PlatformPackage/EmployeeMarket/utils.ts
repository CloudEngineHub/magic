import type { PlatformPackage } from "@admin/types/platformPackage"
import { AgentMarketCategoryStatusMap } from "@admin/types/platformPackage/market"

export interface AgentMarketCategoryFormValues {
	name_i18n: PlatformPackage.NameI18N
	status?: boolean
	sort_order?: number | null
}

export function resolveAgentMarketCategoryName(
	record?: PlatformPackage.AgentMarketCategoryItem | null,
) {
	if (!record) return "-"
	return record.name_i18n?.zh_CN || record.name_i18n?.en_US || record.name_i18n?.default || "-"
}

export function buildAgentMarketCategorySaveParams(
	values: AgentMarketCategoryFormValues,
): PlatformPackage.SaveAgentMarketCategoryParams {
	return {
		name_i18n: values.name_i18n,
		status: values.status
			? AgentMarketCategoryStatusMap.visible
			: AgentMarketCategoryStatusMap.hidden,
		sort_order: values.sort_order ?? 0,
	}
}

export function getAgentMarketCategoryStatusByChecked(checked: boolean) {
	return checked ? AgentMarketCategoryStatusMap.visible : AgentMarketCategoryStatusMap.hidden
}
