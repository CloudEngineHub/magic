import type { PlatformPackage } from "@admin/types/platformPackage"
import { SkillMarketCategoryStatusMap } from "@admin/types/platformPackage/market"

export interface SkillCategoryFormValues {
	parent_id?: string | number | null
	name_i18n: PlatformPackage.NameI18N
	status?: boolean
	sort_order?: number | null
}

export function resolveSkillCategoryName(record?: PlatformPackage.SkillMarketCategoryItem | null) {
	if (!record) return "-"
	return (
		record.name_i18n?.zh_CN ||
		record.name_i18n?.en_US ||
		record.name_i18n?.default ||
		record.name ||
		"-"
	)
}

export function buildSkillCategorySaveParams(
	values: SkillCategoryFormValues,
): PlatformPackage.SaveSkillMarketCategoryParams {
	return {
		parent_id: values.parent_id ?? "0",
		name_i18n: values.name_i18n,
		sort_order: values.sort_order ?? 0,
		status: values.status
			? SkillMarketCategoryStatusMap.visible
			: SkillMarketCategoryStatusMap.hidden,
	}
}

export function getSkillCategoryStatusByChecked(checked: boolean) {
	return checked ? SkillMarketCategoryStatusMap.visible : SkillMarketCategoryStatusMap.hidden
}

export function flattenSkillCategoryTree(
	categories: PlatformPackage.SkillMarketCategoryItem[],
): PlatformPackage.SkillMarketCategoryItem[] {
	return categories.flatMap((category) => [
		category,
		...flattenSkillCategoryTree(category.children ?? []),
	])
}
