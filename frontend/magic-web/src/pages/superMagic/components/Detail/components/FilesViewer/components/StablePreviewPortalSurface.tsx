import type { ReactNode } from "react"
import { useCallback, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { HTML_EDITOR_Z_INDEX } from "../../../contents/HTML/constants/z-index"

const PPT_VIEWPORT_SELECTOR =
	'[data-presenter-console="true"], [data-mobile-fullscreen="landscape"]'

interface StablePreviewPortalSurfaceProps {
	anchor: HTMLElement | null
	borderRadius?: string
	children: ReactNode
	enabled: boolean
	isFullscreen: boolean
	isPpt?: boolean
	visible: boolean
}

function isAnchorTreeVisible(anchor: HTMLElement): boolean {
	if (anchor.closest("[hidden]")) return false
	if (window.getComputedStyle(anchor).visibility !== "visible") return false

	let current: HTMLElement | null = anchor
	while (current) {
		const inlineOpacity = current.style.opacity
		if (
			current.style.display === "none" ||
			(inlineOpacity !== "" && Number(inlineOpacity) === 0)
		)
			return false
		current = current.parentElement
	}

	return true
}

/**
 * Keeps preview content in one body Portal for its whole cached lifetime.
 * Only the host geometry changes, so fullscreen does not recreate iframe-backed renderers.
 */
export default function StablePreviewPortalSurface({
	anchor,
	borderRadius = "0px",
	children,
	enabled,
	isFullscreen,
	isPpt = false,
	visible,
}: StablePreviewPortalSurfaceProps) {
	const hostRef = useRef<HTMLDivElement | null>(null)
	if (!hostRef.current && typeof document !== "undefined") {
		const host = document.createElement("div")
		host.className = "fixed overflow-hidden bg-background"
		host.dataset.filesViewerPreviewPortal = "true"
		if (isPpt) host.dataset.filesViewerPptPortal = "true"
		host.style.display = "none"
		host.style.pointerEvents = "none"
		host.style.visibility = "hidden"
		hostRef.current = host
	}
	const host = hostRef.current
	const lifecycleRef = useRef({ generation: 0 })
	const layoutSignatureRef = useRef("")
	const pptViewportRef = useRef(false)

	// Delay removal so React StrictMode's effect replay cannot detach iframe-backed content.
	useLayoutEffect(() => {
		const lifecycle = lifecycleRef.current
		const generation = ++lifecycle.generation
		if (!host) return

		if (!enabled) {
			host.remove()
			return
		}

		if (host.parentNode !== document.body) document.body.appendChild(host)

		return () => {
			queueMicrotask(() => {
				if (lifecycle.generation === generation) host.remove()
			})
		}
	}, [enabled, host])

	const syncSurface = useCallback(() => {
		if (!host) return

		const rect = anchor?.getBoundingClientRect()
		const usesViewport = pptViewportRef.current
		const isVisible = Boolean(
			visible &&
			anchor &&
			isAnchorTreeVisible(anchor) &&
			rect &&
			rect.width > 0 &&
			rect.height > 0,
		)
		const layoutSignature =
			isVisible && rect
				? `${rect.top}|${rect.left}|${rect.width}|${rect.height}|${isFullscreen}|${borderRadius}|${isPpt}|${usesViewport}|${window.innerWidth}|${window.innerHeight}`
				: `hidden|${isFullscreen}|${borderRadius}|${isPpt}`
		if (layoutSignatureRef.current === layoutSignature) return
		layoutSignatureRef.current = layoutSignature

		host.style.pointerEvents = isVisible ? "auto" : "none"
		host.style.display = isVisible ? "block" : "none"
		host.style.visibility = isVisible ? "visible" : "hidden"
		host.style.borderRadius = usesViewport ? "0px" : borderRadius
		if (isPpt) host.dataset.filesViewerPptPortal = "true"
		else delete host.dataset.filesViewerPptPortal
		// The fullscreen viewer shell has the base fullscreen z-index and a white background.
		// Keep the iframe surface one layer above it so the shell cannot cover the preview.
		host.style.zIndex = isFullscreen
			? "calc(var(--z-index-detail-fullscreen) + 1)"
			: usesViewport
				? String(HTML_EDITOR_Z_INDEX.FULLSCREEN.CONTAINER)
				: "10"

		if (!isVisible || !rect) return

		host.style.top = usesViewport ? "0px" : `${rect.top}px`
		host.style.right = "auto"
		host.style.bottom = "auto"
		host.style.left = usesViewport ? "0px" : `${rect.left}px`
		host.style.width = `${usesViewport ? window.innerWidth : rect.width}px`
		host.style.height = `${usesViewport ? window.innerHeight : rect.height}px`
	}, [anchor, borderRadius, host, isFullscreen, isPpt, visible])

	useLayoutEffect(() => {
		if (!host || !enabled) return
		const syncPptViewport = () => {
			pptViewportRef.current = Boolean(host.querySelector(PPT_VIEWPORT_SELECTOR))
			syncSurface()
		}
		// A fixed child cannot escape this host's stacking context. Promote the same
		// host for PPT-owned fullscreen modes, retaining all iframe/editor instances.
		const observer = new MutationObserver((records) => {
			const relevant = records.some(
				(record) =>
					record.type === "attributes" ||
					[...record.addedNodes, ...record.removedNodes].some(
						(node) =>
							node instanceof Element &&
							(node.matches(PPT_VIEWPORT_SELECTOR) ||
								Boolean(node.querySelector(PPT_VIEWPORT_SELECTOR))),
					),
			)
			if (relevant) syncPptViewport()
		})
		observer.observe(host, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["data-presenter-console", "data-mobile-fullscreen"],
		})
		syncPptViewport()
		return () => observer.disconnect()
	}, [enabled, host, syncSurface])

	useLayoutEffect(() => {
		syncSurface()
		if (!anchor || !visible) return

		let animationFrame = 0
		const scheduleSync = () => {
			if (animationFrame) return
			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = 0
				syncSurface()
			})
		}
		const handleDocumentScroll = (event: Event) => {
			if (host && event.target instanceof Node && host.contains(event.target)) return
			scheduleSync()
		}

		const resizeObserver =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync)
		resizeObserver?.observe(anchor)
		document.addEventListener("scroll", handleDocumentScroll, {
			capture: true,
			passive: true,
		})
		document.addEventListener("transitionend", scheduleSync, true)
		document.addEventListener("transitioncancel", scheduleSync, true)
		window.addEventListener("resize", scheduleSync, { passive: true })
		window.visualViewport?.addEventListener("resize", scheduleSync)
		window.visualViewport?.addEventListener("scroll", scheduleSync)

		return () => {
			resizeObserver?.disconnect()
			document.removeEventListener("scroll", handleDocumentScroll, true)
			document.removeEventListener("transitionend", scheduleSync, true)
			document.removeEventListener("transitioncancel", scheduleSync, true)
			window.removeEventListener("resize", scheduleSync)
			window.visualViewport?.removeEventListener("resize", scheduleSync)
			window.visualViewport?.removeEventListener("scroll", scheduleSync)
			if (animationFrame) window.cancelAnimationFrame(animationFrame)
		}
	}, [anchor, enabled, host, syncSurface, visible])

	return enabled && host ? createPortal(children, host, "files-viewer-stable-preview") : null
}
