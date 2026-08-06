import { useLayoutEffect, useState, type RefObject } from "react"
import styles from "./MicroAppKeyboardCable.module.css"

interface Point {
	x: number
	y: number
}

interface CableGeometry {
	path: string
	compact: boolean
	end: Point
}

interface MicroAppKeyboardCableProps {
	containerRef: RefObject<HTMLElement | null>
	startRef: RefObject<HTMLElement | null>
	endRef: RefObject<HTMLElement | null>
	active?: boolean
	ready?: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value))
}

function buildCablePath(start: Point, end: Point, containerWidth: number): CableGeometry | null {
	const verticalDistance = end.y - start.y
	if (verticalDistance < 56) return null

	const scale = clamp(containerWidth / 1280, 0.76, 1)
	const compact = scale < 0.9 || verticalDistance < 112
	if (compact) {
		return {
			compact: true,
			end,
			path: [
				`M ${start.x} ${start.y}`,
				`C ${start.x - 14 * scale} ${start.y + 18 * scale}, ${end.x - 70 * scale} ${end.y - 48 * scale}, ${end.x - 38 * scale} ${end.y - 34 * scale}`,
				`C ${end.x - 17 * scale} ${end.y - 25 * scale}, ${end.x} ${end.y - 8 * scale}, ${end.x} ${end.y + 5}`,
			].join(" "),
		}
	}

	const radiusX = 43 * scale
	const radiusY = 34 * scale
	const centerX = Math.max(28, Math.min(start.x - 92 * scale, end.x - 78 * scale))
	const centerY = start.y + Math.min(verticalDistance * 0.5, 70 * scale)

	return {
		compact: false,
		end,
		path: [
			`M ${start.x} ${start.y}`,
			`C ${start.x - 8 * scale} ${start.y + 15 * scale}, ${centerX + radiusX + 14 * scale} ${centerY - radiusY - 9 * scale}, ${centerX + radiusX} ${centerY - radiusY}`,
			`C ${centerX + radiusX * 0.35} ${centerY - radiusY - 8 * scale}, ${centerX - radiusX} ${centerY - radiusY * 0.68}, ${centerX - radiusX} ${centerY}`,
			`C ${centerX - radiusX} ${centerY + radiusY}, ${centerX + radiusX} ${centerY + radiusY}, ${centerX + radiusX} ${centerY}`,
			`C ${centerX + radiusX} ${centerY - radiusY * 0.72}, ${centerX - radiusX * 0.58} ${centerY - radiusY * 0.84}, ${centerX - radiusX * 0.6} ${centerY}`,
			`C ${centerX - radiusX * 0.62} ${centerY + radiusY * 0.58}, ${centerX + radiusX * 0.44} ${centerY + radiusY * 0.66}, ${centerX + radiusX * 0.56} ${centerY + 6 * scale}`,
			`C ${centerX + radiusX * 0.74} ${centerY + 8 * scale}, ${end.x - 26 * scale} ${end.y - 36 * scale}, ${end.x - 12 * scale} ${end.y - 25 * scale}`,
			`C ${end.x - 5 * scale} ${end.y - 18 * scale}, ${end.x} ${end.y - 8 * scale}, ${end.x} ${end.y + 5}`,
		].join(" "),
	}
}

export default function MicroAppKeyboardCable({
	containerRef,
	startRef,
	endRef,
	active = false,
	ready = true,
}: MicroAppKeyboardCableProps) {
	const [geometry, setGeometry] = useState<CableGeometry | null>(null)

	useLayoutEffect(() => {
		if (!ready) {
			setGeometry(null)
			return undefined
		}

		let frameId = 0
		const updateGeometry = () => {
			window.cancelAnimationFrame(frameId)
			frameId = window.requestAnimationFrame(() => {
				const container = containerRef.current
				const startElement = startRef.current
				const endElement = endRef.current
				if (!container || !startElement || !endElement) {
					setGeometry(null)
					return
				}

				const containerRect = container.getBoundingClientRect()
				const startRect = startElement.getBoundingClientRect()
				const endRect = endElement.getBoundingClientRect()
				const start = {
					x: startRect.right - containerRect.left - Math.min(6, startRect.width * 0.22),
					y: startRect.bottom - containerRect.top - Math.min(5, startRect.height * 0.12),
				}
				const end = {
					x: endRect.left - containerRect.left + endRect.width / 2,
					y: endRect.top - containerRect.top + endRect.height / 2,
				}
				setGeometry(buildCablePath(start, end, containerRect.width))
			})
		}

		updateGeometry()
		window.addEventListener("resize", updateGeometry)
		const resizeObserver =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateGeometry)
		if (containerRef.current) resizeObserver?.observe(containerRef.current)
		if (startRef.current) resizeObserver?.observe(startRef.current)
		if (endRef.current) resizeObserver?.observe(endRef.current)
		void document.fonts?.ready.then(updateGeometry)

		return () => {
			window.cancelAnimationFrame(frameId)
			window.removeEventListener("resize", updateGeometry)
			resizeObserver?.disconnect()
		}
	}, [containerRef, endRef, ready, startRef])

	return (
		<svg
			className={styles.heroCable}
			data-active={active}
			data-compact={geometry?.compact ?? false}
			data-testid="micro-apps-keyboard-cable"
			aria-hidden="true"
		>
			{geometry ? (
				<>
					<path className={styles.cableShadow} d={geometry.path} pathLength="1" />
					<path className={styles.cableBody} d={geometry.path} pathLength="1" />
					<path className={styles.cableHighlight} d={geometry.path} pathLength="1" />
					<g transform={`translate(${geometry.end.x} ${geometry.end.y})`}>
						<g className={styles.cablePlug}>
							<rect
								className={styles.cablePlugStem}
								x="-4"
								y="0"
								width="8"
								height="9"
								rx="3"
							/>
							<rect
								className={styles.cablePlugBody}
								x="-8"
								y="7"
								width="16"
								height="18"
								rx="4"
							/>
							<path className={styles.cablePlugHighlight} d="M -4 11 H 4" />
						</g>
					</g>
				</>
			) : null}
		</svg>
	)
}
