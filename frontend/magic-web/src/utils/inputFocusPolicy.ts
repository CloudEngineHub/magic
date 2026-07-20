import { isMagicApp } from "@/utils/devices"

/**
 * Prevent programmatic text-input focus inside Magic App WebView because iPadOS may
 * open the system keyboard before the overlay layout settles and cover the UI.
 */
export function shouldSuppressInputAutoFocusInMagicApp() {
	return isMagicApp
}

/**
 * Prevent programmatic text-input focus on iPad, including iPadOS devices that
 * identify themselves as MacIntel when requesting a desktop website.
 */
export function shouldSuppressInputAutoFocusOnIPad() {
	if (typeof navigator === "undefined") return false

	return (
		/iPad/i.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	)
}
