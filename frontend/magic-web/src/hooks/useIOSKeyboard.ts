import { useEffect, useRef, useState, type MutableRefObject } from "react"
import type { IOSKeyboardState, UseIOSKeyboardOptions } from "./useIOSKeyboard.types"

const DEFAULT_FOCUS_IN_DELAY = 100
const DEFAULT_FOCUS_OUT_DELAY = 300

// Use useLayoutEffect in browser, useEffect in SSR

/**
 * Detect if device is iOS
 */
const isIOSDevice = (): boolean => {
	if (typeof window === "undefined") return false

	const legacyWindow = window as Window & { MSStream?: unknown }
	return /iPad|iPhone|iPod/.test(navigator.userAgent) && !legacyWindow.MSStream
}

/**
 * Detect if device is Android
 */
const isAndroidDevice = (): boolean => {
	if (typeof window === "undefined") return false

	return /Android/.test(navigator.userAgent)
}

/**
 * Detect if browser is Chrome
 */
const isChromeOrChromiumBrowser = (): boolean => {
	if (typeof window === "undefined") return false

	const userAgent = navigator.userAgent
	return /Chrome|Chromium/.test(userAgent) && !/Edge|Edg/.test(userAgent)
}

/**
 * Check if device needs keyboard handling
 */
const needsKeyboardHandling = (): boolean => {
	return isIOSDevice()
}

/**
 * Detect if element can trigger virtual keyboard
 */
const isKeyboardInput = (element: HTMLElement): boolean => {
	const tagName = element.tagName.toLowerCase()

	if (tagName === "input") {
		const inputType = (element as HTMLInputElement).type.toLowerCase()
		return !["button", "submit", "reset", "checkbox", "radio", "file", "image"].includes(
			inputType,
		)
	}

	if (tagName === "textarea") return true
	if (element.hasAttribute("contenteditable")) return true

	return false
}

/** Check whether focus is moving directly to another software-keyboard input. */
const isMovingToKeyboardInput = (event: FocusEvent): boolean => {
	const relatedTarget = event.relatedTarget
	if (relatedTarget instanceof HTMLElement && isKeyboardInput(relatedTarget)) {
		return true
	}

	const activeElement = document.activeElement
	return (
		activeElement instanceof HTMLElement &&
		activeElement !== event.target &&
		isKeyboardInput(activeElement)
	)
}

/**
 * Detect mobile keyboard state while allowing callers to align focus updates with their layout.
 */
export function useIOSKeyboard({
	focusInDelay = DEFAULT_FOCUS_IN_DELAY,
	focusOutDelay = DEFAULT_FOCUS_OUT_DELAY,
}: UseIOSKeyboardOptions = {}) {
	const [keyboardState, setKeyboardState] = useState<IOSKeyboardState>({
		isUp: false,
		offset: 0,
		isVisible: false,
	})

	const [initialViewportHeight, setInitialViewportHeight] = useState<number>(0)
	const focusInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const focusOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Initialize viewport height for Android Chrome
	useEffect(() => {
		if (needsKeyboardHandling()) {
			const height = window.visualViewport?.height || window.innerHeight
			setInitialViewportHeight(height)
		}
	}, [])

	// Listen for Visual Viewport changes (Android Chrome)
	useEffect(() => {
		if (!needsKeyboardHandling()) return

		const handleViewportResize = () => {
			if (isAndroidDevice() && isChromeOrChromiumBrowser()) {
				const currentHeight = window.visualViewport?.height || window.innerHeight
				const heightDifference = initialViewportHeight - currentHeight
				const threshold = 150 // Minimum height change to consider as keyboard

				if (heightDifference > threshold) {
					// Keyboard is open
					setKeyboardState({
						isUp: true,
						offset: heightDifference,
						isVisible: true,
					})
				} else {
					// Keyboard is closed
					setKeyboardState({
						isUp: false,
						offset: 0,
						isVisible: false,
					})
				}
			}
		}

		// For Android Chrome, use Visual Viewport API
		if (window.visualViewport && isAndroidDevice()) {
			window.visualViewport.addEventListener("resize", handleViewportResize)

			return () => {
				window.visualViewport?.removeEventListener("resize", handleViewportResize)
			}
		}
	}, [initialViewportHeight])

	// Listen for focus events to detect keyboard opening (iOS and fallback)
	useEffect(() => {
		if (!needsKeyboardHandling()) return

		/** Cancel a pending focus state update so stale events cannot overwrite newer state. */
		const clearFocusTimer = (
			timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
		) => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current)
				timerRef.current = null
			}
		}

		/** Run a focus state update immediately when its configured delay is zero. */
		const scheduleFocusUpdate = (
			callback: () => void,
			delay: number,
			timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
		) => {
			if (delay <= 0) {
				callback()
				return
			}

			timerRef.current = setTimeout(() => {
				timerRef.current = null
				callback()
			}, delay)
		}

		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as HTMLElement
			if (target && isKeyboardInput(target)) {
				clearFocusTimer(focusInTimerRef)
				clearFocusTimer(focusOutTimerRef)

				if (isIOSDevice()) {
					// iOS specific handling
					const rect = target.getBoundingClientRect()
					const origin = rect.top
					// Wait for the keyboard animation unless the caller needs an immediate layout update.
					scheduleFocusUpdate(
						() => {
							const rect = target.getBoundingClientRect()
							const newOffset = origin - rect.top
							setKeyboardState({
								isUp: true,
								offset: newOffset,
								isVisible: true,
							})
						},
						focusInDelay,
						focusInTimerRef,
					)
				} else if (isAndroidDevice() && !window.visualViewport) {
					// Fallback for Android without Visual Viewport API
					scheduleFocusUpdate(
						() => {
							const heightDifference = initialViewportHeight - window.innerHeight
							if (heightDifference > 100) {
								setKeyboardState({
									isUp: true,
									offset: heightDifference,
									isVisible: true,
								})
							}
						},
						200,
						focusInTimerRef,
					)
				}
			}
		}

		const handleFocusOut = (event: FocusEvent) => {
			const target = event.target as HTMLElement
			if (target && isKeyboardInput(target)) {
				clearFocusTimer(focusInTimerRef)
				clearFocusTimer(focusOutTimerRef)

				if (isIOSDevice()) {
					// iOS specific handling
					const rect = target.getBoundingClientRect()
					const origin = rect.top
					// Keep the keyboard open when focus moves directly to another editable element.
					scheduleFocusUpdate(
						() => {
							if (isMovingToKeyboardInput(event)) return

							const rect = target.getBoundingClientRect()
							const newOffset = origin - rect.top
							setKeyboardState({
								isUp: false,
								offset: newOffset,
								isVisible: false,
							})
						},
						focusOutDelay,
						focusOutTimerRef,
					)
				} else if (isAndroidDevice() && !window.visualViewport) {
					// Fallback for Android without Visual Viewport API
					scheduleFocusUpdate(
						() => {
							setKeyboardState({
								isUp: false,
								offset: 0,
								isVisible: false,
							})
						},
						200,
						focusOutTimerRef,
					)
				}
			}
		}

		document.addEventListener("focusin", handleFocusIn)
		document.addEventListener("focusout", handleFocusOut)

		return () => {
			clearFocusTimer(focusInTimerRef)
			clearFocusTimer(focusOutTimerRef)
			document.removeEventListener("focusin", handleFocusIn)
			document.removeEventListener("focusout", handleFocusOut)
		}
	}, [focusInDelay, focusOutDelay, initialViewportHeight])

	return {
		...keyboardState,
		isIOSDevice: isIOSDevice(),
		isAndroidDevice: isAndroidDevice(),
		isChromeOrChromiumBrowser: isChromeOrChromiumBrowser(),
		needsKeyboardHandling: needsKeyboardHandling(),
	}
}
