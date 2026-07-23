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

/** Reads the private widget embed metadata while keeping normal Crew routes unchanged. */
export function getMagicWidgetEmbedContext(search: string): {
	instanceId: string
	protocolVersion: number
	hostOrigin: string
} | null {
	const params = new URLSearchParams(search)
	if (params.get("magicWidgetEmbed") !== "1") return null
	const instanceId = params.get("magicWidgetInstanceId")?.trim()
	const protocolVersion = Number(params.get("magicWidgetProtocolVersion"))
	const hostOriginValue = params.get("magicWidgetHostOrigin")
	if (!instanceId || protocolVersion !== 1 || !hostOriginValue) return null
	try {
		const hostOrigin = new URL(hostOriginValue).origin
		if (!hostOrigin.startsWith("http://") && !hostOrigin.startsWith("https://")) return null
		return { instanceId, protocolVersion, hostOrigin }
	} catch {
		return null
	}
}
