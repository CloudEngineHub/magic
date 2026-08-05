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

function getFullscreenElement(): Element | null {
	const fullscreenDocument = document as FullscreenDocument
	return document.fullscreenElement || fullscreenDocument.webkitFullscreenElement || null
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
				return
			}

			if (!getFullscreenElement()) {
				// Enter fullscreen for the container
				if (containerRef.current) {
					const fullscreenContainer = containerRef.current as FullscreenElement
					const requestFullscreen =
						fullscreenContainer.requestFullscreen ||
						fullscreenContainer.webkitRequestFullscreen
					if (!requestFullscreen) return
					await requestFullscreen.call(fullscreenContainer)
					setIsFullscreen(true)
				}
			} else {
				const fullscreenDocument = document as FullscreenDocument
				const exitDocumentFullscreen =
					document.exitFullscreen || fullscreenDocument.webkitExitFullscreen
				if (!exitDocumentFullscreen) return
				await exitDocumentFullscreen.call(document)
				setIsFullscreen(false)
			}
		} catch (error) {
			console.error("Fullscreen error:", error)
		}
	}, [containerRef])

	// Exit fullscreen mode
	const exitFullscreen = useMemoizedFn(async () => {
		try {
			if (isMagicApp) {
				setIsFullscreen(false)
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
		}

		document.addEventListener("fullscreenchange", handleFullscreenChange)
		document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
		return () => {
			document.removeEventListener("fullscreenchange", handleFullscreenChange)
			document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
		}
	}, [containerRef])

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
