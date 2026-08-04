import { SuperMagicApi } from "@/apis"
import type { RequestConfig } from "@/apis/core/HttpClient"
import { interfaceStore } from "@/stores/interface"

const ORGANIZATION_SWITCH_SUPPRESSION_KEY = "super-magic:project-organization-access-suppression"
const ORGANIZATION_SWITCH_SUPPRESSION_DURATION = 30_000

interface OrganizationSwitchSuppression {
	pathname: string
	expiresAt: number
}

interface ResolveRequiredProjectOrganizationCodeParams {
	projectId?: string
	currentOrganizationCode?: string | null
	requestOptions?: Omit<RequestConfig, "url">
}

/**
 * Keeps the accessibility guard out of a normal organization-switch transition. The short-lived,
 * path-scoped marker survives the account-context reload without affecting later project visits.
 */
export function suppressProjectOrganizationAccessCheckForCurrentRoute() {
	try {
		const suppression: OrganizationSwitchSuppression = {
			pathname: window.location.pathname,
			expiresAt: Date.now() + ORGANIZATION_SWITCH_SUPPRESSION_DURATION,
		}
		sessionStorage.setItem(ORGANIZATION_SWITCH_SUPPRESSION_KEY, JSON.stringify(suppression))
	} catch {
		// Storage may be unavailable in restricted browser contexts; the normal check remains safe.
	}
}

function isProjectOrganizationAccessCheckSuppressed() {
	try {
		const storedValue = sessionStorage.getItem(ORGANIZATION_SWITCH_SUPPRESSION_KEY)
		if (!storedValue) return false

		const suppression = JSON.parse(storedValue) as OrganizationSwitchSuppression
		const matchesCurrentRoute =
			suppression.pathname === window.location.pathname && suppression.expiresAt > Date.now()
		const navigationEntry = performance.getEntriesByType?.("navigation")[0] as
			| PerformanceNavigationTiming
			| undefined
		const isOrganizationSwitchTransition = interfaceStore.isSwitchingOrganization
		const isOrganizationSwitchReload = navigationEntry?.type === "reload"
		const shouldSuppress =
			matchesCurrentRoute && (isOrganizationSwitchTransition || isOrganizationSwitchReload)

		if (!shouldSuppress) sessionStorage.removeItem(ORGANIZATION_SWITCH_SUPPRESSION_KEY)
		return shouldSuppress
	} catch {
		return false
	}
}

/**
 * Resolves the organization that must be active before normal project state initialization runs.
 * Failures return null to preserve the existing permission and missing-project behavior.
 */
export async function resolveRequiredProjectOrganizationCode({
	projectId,
	currentOrganizationCode,
	requestOptions,
}: ResolveRequiredProjectOrganizationCodeParams): Promise<string | null> {
	if (!projectId || isProjectOrganizationAccessCheckSuppressed()) return null

	try {
		const accessibility = await SuperMagicApi.getProjectAccessibility(projectId, requestOptions)
		const requiredOrganizationCode =
			accessibility?.required_magic_organization_code?.trim() || null

		if (!requiredOrganizationCode || requiredOrganizationCode === currentOrganizationCode) {
			return null
		}

		return requiredOrganizationCode
	} catch {
		return null
	}
}
