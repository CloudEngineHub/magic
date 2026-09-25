import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

export interface PPTPresenterSlidePayload {
	index: number
	html: string
	dimensions?: PPTPresenterDimensions
}

export interface PPTPresenterDimensions {
	width: number
	height: number
}

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

type PresenterDocument = Document & {
	fullscreenElement?: Element | null
	exitFullscreen?: () => Promise<void>
	documentElement: HTMLElement & {
		requestFullscreen?: (
			options?: FullscreenOptions & { screen?: PPTPresenterScreen },
		) => Promise<void>
	}
}

const POLL_INTERVAL = 500
let presenterWindowSequence = 0

/**
 * The shell contains no executable script or visible copy. The opener fills
 * translated labels through DOM APIs and sends slide HTML only to srcdoc.
 */
const POPUP_SHELL = `<!doctype html><html><head><meta charset="utf-8"><title></title><style>html,body,#ppt-presenter-root{margin:0;width:100%;height:100%;overflow:hidden;background:#000}#ppt-presenter-root{position:relative}iframe{display:block;width:100%;height:100%;border:0;transform-origin:top left}#ppt-presenter-fullscreen{position:fixed;right:24px;bottom:24px;z-index:2;border:1px solid rgba(255,255,255,.35);border-radius:8px;background:rgba(20,20,20,.82);color:#fff;padding:10px 16px;font:500 14px/20px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}#ppt-presenter-fullscreen:hover{background:rgba(40,40,40,.9)}#ppt-presenter-fullscreen:focus-visible{outline:2px solid #fff;outline-offset:2px}#ppt-presenter-fullscreen[hidden]{display:none}</style></head><body><main id="ppt-presenter-root"><iframe id="ppt-presenter-frame" title="" sandbox="allow-scripts"></iframe><button id="ppt-presenter-fullscreen" type="button"></button></main></body></html>`

function toMessage(payload: PPTPresenterSlidePayload) {
	return { type: "ppt-presenter:slide", payload }
}

function isOpenWindow(value: Window | null): value is Window {
	return Boolean(value && !value.closed)
}

function screenBounds(screen: PPTPresenterScreen) {
	return {
		left: screen.availLeft ?? screen.left ?? 0,
		top: screen.availTop ?? screen.top ?? 0,
		width: screen.availWidth ?? screen.width ?? 1280,
		height: screen.availHeight ?? screen.height ?? 720,
	}
}

function sameScreen(left: PPTPresenterScreen, right: PPTPresenterScreen) {
	const a = screenBounds(left)
	const b = screenBounds(right)
	return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

function isValidDimensions(
	dimensions?: PPTPresenterDimensions,
): dimensions is PPTPresenterDimensions {
	return Boolean(
		dimensions &&
		Number.isFinite(dimensions.width) &&
		dimensions.width > 0 &&
		Number.isFinite(dimensions.height) &&
		dimensions.height > 0,
	)
}

/**
 * Keep the fixed-size slide canvas intact, then contain it inside the popup
 * viewport so a non-16:9 deck cannot be cropped by the browser window chrome.
 */
function applySlideLayout(
	popup: Window,
	frame: HTMLIFrameElement,
	dimensions?: PPTPresenterDimensions,
) {
	if (!isValidDimensions(dimensions)) return

	const documentElement = popup.document.documentElement
	const viewportWidth = popup.innerWidth || documentElement.clientWidth || dimensions.width
	const viewportHeight = popup.innerHeight || documentElement.clientHeight || dimensions.height
	const scale = Math.min(viewportWidth / dimensions.width, viewportHeight / dimensions.height)
	const rawOffsetX = (viewportWidth - dimensions.width * scale) / 2
	const rawOffsetY = (viewportHeight - dimensions.height * scale) / 2
	// Avoid serializing a tiny negative zero caused by floating-point rounding.
	const offsetX = Math.abs(rawOffsetX) < 0.001 ? 0 : rawOffsetX
	const offsetY = Math.abs(rawOffsetY) < 0.001 ? 0 : rawOffsetY

	frame.style.position = "absolute"
	frame.style.left = "0"
	frame.style.top = "0"
	frame.style.width = `${dimensions.width}px`
	frame.style.height = `${dimensions.height}px`
	frame.style.transformOrigin = "top left"
	frame.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
}

export function usePPTPresenterWindow() {
	const { t } = useTranslation("super")
	const popupRef = useRef<Window | null>(null)
	const pollRef = useRef<number | undefined>(undefined)
	const popupCleanupRef = useRef<(() => void) | null>(null)
	const fullscreenButtonRef = useRef<HTMLButtonElement | null>(null)
	const frameRef = useRef<HTMLIFrameElement | null>(null)
	const slideDimensionsRef = useRef<PPTPresenterDimensions | undefined>(undefined)
	const latestPayloadRef = useRef<PPTPresenterSlidePayload | null>(null)
	const popupNameRef = useRef("")
	if (!popupNameRef.current) {
		popupNameRef.current = `magic-ppt-presenter-${++presenterWindowSequence}`
	}
	const screensRef = useRef<PPTPresenterScreen[]>([])
	const preferredScreenRef = useRef(0)
	const hasExternalScreenRef = useRef(false)
	const fallbackOnlyRef = useRef(false)
	const operationGenerationRef = useRef(0)
	const [isOpen, setIsOpen] = useState(false)
	const [isFallbackOnly, setIsFallbackOnly] = useState(false)
	const [screens, setScreens] = useState<PPTPresenterScreen[]>([])
	const [selectedScreen, setSelectedScreen] = useState<number | null>(null)

	const setFullscreenButtonVisible = useCallback((visible: boolean) => {
		if (fullscreenButtonRef.current) fullscreenButtonRef.current.hidden = !visible
	}, [])

	const tripFallbackBreaker = useCallback(() => {
		fallbackOnlyRef.current = true
		setIsFallbackOnly(true)
	}, [])

	const clearPopup = useCallback(() => {
		operationGenerationRef.current += 1
		if (pollRef.current !== undefined) window.clearInterval(pollRef.current)
		pollRef.current = undefined
		popupCleanupRef.current?.()
		popupCleanupRef.current = null
		fullscreenButtonRef.current = null
		frameRef.current = null
		slideDimensionsRef.current = undefined
		latestPayloadRef.current = null
		popupRef.current = null
		setIsOpen(false)
	}, [])

	const post = useCallback(
		(payload: PPTPresenterSlidePayload) => {
			const popup = popupRef.current
			if (!isOpenWindow(popup)) {
				clearPopup()
				return false
			}
			latestPayloadRef.current = payload
			slideDimensionsRef.current = payload.dimensions
			if (frameRef.current) applySlideLayout(popup, frameRef.current, payload.dimensions)
			popup.postMessage(toMessage(payload), window.location.origin)
			return true
		},
		[clearPopup],
	)

	const enumerateScreens = useCallback(async (isCancelled?: () => boolean) => {
		const getScreenDetails = (window as WindowWithManagement).getScreenDetails
		if (!getScreenDetails) {
			setScreens([])
			screensRef.current = []
			hasExternalScreenRef.current = false
			return []
		}
		try {
			const details = await getScreenDetails.call(window)
			if (isCancelled?.()) return []
			const availableScreens = Array.isArray(details.screens) ? details.screens : []
			screensRef.current = availableScreens
			setScreens(availableScreens)
			const currentIndex = availableScreens.findIndex((screen) =>
				sameScreen(screen, details.currentScreen),
			)
			preferredScreenRef.current = availableScreens.findIndex(
				(screen) => !sameScreen(screen, details.currentScreen),
			)
			hasExternalScreenRef.current = preferredScreenRef.current >= 0
			if (preferredScreenRef.current < 0) preferredScreenRef.current = 0
			setSelectedScreen(currentIndex >= 0 ? currentIndex : 0)
			return availableScreens
		} catch {
			if (isCancelled?.()) return []
			setScreens([])
			screensRef.current = []
			hasExternalScreenRef.current = false
			return []
		}
	}, [])

	const moveToScreen = useCallback(
		async (
			screenIndex: number,
			options?: { attemptFullscreen?: boolean; isCancelled?: () => boolean },
		) => {
			const screen = screensRef.current[screenIndex]
			const popup = popupRef.current
			if (!screen || !isOpenWindow(popup) || options?.isCancelled?.()) return false
			setSelectedScreen(screenIndex)
			const bounds = screenBounds(screen)
			const popupDocument = popup.document as PresenterDocument
			if (popupDocument.fullscreenElement && popupDocument.exitFullscreen) {
				try {
					await popupDocument.exitFullscreen()
				} catch {
					// A denied exit should not stop the best-effort window move below.
				}
				if (
					options?.isCancelled?.() ||
					popupRef.current !== popup ||
					!isOpenWindow(popup)
				) {
					return false
				}
			}
			try {
				popup.moveTo(bounds.left, bounds.top)
				popup.resizeTo(bounds.width, bounds.height)
			} catch {
				// Moving/resizing can be denied independently of fullscreen.
			}

			// Switching displays intentionally leaves a local CTA: only a click inside
			// the popup has reliable activation for restoring fullscreen.
			setFullscreenButtonVisible(true)
			const requestFullscreen = popupDocument.documentElement?.requestFullscreen
			if (options?.attemptFullscreen && requestFullscreen) {
				try {
					await requestFullscreen.call(popupDocument.documentElement, { screen })
					if (
						options.isCancelled?.() ||
						popupRef.current !== popup ||
						!isOpenWindow(popup)
					) {
						return false
					}
					setFullscreenButtonVisible(false)
				} catch {
					if (
						options.isCancelled?.() ||
						popupRef.current !== popup ||
						!isOpenWindow(popup)
					) {
						return false
					}
					setFullscreenButtonVisible(true)
				}
			}
			return true
		},
		[setFullscreenButtonVisible],
	)

	const open = useCallback(
		async (
			payload: PPTPresenterSlidePayload,
			screenIndex?: number,
		): Promise<PPTPresenterOpenResult> => {
			const operationGeneration = ++operationGenerationRef.current
			if (fallbackOnlyRef.current) return "fallback"
			// Unsupported browsers immediately use the existing single-window fullscreen.
			if (!(window as WindowWithManagement).getScreenDetails) {
				tripFallbackBreaker()
				return "fallback"
			}
			latestPayloadRef.current = payload
			let popup = popupRef.current
			if (!isOpenWindow(popup)) {
				// Keep this before the first await so popup creation retains user activation.
				popup = window.open("", popupNameRef.current, "popup,width=1280,height=720")
				if (!popup) {
					tripFallbackBreaker()
					return "fallback"
				}
				try {
					popup.document.open()
					popup.document.write(POPUP_SHELL)
					popup.document.close()
				} catch {
					popup.close?.()
					tripFallbackBreaker()
					return "fallback"
				}
				popupRef.current = popup
				const presenterPopup = popup
				const popupDocument = presenterPopup.document as PresenterDocument
				const frame = popupDocument.getElementById(
					"ppt-presenter-frame",
				) as HTMLIFrameElement | null
				const fullscreenButton = popupDocument.getElementById(
					"ppt-presenter-fullscreen",
				) as HTMLButtonElement | null
				if (!frame || !fullscreenButton) {
					presenterPopup.close?.()
					clearPopup()
					tripFallbackBreaker()
					return "fallback"
				}
				fullscreenButtonRef.current = fullscreenButton
				frameRef.current = frame
				presenterPopup.document.title = t("ppt.presenter.title")
				frame.title = t("ppt.presenter.frameTitle")
				fullscreenButton.textContent = t("ppt.presenter.enterFullscreen")
				fullscreenButton.setAttribute("aria-label", t("ppt.presenter.enterFullscreen"))
				setFullscreenButtonVisible(true)

				const opener = window
				const handleSlideMessage = (event: MessageEvent) => {
					if (
						event.origin !== opener.location.origin ||
						event.source !== opener ||
						event.data?.type !== "ppt-presenter:slide"
					)
						return
					const nextPayload = event.data.payload
					if (
						!nextPayload ||
						typeof nextPayload.html !== "string" ||
						!Number.isInteger(nextPayload.index)
					)
						return
					slideDimensionsRef.current = nextPayload.dimensions
					applySlideLayout(presenterPopup, frame, nextPayload.dimensions)
					frame.srcdoc = nextPayload.html
					presenterPopup.document.title = t("ppt.presenter.slideTitle", {
						page: nextPayload.index + 1,
					})
				}
				const syncFullscreenButton = () =>
					setFullscreenButtonVisible(!popupDocument.fullscreenElement)
				const handleLocalFullscreen = () => {
					const requestFullscreen = popupDocument.documentElement?.requestFullscreen
					if (!requestFullscreen) return
					try {
						const request = requestFullscreen.call(popupDocument.documentElement)
						void Promise.resolve(request).then(
							() => setFullscreenButtonVisible(false),
							() => setFullscreenButtonVisible(true),
						)
					} catch {
						setFullscreenButtonVisible(true)
					}
				}
				const handlePopupResize = () =>
					applySlideLayout(presenterPopup, frame, slideDimensionsRef.current)
				presenterPopup.addEventListener("message", handleSlideMessage)
				popupDocument.addEventListener("fullscreenchange", syncFullscreenButton)
				fullscreenButton.addEventListener("click", handleLocalFullscreen)
				presenterPopup.addEventListener("resize", handlePopupResize)
				popupCleanupRef.current = () => {
					presenterPopup.removeEventListener("message", handleSlideMessage)
					popupDocument.removeEventListener("fullscreenchange", syncFullscreenButton)
					fullscreenButton.removeEventListener("click", handleLocalFullscreen)
					presenterPopup.removeEventListener("resize", handlePopupResize)
				}
				setIsOpen(true)
				pollRef.current = window.setInterval(() => {
					if (!isOpenWindow(popupRef.current)) clearPopup()
				}, POLL_INTERVAL)
			}

			const openedPopup = popup
			const isCancelled = () =>
				operationGenerationRef.current !== operationGeneration ||
				popupRef.current !== openedPopup ||
				!isOpenWindow(openedPopup)
			const availableScreens = await enumerateScreens(isCancelled)
			if (isCancelled()) return "cancelled"
			if (availableScreens.length < 2 || !hasExternalScreenRef.current) {
				popupRef.current?.close?.()
				clearPopup()
				tripFallbackBreaker()
				return "fallback"
			}
			const targetIndex = Math.min(
				screenIndex ?? selectedScreen ?? preferredScreenRef.current,
				availableScreens.length - 1,
			)
			const moved = await moveToScreen(targetIndex, {
				attemptFullscreen: true,
				isCancelled,
			})
			if (isCancelled()) return "cancelled"
			if (!moved) {
				popupRef.current?.close?.()
				clearPopup()
				tripFallbackBreaker()
				return "fallback"
			}
			// The console can navigate while screen permission or fullscreen is pending.
			// Finish with the most recent slide instead of replaying the opening slide.
			const posted = post(latestPayloadRef.current ?? payload)
			if (isCancelled()) return "cancelled"
			if (!posted) {
				tripFallbackBreaker()
				return "fallback"
			}
			// Keep keyboard navigation with the presenter console after positioning
			// the audience window; its sandboxed slide cannot forward keyboard events.
			window.focus()
			return "opened"
		},
		[
			clearPopup,
			enumerateScreens,
			moveToScreen,
			post,
			selectedScreen,
			setFullscreenButtonVisible,
			t,
			tripFallbackBreaker,
		],
	)

	const close = useCallback(() => {
		popupRef.current?.close?.()
		clearPopup()
	}, [clearPopup])

	useEffect(() => () => close(), [close])

	return {
		isOpen,
		isFallbackOnly,
		screens,
		selectedScreen,
		open,
		post,
		close,
		enumerateScreens,
		moveToScreen,
	}
}
