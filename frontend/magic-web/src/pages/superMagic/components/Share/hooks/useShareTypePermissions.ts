import { useMemo } from "react"
import {
	FUNCTION_PERMISSION_CODE,
	type FunctionPermissionCode,
	type FunctionPermissionMap,
} from "@/apis"
import { useFunctionPermissions } from "@/hooks/useFunctionPermission"
import { ShareType, type SharePermissionResource } from "../types"

const SHARE_TYPE_ORDER = [
	ShareType.PasswordProtected,
	ShareType.Public,
	ShareType.Organization,
] as const

const SHARE_TYPE_PERMISSION_CODES: Record<
	SharePermissionResource,
	Record<(typeof SHARE_TYPE_ORDER)[number], FunctionPermissionCode>
> = {
	microApp: {
		[ShareType.PasswordProtected]: FUNCTION_PERMISSION_CODE.MicroAppSharePassword,
		[ShareType.Public]: FUNCTION_PERMISSION_CODE.MicroAppSharePublic,
		[ShareType.Organization]: FUNCTION_PERMISSION_CODE.MicroAppShareTeam,
	},
	project: {
		[ShareType.PasswordProtected]: FUNCTION_PERMISSION_CODE.ProjectSharePassword,
		[ShareType.Public]: FUNCTION_PERMISSION_CODE.ProjectSharePublic,
		[ShareType.Organization]: FUNCTION_PERMISSION_CODE.ProjectShareTeam,
	},
}

/** Converts the permission map returned by `/function-permissions/me` into share_type values. */
export function getPermittedShareTypes(
	permissions: FunctionPermissionMap | undefined,
	resource: SharePermissionResource,
): ShareType[] {
	const permissionCodes = SHARE_TYPE_PERMISSION_CODES[resource]
	return SHARE_TYPE_ORDER.filter(
		(shareType) => permissions?.[permissionCodes[shareType]] === true,
	)
}

/** Shares one cached permission request across every share dialog on the page. */
export function useShareTypePermissions(resource: SharePermissionResource) {
	const { data, error, isLoading, mutate } = useFunctionPermissions()
	const permittedShareTypes = useMemo(
		() => getPermittedShareTypes(data, resource),
		[data, resource],
	)

	return {
		error,
		isLoading,
		mutate,
		permittedShareTypes,
	}
}
