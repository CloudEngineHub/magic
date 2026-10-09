import { useEffect, useState } from "react"
import type { RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import { bindTouchPinch, type PinchPhase, type PinchPoint } from "../utils/touch-pinch"

export interface PinchAnchor {
	contentX: number
	contentY: number
	clientX: number
	clientY: number
}

interface TouchPinchZoomConfig {
	containerRef: RefObject<HTMLDivElement>
	iframeRef: RefObject<HTMLIFrameElement>
	enabled: boolean
	iframeReady: boolean
	scale: number
	onScaleChange: (scale: number, anchor: PinchAnchor) => void
}

export function useTouchPinchZoom(config: TouchPinchZoomConfig): boolean {
	const [isPinching, setIsPinching] = useState(false)
	const getScale = useMemoizedFn(() => config.scale)
	const changeScale = useMemoizedFn(config.onScaleChange)
	const { containerRef, iframeRef, enabled, iframeReady } = config

	useEffect(() => {
		const container = containerRef.current
		const iframe = iframeRef.current
		if (!container || !iframe) return
		let session: {
			source: "host" | "iframe"
			ids: number[]
			distance: number
			scale: number
			anchor: PinchAnchor
		} | null = null
		const handleGesture = (
			source: "host" | "iframe",
			phase: PinchPhase,
			points: PinchPoint[],
		) => {
			if (phase === "end") {
				if (session?.source === source) {
					session = null
					setIsPinching(false)
				}
				return
			}
			if (!enabled || points.length !== 2) return
			const rect = iframe.getBoundingClientRect()
			// Iframe touch coordinates are unscaled CSS pixels. Read actual geometry on every
			// event so a pending React render cannot feed the previous zoom back into the gesture.
			const physicalPoints =
				source === "host"
					? points
					: points.map((point) => ({
							...point,
							x: rect.left + point.x * (rect.width / iframe.clientWidth),
							y: rect.top + point.y * (rect.height / iframe.clientHeight),
						}))
			const [a, b] = physicalPoints
			const distance = Math.hypot(a.x - b.x, a.y - b.y)
			if (!Number.isFinite(distance) || distance <= 0) return
			const clientX = (a.x + b.x) / 2
			const clientY = (a.y + b.y) / 2
			if (phase === "start") {
				setIsPinching(true)
				const scale = getScale()
				session = {
					source,
					ids: points.map((point) => point.id),
					distance,
					scale,
					anchor: {
						contentX: (clientX - rect.left) / scale,
						contentY: (clientY - rect.top) / scale,
						clientX,
						clientY,
					},
				}
			} else if (
				session?.source === source &&
				points.every((point) => session?.ids.includes(point.id))
			) {
				changeScale((session.scale * distance) / session.distance, {
					...session.anchor,
					clientX,
					clientY,
				})
			}
		}
		let origin: string | undefined
		try {
			if (iframe.src) {
				const url = new URL(iframe.src, window.location.href)
				if (url.protocol === "https:" || url.protocol === "http:") origin = url.origin
			}
		} catch {
			// Frames without a concrete origin rely on direct same-origin listeners.
		}
		const sendState = (value: boolean) => {
			try {
				if (origin)
					iframe.contentWindow?.postMessage(
						{ type: "magic-preview-pinch-state", enabled: value },
						origin,
					)
			} catch {
				// A removed/navigating frame may no longer have a live browsing context.
			}
		}

		const handleMessage = (event: MessageEvent) => {
			if (event.source !== iframe.contentWindow || !origin || event.origin !== origin) return
			if (event.data?.type === "magic-preview-pinch-ready") {
				sendState(enabled)
				return
			}
			if (event.data?.type !== "magic-preview-pinch") return
			const { phase, points } = event.data
			if (phase === "end") {
				handleGesture("iframe", phase, [])
				return
			}
			if (phase !== "start" && phase !== "move") return
			if (!Array.isArray(points) || points.length !== 2 || points[0]?.id === points[1]?.id)
				return
			if (
				!points.every(
					(point) =>
						point &&
						Number.isFinite(point.id) &&
						Number.isFinite(point.x) &&
						Number.isFinite(point.y),
				)
			)
				return
			handleGesture("iframe", phase, points)
		}
		window.addEventListener("message", handleMessage)
		sendState(enabled)
		const unbind = enabled
			? bindTouchPinch(container, (phase, points) => handleGesture("host", phase, points))
			: undefined
		let unbindIframe: (() => void) | undefined
		if (enabled && iframeReady) {
			try {
				// Reading the document explicitly verifies access before installing listeners.
				if (iframe.contentWindow?.document) {
					unbindIframe = bindTouchPinch(iframe.contentWindow, (phase, points) =>
						handleGesture("iframe", phase, points),
					)
				}
			} catch {
				// The compiled iframe installer handles cross-origin documents.
			}
		}
		return () => {
			window.removeEventListener("message", handleMessage)
			sendState(false)
			unbind?.()
			unbindIframe?.()
			session = null
			setIsPinching(false)
		}
	}, [containerRef, iframeRef, enabled, iframeReady, getScale, changeScale])
	return enabled && isPinching
}
