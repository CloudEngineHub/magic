import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Camera, Loader2 } from "lucide-react"
import type { InspectedElementRect } from "./types"

interface ScreenshotSelectionOverlayProps {
	containerWidth: number
	containerHeight: number
	/** Optional drawable area in the overlay's layout coordinate system. */
	selectionBounds?: {
		left: number
		top: number
		width: number
		height: number
	}
	onCapture: (rect: InspectedElementRect) => Promise<void>
	onCaptureStateChange?: (capturing: boolean) => void
}

/** Captures a rectangle drawn over the rendered HTML without blocking element mode. */
export function ScreenshotSelectionOverlay({
	containerWidth,
	containerHeight,
	selectionBounds,
	onCapture,
	onCaptureStateChange,
}: ScreenshotSelectionOverlayProps) {
	const { t } = useTranslation("super")
	const [selection, setSelection] = useState<InspectedElementRect | null>(null)
	const [isCapturing, setIsCapturing] = useState(false)
	const [captureError, setCaptureError] = useState<string | null>(null)
	const startPointRef = useRef<{ left: number; top: number } | null>(null)

	const getSelectionRect = (
		start: { left: number; top: number },
		end: { left: number; top: number },
	): InspectedElementRect => ({
		left: Math.min(start.left, end.left),
		top: Math.min(start.top, end.top),
		width: Math.abs(end.left - start.left),
		height: Math.abs(end.top - start.top),
	})

	const drawableArea = selectionBounds ?? {
		left: 0,
		top: 0,
		width: containerWidth,
		height: containerHeight,
	}

	const getRawPoint = (event: React.PointerEvent<HTMLDivElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect()
		const maxWidth = containerWidth > 0 ? containerWidth : bounds.width
		const maxHeight = containerHeight > 0 ? containerHeight : bounds.height
		// Pointer coordinates are reported in visual pixels, while the overlay
		// styles use its layout coordinate system. Convert back when an ancestor
		// (for example the phone/PPT preview shell) is scaled.
		const scaleX = bounds.width > 0 && maxWidth > 0 ? bounds.width / maxWidth : 1
		const scaleY = bounds.height > 0 && maxHeight > 0 ? bounds.height / maxHeight : 1
		return {
			left:
				maxWidth > 0 ? (event.clientX - bounds.left) / scaleX : event.clientX - bounds.left,
			top: maxHeight > 0 ? (event.clientY - bounds.top) / scaleY : event.clientY - bounds.top,
		}
	}

	const getPoint = (event: React.PointerEvent<HTMLDivElement>) => {
		const rawPoint = getRawPoint(event)
		return {
			left: Math.max(
				drawableArea.left,
				Math.min(drawableArea.left + drawableArea.width, rawPoint.left),
			),
			top: Math.max(
				drawableArea.top,
				Math.min(drawableArea.top + drawableArea.height, rawPoint.top),
			),
		}
	}

	const isPointInDrawableArea = (point: { left: number; top: number }) =>
		point.left >= drawableArea.left &&
		point.left <= drawableArea.left + drawableArea.width &&
		point.top >= drawableArea.top &&
		point.top <= drawableArea.top + drawableArea.height

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (isCapturing) return
		const rawPoint = getRawPoint(event)
		if (!isPointInDrawableArea(rawPoint)) return
		const point = getPoint(event)
		event.currentTarget.setPointerCapture?.(event.pointerId)
		startPointRef.current = point
		setSelection({ left: point.left, top: point.top, width: 0, height: 0 })
	}

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const start = startPointRef.current
		if (!start || isCapturing) return
		const point = getPoint(event)
		setSelection(getSelectionRect(start, point))
	}

	const captureSelection = async (rect: InspectedElementRect) => {
		if (isCapturing) return
		if (rect.width < 12 || rect.height < 12) {
			setSelection(null)
			return
		}

		setSelection(rect)
		setCaptureError(null)
		setIsCapturing(true)
		onCaptureStateChange?.(true)
		try {
			await new Promise<void>((resolve) => {
				if (typeof requestAnimationFrame === "function") {
					requestAnimationFrame(() => resolve())
					return
				}
				setTimeout(resolve, 0)
			})
			await onCapture(rect)
			setSelection(null)
		} catch (error) {
			console.warn("HTML screenshot capture failed", error)
			setCaptureError(t("stylePanel.inspector.screenshotCaptureFailed"))
		} finally {
			setIsCapturing(false)
			onCaptureStateChange?.(false)
		}
	}

	const handlePointerUp = async (event: React.PointerEvent<HTMLDivElement>) => {
		const start = startPointRef.current
		if (!start || isCapturing) return
		startPointRef.current = null
		await captureSelection(getSelectionRect(start, getPoint(event)))
	}

	const handleKeyDown = async (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (isCapturing || (event.key !== "Enter" && event.key !== " ")) return
		event.preventDefault()
		await captureSelection(drawableArea)
	}

	return (
		<div
			className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair bg-black/15"
			tabIndex={0}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onKeyDown={handleKeyDown}
			role="button"
			aria-label={t("stylePanel.inspector.screenshotHint")}
			data-testid="html-screenshot-selection-overlay"
			data-capturing={isCapturing ? "true" : "false"}
			style={{ visibility: isCapturing ? "hidden" : undefined }}
		>
			<div
				className="absolute flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg"
				style={{
					left: drawableArea.left + drawableArea.width / 2,
					top: Math.max(4, drawableArea.top + 16),
				}}
			>
				{isCapturing ? (
					<Loader2 size={13} className="animate-spin" />
				) : (
					<Camera size={13} />
				)}
				{t("stylePanel.inspector.screenshotHint")}
			</div>
			{captureError && (
				<div className="absolute left-1/2 top-14 max-w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground shadow-lg">
					{captureError}
				</div>
			)}
			{selection && selection.width > 0 && selection.height > 0 && (
				<div
					className="pointer-events-none absolute border-2 border-primary bg-primary/10"
					data-testid="html-screenshot-selection-box"
					style={{
						left: selection.left,
						top: selection.top,
						width: selection.width,
						height: selection.height,
					}}
				/>
			)}
		</div>
	)
}
