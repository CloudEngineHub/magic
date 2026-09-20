import { useState, useEffect, useCallback, RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import { isMagicApp } from "@/utils/devices"

interface UseFullscreenOptions {
	containerRef: RefObject<HTMLElement>
}

interface UseFullscreenReturn {
	isFullscreen: boolean
	toggleFullscreen: () => Promise<void>
	exitFullscreen: () => Promise<void>
}

type FullscreenDocument = Document & {
	webkitFullscreenElement?: Element | null
	webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
	webkitRequestFullscreen?: () => Promise<void> | void
}

type ScreenOrientationWithLock = ScreenOrientation & {
	lock?: (orientation: "landscape" | "portrait") => Promise<void>
	unlock?: () => void
}

function getFullscreenElement(): Element | null {
	const fullscreenDocument = document as FullscreenDocument
	return document.fullscreenElement || fullscreenDocument.webkitFullscreenElement || null
}

async function lockLandscapeOrientation() {
	const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined
	if (!orientation?.lock) return
	try {
		await orientation.lock("landscape")
	} catch {
		// Orientation lock requires an installed/PWA or platform permission in some
		// browsers; fullscreen remains useful when the optional capability is denied.
	}
}

function unlockScreenOrientation() {
	const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined
	orientation?.unlock?.()
}

/**
 * Custom hook for managing fullscreen functionality
 * Handles fullscreen state, keyboard events, and fullscreen-related iframe messages
 */
export function useFullscreen({ containerRef }: UseFullscreenOptions): UseFullscreenReturn {
	const [isFullscreen, setIsFullscreen] = useState(false)

	// Toggle fullscreen mode
	const toggleFullscreen = useCallback(async () => {
		try {
			// Native fullscreen is unreliable inside the mobile app WebView; its fixed layout is the
			// fullscreen surface, so only the local CSS state needs to change there.
			if (isMagicApp) {
				setIsFullscreen((current) => !current)
				if (isFullscreen) unlockScreenOrientation()
				else void lockLandscapeOrientation()
				return
			}

			if (!getFullscreenElement()) {
				// CSS fullscreen fallback (WebView and browsers without Fullscreen API).
				if (isFullscreen) {
					setIsFullscreen(false)
					unlockScreenOrientation()
					return
				}
				// Enter fullscreen for the container
				if (containerRef.current) {
					const fullscreenContainer = containerRef.current as FullscreenElement
					const requestFullscreen =
						fullscreenContainer.requestFullscreen ||
						fullscreenContainer.webkitRequestFullscreen
					if (!requestFullscreen) {
						const isCoarsePointer =
							window.matchMedia?.("(pointer: coarse)")?.matches ?? false
						if (isCoarsePointer) {
							setIsFullscreen(true)
							await lockLandscapeOrientation()
						}
						return
					}
					await requestFullscreen.call(fullscreenContainer)
					setIsFullscreen(true)
					await lockLandscapeOrientation()
				}
			} else {
				const fullscreenDocument = document as FullscreenDocument
				const exitDocumentFullscreen =
					document.exitFullscreen || fullscreenDocument.webkitExitFullscreen
				if (!exitDocumentFullscreen) return
				await exitDocumentFullscreen.call(document)
				setIsFullscreen(false)
				unlockScreenOrientation()
			}
		} catch (error) {
			console.error("Fullscreen error:", error)
			// Some mobile WebViews expose requestFullscreen but reject it at runtime.
			// Keep the CSS fallback limited to coarse-pointer devices; desktop permission
			// failures must remain visible instead of being reported as fullscreen.
			const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false
			if (isCoarsePointer) {
				setIsFullscreen(true)
				await lockLandscapeOrientation()
			}
		}
	}, [containerRef, isFullscreen])

	// Exit fullscreen mode
	const exitFullscreen = useMemoizedFn(async () => {
		try {
			if (isMagicApp) {
				setIsFullscreen(false)
				unlockScreenOrientation()
				return
			}
			// Check if the current container is in fullscreen
			if (getFullscreenElement() === containerRef.current) {
				const fullscreenDocument = document as FullscreenDocument
				const exitDocumentFullscreen =
					document.exitFullscreen || fullscreenDocument.webkitExitFullscreen
				if (!exitDocumentFullscreen) return
				await exitDocumentFullscreen.call(document)
				setIsFullscreen(false)
				unlockScreenOrientation()
				return
			}
			if (isFullscreen) {
				setIsFullscreen(false)
				unlockScreenOrientation()
			}
		} catch (error) {
			console.error("Exit fullscreen error:", error)
		}
	})

	// Listen for fullscreen state changes
	useEffect(() => {
		function handleFullscreenChange() {
			// Check if the current container is in fullscreen
			const isContainerFullscreen = getFullscreenElement() === containerRef.current
			setIsFullscreen(isContainerFullscreen)
			if (!isContainerFullscreen) unlockScreenOrientation()
		}

		document.addEventListener("fullscreenchange", handleFullscreenChange)
		document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
		return () => {
			document.removeEventListener("fullscreenchange", handleFullscreenChange)
			document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
		}
	}, [containerRef])

	useEffect(() => () => unlockScreenOrientation(), [])

	// Listen for fullscreen-related keyboard events from iframe
	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (event.data && event.data.type === "keyboardEvent") {
				const { direction } = event.data

				switch (direction) {
					case "fullscreen":
						toggleFullscreen()
						break
					case "escape":
						// Exit fullscreen if the container is in fullscreen mode
						if (
							isFullscreen &&
							(isMagicApp || getFullscreenElement() === containerRef.current)
						) {
							exitFullscreen()
						}
						break
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [toggleFullscreen, exitFullscreen, isFullscreen, containerRef])

	// Handle keyboard events
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			switch (event.key) {
				case "Escape":
					// Exit fullscreen if the container is in fullscreen mode
					if (
						isFullscreen &&
						(isMagicApp || getFullscreenElement() === containerRef.current)
					) {
						exitFullscreen()
					}
					break
				case "F11":
					event.preventDefault()
					toggleFullscreen()
					break
			}
		}

		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [isFullscreen, toggleFullscreen, exitFullscreen, containerRef])

	return {
		isFullscreen,
		toggleFullscreen,
		exitFullscreen,
	}
}
