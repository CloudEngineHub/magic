import { platformKey } from "@/utils/storage"

export const BROWSER_NOTIFICATION_ENABLED_KEY = platformKey("browserNotificationEnabled")

const ENABLED_VALUE = "1"

export const browserNotificationPreference = {
	getEnabled(): boolean {
		if (typeof window === "undefined") return false
		return window.localStorage.getItem(BROWSER_NOTIFICATION_ENABLED_KEY) === ENABLED_VALUE
	},

	setEnabled(enabled: boolean): void {
		if (typeof window === "undefined") return
		window.localStorage.setItem(BROWSER_NOTIFICATION_ENABLED_KEY, enabled ? ENABLED_VALUE : "0")
	},
}
