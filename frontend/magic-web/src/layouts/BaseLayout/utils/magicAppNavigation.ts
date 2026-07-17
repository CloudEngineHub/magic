import { getNativePort } from "@/platform/native"
import { toAboutUs } from "@/layouts/BaseLayoutMobile/utils/url"
import { isMagicApp } from "@/utils/devices"

/**
 * Reuses the existing mobile-native "About Us" entry so desktop UI can share the same app bridge.
 */
export function openAboutUsInMagicApp() {
	if (!isMagicApp) return

	toAboutUs()
}

/**
 * Routes desktop recording entry clicks back into the app-native recording tab instead of the web page.
 */
export function openAudioRecordingsInMagicApp() {
	if (!isMagicApp) return

	void getNativePort().navigation.changeBottomTab({
		tab: "ai_recording",
		bottomTabHeight: 0,
	})
}
