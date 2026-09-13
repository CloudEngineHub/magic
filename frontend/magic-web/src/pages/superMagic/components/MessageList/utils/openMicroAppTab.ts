import pubsub, { PubSubEvents } from "@/utils/pubsub"

// 只接受 canonical typed-link 的 authority 部分，避免把查询参数或路径误当成 app ID。
const MICRO_APP_LINK_PATTERN = /^micro_app:\/\/([^/?#]+)$/i

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
