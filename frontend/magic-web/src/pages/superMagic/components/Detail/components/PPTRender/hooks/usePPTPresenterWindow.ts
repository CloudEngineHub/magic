import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

export type PPTPresenterOpenResult = "opened" | "fallback" | "cancelled"

/** The Window Management API fields used by the presenter. */
export interface PPTPresenterScreen {
	left?: number
	top?: number
	width?: number
	height?: number
	availLeft?: number
	availTop?: number
	availWidth?: number
	availHeight?: number
	isPrimary?: boolean
	label?: string
}

interface ScreenDetailsLike {
	currentScreen: PPTPresenterScreen
	screens: PPTPresenterScreen[]
}

type WindowWithManagement = Window & {
	getScreenDetails?: () => Promise<ScreenDetailsLike>
}

type PresentationTarget = HTMLElement & {
	requestFullscreen: (
		options?: FullscreenOptions & { screen?: PPTPresenterScreen },
	) => Promise<void>
}

function bounds(screen: PPTPresenterScreen) {
	return {
		left: screen.availLeft ?? screen.left ?? 0,
		top: screen.availTop ?? screen.top ?? 0,
		width: screen.availWidth ?? screen.width ?? 1280,
		height: screen.availHeight ?? screen.height ?? 720,
	}
}

// Run in the companion realm so the browser can delegate its click activation.
// No slide HTML or user-authored strings are interpolated into this script.
const CONSOLE_GESTURES = `<script>document.addEventListener('click', function(event) {
 const item = event.target.closest('[data-ppt-screen-index]');
 if (!item || !window.opener) return;
 window.opener.postMessage({type:'ppt-presenter:screen', index:Number(item.dataset.pptScreenIndex)},
  {targetOrigin:window.opener.location.origin, delegate:'fullscreen'});
}, true);</script>`

async function exitPresenterFullscreen(target: HTMLElement | null) {
	const exitFullscreen = document.exitFullscreen
	// React clears DOM refs before passive cleanup; equal empty values do not own fullscreen.
	if (!target || document.fullscreenElement !== target || typeof exitFullscreen !== "function")
		return
	// Keep synchronous API failures in the same Promise error path as rejected exits.
	await exitFullscreen.call(document)
}

/** Fullscreen the existing slide first: opening an audience popup consumes the gesture.
 * The browser permits a companion window after a targeted fullscreen request. */
export function usePPTPresenterWindow(targetRef: RefObject<HTMLElement>) {
	const { t } = useTranslation("super")
	const popupRef = useRef<Window | null>(null)
	const generation = useRef(0)
	const pending = useRef(false)
	const [consoleContainer, setConsoleContainer] = useState<HTMLElement | null>(null)
	const [isOpen, setIsOpen] = useState(false)
	const [isFallbackOnly, setFallbackOnly] = useState(false)
	const [screens, setScreens] = useState<PPTPresenterScreen[]>([])
	const [selectedScreen, setSelectedScreen] = useState<number | null>(null)
	const close = useCallback(() => {
		generation.current++
		pending.current = false
		popupRef.current?.close()
		popupRef.current = null
		setConsoleContainer(null)
		setIsOpen(false)
		void exitPresenterFullscreen(targetRef.current).catch(() => undefined)
	}, [targetRef])

	const open = useCallback(async (): Promise<PPTPresenterOpenResult> => {
		if (pending.current) return "cancelled"
		const target = targetRef.current as PresentationTarget | null
		const getScreenDetails = (window as WindowWithManagement).getScreenDetails
		if (
			!target?.requestFullscreen ||
			typeof document.exitFullscreen !== "function" ||
			!getScreenDetails ||
			(window.screen as Screen & { isExtended?: boolean }).isExtended !== true
		)
			return "fallback"
		pending.current = true
		const operation = ++generation.current
		let popup: Window | null = null
		try {
			// Permission must be requested before any activation-consuming browser API.
			const details = await getScreenDetails.call(window)
			if (operation !== generation.current) return "cancelled"
			const external = details.screens.findIndex(
				(screen) =>
					screen !== details.currentScreen &&
					(screen.left !== details.currentScreen.left ||
						screen.top !== details.currentScreen.top),
			)
			if (external < 0) return "fallback"
			const home = bounds(details.currentScreen)
			// Do not await fullscreen before window.open: both belong to the same click.
			const fullscreen = target.requestFullscreen({ screen: details.screens[external] })
			try {
				popup = window.open(
					"",
					"_blank",
					`popup,left=${home.left},top=${home.top},width=${home.width},height=${home.height}`,
				)
				popupRef.current = popup
			} catch {
				// Fullscreen still succeeds when a companion window is unavailable.
			}
			await fullscreen
			if (operation !== generation.current) {
				popup?.close()
				if (!pending.current && !popupRef.current && document.fullscreenElement === target)
					await exitPresenterFullscreen(target)
				return "cancelled"
			}
			if (document.fullscreenElement !== target) {
				popup?.close()
				popupRef.current = null
				return "cancelled"
			}
			setScreens(details.screens)
			setSelectedScreen(external)
			if (popup) {
				const doc = popup.document
				doc.open()
				doc.write(
					'<!doctype html><html><head><meta charset="utf-8"></head><body><main id="ppt-presenter-console"></main>' +
						CONSOLE_GESTURES +
						"</body></html>",
				)
				doc.close()
				doc.title = t("ppt.presenter.title")
				// React portals share state, but the companion document needs its own styles and theme.
				doc.documentElement.className = document.documentElement.className
				doc.documentElement.style.cssText = document.documentElement.style.cssText
				for (const style of document.querySelectorAll('style, link[rel="stylesheet"]'))
					doc.head.appendChild(style.cloneNode(true))
				const root = doc.getElementById("ppt-presenter-console")
				if (!root) throw new Error("Presenter console container is missing")
				Object.assign(doc.body.style, { margin: "0", overflow: "hidden" })
				Object.assign(root.style, {
					height: "100vh",
					padding: "16px",
					boxSizing: "border-box",
					background: "#333",
					display: "flex",
					flexDirection: "column",
				})
				setConsoleContainer(root)
				popup.focus()
			}
			setIsOpen(true)
			return "opened"
		} catch {
			// A rejected permission/fullscreen request can outlive a closed or replaced session.
			if (operation !== generation.current) {
				popup?.close()
				return "cancelled"
			}
			popup?.close()
			popupRef.current = null
			// A companion setup failure must not undo a successful audience fullscreen.
			if (document.fullscreenElement === target) {
				setIsOpen(true)
				return "opened"
			}
			setFallbackOnly(true)
			return "fallback"
		} finally {
			if (operation === generation.current) pending.current = false
		}
	}, [targetRef, t])

	const moveToScreen = useCallback(
		async (index: number) => {
			const target = targetRef.current as PresentationTarget | null
			if (!target || !screens[index] || !isOpen) return false
			const operation = generation.current
			try {
				await target.requestFullscreen({ screen: screens[index] })
				if (operation !== generation.current) {
					// Undo a late fullscreen only if another session has not taken ownership.
					if (
						!pending.current &&
						!popupRef.current &&
						document.fullscreenElement === target
					)
						await exitPresenterFullscreen(target)
					return false
				}
				setSelectedScreen(index)
				const companionScreen = screens.find((_, candidate) => candidate !== index)
				if (companionScreen && popupRef.current) {
					const rect = bounds(companionScreen)
					popupRef.current.moveTo(rect.left, rect.top)
					popupRef.current.resizeTo(rect.width, rect.height)
				}
				return true
			} catch {
				return false
			}
		},
		[targetRef, screens, isOpen],
	)
	useEffect(() => {
		if (!isOpen) return
		const onFullscreenChange = () => {
			if (document.fullscreenElement !== targetRef.current) close()
		}
		const onScreenRequest = (event: MessageEvent) => {
			if (
				event.source !== popupRef.current ||
				event.origin !== window.location.origin ||
				event.data?.type !== "ppt-presenter:screen" ||
				!Number.isInteger(event.data.index)
			)
				return
			void moveToScreen(event.data.index)
		}
		window.addEventListener("message", onScreenRequest)
		const timer = window.setInterval(() => {
			if (popupRef.current?.closed) close()
		}, 500)
		document.addEventListener("fullscreenchange", onFullscreenChange)
		window.addEventListener("pagehide", close)
		return () => {
			window.clearInterval(timer)
			window.removeEventListener("message", onScreenRequest)
			document.removeEventListener("fullscreenchange", onFullscreenChange)
			window.removeEventListener("pagehide", close)
		}
	}, [isOpen, close, targetRef, moveToScreen])
	useEffect(() => () => close(), [close])

	return {
		moveToScreen,
		isOpen,
		isFallbackOnly,
		screens,
		selectedScreen,
		open,
		close,
		consoleContainer,
	}
}
