export interface ViewportSize {
	width: number
	height: number
}

export interface IOSKeyboardState {
	isUp: boolean
	offset: number
	isVisible: boolean
}

export interface UseIOSKeyboardOptions {
	/** Delay before confirming that an input focus opened the software keyboard. */
	focusInDelay?: number
	/** Delay before confirming that an input blur closed the software keyboard. */
	focusOutDelay?: number
}

export interface MonitorSoftKeyboardResult {
	isUp: boolean
	isDown: boolean
	offset: number
	isIOSDevice: boolean
	isAndroidDevice: boolean
	isChromeOrChromiumBrowser: boolean
	needsKeyboardHandling: boolean
}

// Event handler types
export type KeyboardEventHandler = (state: IOSKeyboardState) => void
export type ViewportChangeHandler = (size: ViewportSize) => void
