import { isTestEnv } from "@/utils/env"

const DESIGN_PLUGIN_ORGANIZATION_CODES = new Set(["EAVT467", "41036eed2c3ada9fb8460883fcebba81"])

export function canUseDesignPlugins(organizationCode?: string | null) {
	if (isTestEnv()) return true

	const normalizedOrganizationCode = organizationCode?.trim()
	if (!normalizedOrganizationCode) return false

	return DESIGN_PLUGIN_ORGANIZATION_CODES.has(normalizedOrganizationCode)
}
