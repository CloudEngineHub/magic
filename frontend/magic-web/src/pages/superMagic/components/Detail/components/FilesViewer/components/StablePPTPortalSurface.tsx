import type { ReactNode } from "react"
import { useCallback, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"

interface StablePPTPortalSurfaceProps {
	anchor: HTMLElement | null
	borderRadius: string
	children: ReactNode
	enabled: boolean
	isFullscreen: boolean
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
 * Keeps PPT TabCache nodes in one body Portal for their whole cached lifetime.
 * Only the host geometry changes between the embedded and viewer-fullscreen layouts.
 */
export default function StablePPTPortalSurface({
	anchor,
	borderRadius,
	children,
	enabled,
	isFullscreen,
	visible,
}: StablePPTPortalSurfaceProps) {
	const hostRef = useRef<HTMLDivElement | null>(null)
	if (!hostRef.current && typeof document !== "undefined") {
		const host = document.createElement("div")
		host.className = "fixed overflow-hidden bg-background"
		host.dataset.filesViewerPptPortal = "true"
		host.style.display = "none"
		host.style.pointerEvents = "none"
		host.style.visibility = "hidden"
		hostRef.current = host
	}
	const host = hostRef.current
	const lifecycleRef = useRef({ generation: 0 })
	const layoutSignatureRef = useRef("")

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
				? `${rect.top}|${rect.left}|${rect.width}|${rect.height}|${isFullscreen}|${borderRadius}`
				: `hidden|${isFullscreen}|${borderRadius}`
		if (layoutSignatureRef.current === layoutSignature) return
		layoutSignatureRef.current = layoutSignature

		host.style.pointerEvents = isVisible ? "auto" : "none"
		host.style.display = isVisible ? "block" : "none"
		host.style.visibility = isVisible ? "visible" : "hidden"
		host.style.zIndex = isFullscreen ? "calc(var(--z-index-detail-fullscreen) + 1)" : "10"
		host.style.borderRadius = borderRadius

		if (!isVisible || !rect) return

		host.style.top = `${rect.top}px`
		host.style.right = "auto"
		host.style.bottom = "auto"
		host.style.left = `${rect.left}px`
		host.style.width = `${rect.width}px`
		host.style.height = `${rect.height}px`
	}, [anchor, borderRadius, host, isFullscreen, visible])

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
	}, [anchor, host, syncSurface, visible])

	return enabled && host ? createPortal(children, host, "files-viewer-stable-ppt-tabs") : null
}
