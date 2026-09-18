import pubsub, { PubSubEvents } from "@/utils/pubsub"

// 只接受 canonical typed-link 的 authority 部分，避免把查询参数或路径误当成 app ID。
const MICRO_APP_LINK_PATTERN = /^micro_app:\/\/([^/?#]+)$/i
const MICRO_APP_ROUTE_PATTERN = /(?:^|\/)micro[-_]app\/([^/?#]+)/i

export function parseMicroAppLink(href: unknown): string | null {
	if (typeof href !== "string") return null

	const match = MICRO_APP_LINK_PATTERN.exec(href.trim())
	if (!match) return null

	try {
		const appId = decodeURIComponent(match[1]).trim()
		return /[/?#]/.test(appId) ? null : appId || null
	} catch {
		return null
	}
}

/** Convert a custom micro-app scheme to the app id used by a normal anchor. */
export function normalizeMicroAppHref(href: unknown): string {
	const appId = parseMicroAppLink(href)
	return appId ?? (typeof href === "string" ? href : "")
}

/** Identify links targeting the micro app represented by the current route. */
export function isCurrentMicroAppLink(appId: string | null, pathname?: string): boolean {
	if (!appId) return false

	const currentPathname =
		pathname ?? (typeof window !== "undefined" ? window.location.pathname : "")
	const match = MICRO_APP_ROUTE_PATTERN.exec(currentPathname)
	if (!match) return false

	try {
		return decodeURIComponent(match[1]).trim() === appId
	} catch {
		return false
	}
}

export function openMicroAppTab(payload: { appId?: string; appName?: string }): string | null {
	const appId = payload.appId?.trim()
	if (!appId) return null

	pubsub.publish(PubSubEvents.Switch_Detail_Mode, "files")
	pubsub.publish(PubSubEvents.Open_Micro_App_Tab, {
		appId,
		appName: payload.appName?.trim() || undefined,
	})

	return appId
}
