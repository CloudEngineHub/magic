import pubsub, { PubSubEvents } from "@/utils/pubsub"

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
