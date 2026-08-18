import type { HttpClient } from "@/apis/core/HttpClient"
import { genRequestUrl } from "@/utils/http"

export const FUNCTION_PERMISSION_CODE = {
	SkillCreate: "skill.create",
	SkillPublish: "skill.publish_team",
	/** Platform Skill market management (official Skill import). */
	SkillMarketManage: "platform.skill.market.edit",
	AgentCreate: "agent.create",
	AgentPublish: "agent.publish_team",
	MagicClawAccess: "magic_claw.access",
	MagicClawCreate: "magic_claw.create",
} as const

/** Platform-level permission group used by super administrators. */
export const PLATFORM_SUPER_ADMIN_PERMISSION_KEY = "MAGIC_PLATFORM_PERMISSIONS"

export type FunctionPermissionCode =
	(typeof FUNCTION_PERMISSION_CODE)[keyof typeof FUNCTION_PERMISSION_CODE]

export type FunctionPermissionMap = Partial<Record<FunctionPermissionCode, boolean>>

export interface PermissionGroupsResponse {
	permission_key: string[]
}

export const generateFunctionPermissionApi = (fetch: HttpClient) => ({
	getMe() {
		return fetch.get<FunctionPermissionMap>(genRequestUrl("/api/v1/function-permissions/me"))
	},
	getPermissionGroups() {
		return fetch.get<PermissionGroupsResponse>(genRequestUrl("/api/v1/permissions/me"))
	},
})
