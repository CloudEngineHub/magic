import {
	resolveMagicWidgetCrewLayout,
	shouldForceMobileCrewConversation,
} from "@/providers/MagicWidgetProvider/config"
import type { MagicWidgetLayout } from "@/providers/MagicWidgetProvider/types"

export { shouldForceMobileCrewConversation }

/** Applies an explicit Widget layout before the existing viewport and legacy query fallback. */
export function getCrewConversationLayout({
	widgetLayout,
	isMobileViewport,
	search,
}: {
	widgetLayout?: MagicWidgetLayout
	isMobileViewport: boolean
	search: string
}): MagicWidgetLayout {
	return resolveMagicWidgetCrewLayout({
		configuredLayout: widgetLayout,
		isMobileViewport,
		search,
	})
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
