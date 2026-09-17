import { PERMISSION_KEY_MAP } from "@magic-admin-v2/constants/permissions"
import type { ProviderModelPermissionScope } from "@magic-admin-v2/features/platform-model-list/utils/data-source"
import {
	providerModelCategory,
	providerModelType,
	type ProviderModelCategory,
	type ProviderModelGroup,
} from "@magic-admin-v2/features/platform-model-list/types"
import { hasMagicRights } from "@magic-admin-v2/permissions/rights"
import type { AccessContext } from "@magic-admin-v2/runtime/types"

export type ProviderModelCategoryAccess = {
	canEdit: boolean
	canView: boolean
}

export type ProviderModelCategoryAccessMap = Record<
	ProviderModelCategory,
	ProviderModelCategoryAccess
>

export const providerModelCategoryOrder = [
	providerModelCategory.llm,
	providerModelCategory.vlm,
	providerModelCategory.vgm,
	providerModelCategory.embedding,
] as const satisfies readonly ProviderModelCategory[]

const providerModelPermissions = {
	platform: {
		query: PERMISSION_KEY_MAP.PLATFORM_MODEL_MANAGEMENT_QUERY,
		edit: PERMISSION_KEY_MAP.PLATFORM_MODEL_MANAGEMENT_EDIT,
	},
	workspace: {
		query: PERMISSION_KEY_MAP.MODEL_MANAGEMENT_QUERY,
		edit: PERMISSION_KEY_MAP.MODEL_MANAGEMENT_EDIT,
	},
} as const satisfies Record<ProviderModelPermissionScope, { edit: string; query: string }>

export function getProviderModelCategoryAccess(
	access: AccessContext | null | undefined,
	scope: ProviderModelPermissionScope,
): ProviderModelCategoryAccessMap {
	const permissions = providerModelPermissions[scope]
	const canEdit = access ? hasMagicRights(access, [permissions.edit]) : false
	const canView = canEdit || (access ? hasMagicRights(access, [permissions.query]) : false)

	return Object.fromEntries(
		providerModelCategoryOrder.map((category) => [category, { canEdit, canView }]),
	) as ProviderModelCategoryAccessMap
}

export function getAccessibleProviderModelCategories(
	categoryAccess: ProviderModelCategoryAccessMap,
): ProviderModelCategory[] {
	return providerModelCategoryOrder.filter((category) => categoryAccess[category].canView)
}

export function getEditableProviderModelCategories(
	categoryAccess: ProviderModelCategoryAccessMap,
): ProviderModelCategory[] {
	return providerModelCategoryOrder.filter((category) => categoryAccess[category].canEdit)
}

export function getProviderModelAccessCategory(
	model: Pick<ProviderModelGroup, "category" | "model_type">,
): ProviderModelCategory {
	return model.model_type === providerModelType.embedding
		? providerModelCategory.embedding
		: model.category
}

export function toProviderModelApiCategories(
	categories: readonly ProviderModelCategory[],
): ProviderModelCategory[] {
	return Array.from(
		new Set(
			categories.map((category) =>
				category === providerModelCategory.embedding ? providerModelCategory.llm : category,
			),
		),
	)
}
