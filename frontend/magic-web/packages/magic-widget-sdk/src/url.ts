import type { MagicWidget } from "./types"

export const LOGIN_STRATEGY_QUERY_KEY = "login-strategy"
export const ORGANIZATION_CODE_QUERY_KEY = "organizationCode"
const DEFAULT_CLUSTER_CODE = "global"

export interface BuildWidgetIframeUrlContext {
	fallbackAppOrigin?: string | null
}

function normalizeScriptOrigin(scriptOrigin: string | null | undefined) {
	if (!scriptOrigin) {
		throw new Error("Magic widget script origin is required")
	}

	const url = new URL(scriptOrigin)
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("Magic widget script origin must use http or https")
	}

	return url.origin
}

function requireMountOptions(
	options: MagicWidget.MountOptions | null | undefined,
): asserts options is MagicWidget.MountOptions {
	if (!options || typeof options !== "object") {
		throw new Error("Magic widget mount options are required")
	}
}

function assertNoLegacyTopLevelOrganizationCode(options: MagicWidget.MountOptions) {
	if (Object.prototype.hasOwnProperty.call(options, "organizationCode")) {
		throw new Error(
			"Magic widget organizationCode must be configured through auth.organizationCode",
		)
	}
}

function encodePathSegment(value: unknown, label: string) {
	if (typeof value !== "string") {
		throw new Error(`Magic widget ${label} must be a string`)
	}

	const trimmedValue = value.trim()

	if (!trimmedValue) {
		throw new Error(`Magic widget ${label} is required`)
	}

	return encodeURIComponent(trimmedValue)
}

function normalizeOptionalString(value: unknown, label: string) {
	if (value === null || value === undefined) return null
	if (typeof value !== "string") {
		throw new Error(`Magic widget ${label} must be a string`)
	}

	const trimmedValue = value.trim()
	return trimmedValue || null
}

function resolvePagePath(page: MagicWidget.PageOptions | null | undefined) {
	if (!page || typeof page !== "object") {
		throw new Error("Magic widget page is required")
	}

	const pageType = (page as { type?: unknown }).type
	if (pageType === "crew") {
		const crewPage = page as MagicWidget.CrewPageOptions
		return `/${DEFAULT_CLUSTER_CODE}/super/crew/${encodePathSegment(crewPage.crewId, "crewId")}`
	}

	throw new Error(`Magic widget page type is not supported: ${String(pageType ?? "")}`)
}

export function validateWidgetMountOptions(
	options: MagicWidget.MountOptions | null | undefined,
) {
	requireMountOptions(options)
	assertNoLegacyTopLevelOrganizationCode(options)
	resolvePagePath(options.page)
	normalizeOptionalString(options.auth?.organizationCode, "auth.organizationCode")
}

function appendQueryValue(url: URL, key: string, value: MagicWidget.QueryValue) {
	if (Array.isArray(value)) {
		value.forEach((item) => appendQueryValue(url, key, item))
		return
	}

	if (value === null || value === undefined) return

	url.searchParams.append(key, String(value))
}

export function buildWidgetIframeUrl(
	options: MagicWidget.MountOptions,
	context: BuildWidgetIframeUrlContext = {},
) {
	requireMountOptions(options)
	assertNoLegacyTopLevelOrganizationCode(options)
	const origin = normalizeScriptOrigin(context.fallbackAppOrigin)
	const pagePath = resolvePagePath(options.page)
	const organizationCode = normalizeOptionalString(
		options.auth?.organizationCode,
		"auth.organizationCode",
	)

	const url = new URL(pagePath, origin)

	Object.entries(options.iframe?.query ?? {}).forEach(([key, value]) => {
		appendQueryValue(url, key, value)
	})

	if (organizationCode) {
		url.searchParams.set(ORGANIZATION_CODE_QUERY_KEY, organizationCode)
	}

	if (options.auth?.loginStrategy) {
		url.searchParams.set(LOGIN_STRATEGY_QUERY_KEY, options.auth.loginStrategy)
	}

	return url
}
