export function shouldForceMobileCrewConversation(search: string): boolean {
	const searchParams = new URLSearchParams(search)
	const view = searchParams.get("view")?.toLowerCase()
	const layout = searchParams.get("layout")?.toLowerCase()
	const mobile = searchParams.get("mobile")?.toLowerCase()

	return view === "mobile" || layout === "mobile" || mobile === "1" || mobile === "true"
}

const MAGIC_ORGANIZATION_QUERY_KEYS = [
	"organizationCode",
	"organization_code",
	"orgCode",
	"org_code",
	"magicOrganizationCode",
	"magic_organization_code",
] as const

function getFirstSearchParam(searchParams: URLSearchParams, keys: readonly string[]) {
	for (const key of keys) {
		const value = searchParams.get(key)?.trim()
		if (value) return value
	}
	return null
}

export function getCrewConversationRouteOrganizationCode(search: string): string | null {
	const searchParams = new URLSearchParams(search)
	return getFirstSearchParam(searchParams, MAGIC_ORGANIZATION_QUERY_KEYS)
}
