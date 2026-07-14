import { isMagicApp } from "@/utils/devices"

/**
 * Prevent programmatic text-input focus inside Magic App WebView because iPadOS may
 * open the system keyboard before the overlay layout settles and cover the UI.
 */
export function shouldSuppressInputAutoFocusInMagicApp() {
	return isMagicApp
}
